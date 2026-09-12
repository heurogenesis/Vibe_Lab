import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { STORE_VERSION, type LearningState, type MultiUserState, type User } from '../shared/schema.js';
export const emptyState = (): LearningState => ({ profile: null, assignments: [], messages: [] });
export const emptyDirectory = (): MultiUserState => ({ version: STORE_VERSION, users: [], workspaces: {} });
export class UnknownUserError extends Error { constructor() { super('알 수 없는 사용자입니다.'); this.name = 'UnknownUserError'; } }
export class DuplicateHandleError extends Error { constructor() { super('이미 사용 중인 아이디입니다.'); this.name = 'DuplicateHandleError'; } }
const normalizeHandle = (handle: string) => handle.trim().toLowerCase();
// One learner's workspace. Route handlers only ever receive this, so they stay unaware of who the learner is.
export interface Store { mode: 'postgresql' | 'demo-file'; read(): Promise<LearningState>; update<T>(mutate: (state: LearningState) => T): Promise<T>; close(): Promise<void> }
// The user directory plus a way to scope a Store to one of them. Identity is resolved in server/identity.ts and
// never here: this layer trusts the userId it is handed. See docs/MULTI_USER_DESIGN.md.
export interface UserStore {
  mode: 'postgresql' | 'demo-file';
  listUsers(): Promise<User[]>;
  findUser(userId: string): Promise<User | null>;
  findByHandle(handle: string): Promise<User | null>;
  createUser(input: { handle: string; displayName: string }): Promise<User>;
  forUser(userId: string): Store;
  close(): Promise<void>;
}
export class FileUserStore implements UserStore {
  mode = 'demo-file' as const;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) { this.file = resolve(file); }
  private async load(): Promise<MultiUserState> {
    let raw: string;
    try { raw = await readFile(this.file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDirectory(); throw error; }
    const data = JSON.parse(raw) as Partial<MultiUserState>;
    if (data && data.version === STORE_VERSION && Array.isArray(data.users) && data.workspaces) return data as MultiUserState;
    // A pre-multi-user file. Keep it as a timestamped backup and start clean (decision 2026-09-12, docs/MULTI_USER_DESIGN.md).
    const backup = `${this.file.replace(/\.json$/i, '')}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await rename(this.file, backup);
    console.warn(`Single-learner data moved to ${backup}. Starting an empty multi-user workspace.`);
    return emptyDirectory();
  }
  private async persist(state: MultiUserState) {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(state, null, 2), 'utf8');
    await rename(this.file + '.tmp', this.file);
  }
  // Every read and write passes through one queue so concurrent requests cannot interleave load and save.
  private run<T>(task: (state: MultiUserState) => T, write: boolean): Promise<T> {
    const operation = this.queue.then(async () => {
      const state = await this.load();
      const result = task(state);
      if (write) await this.persist(state);
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  listUsers() { return this.run(state => state.users.slice(), false); }
  findUser(userId: string) { return this.run(state => state.users.find(u => u.id === userId) || null, false); }
  findByHandle(handle: string) { const wanted = normalizeHandle(handle); return this.run(state => state.users.find(u => u.handle === wanted) || null, false); }
  createUser(input: { handle: string; displayName: string }) {
    const handle = normalizeHandle(input.handle);
    return this.run(state => {
      if (state.users.some(u => u.handle === handle)) throw new DuplicateHandleError();
      const user: User = { id: randomUUID(), handle, displayName: input.displayName.trim(), createdAt: new Date().toISOString() };
      state.users.push(user); state.workspaces[user.id] = emptyState();
      return user;
    }, true);
  }
  forUser(userId: string): Store {
    const owner = this;
    const requireWorkspace = (state: MultiUserState) => {
      if (!state.users.some(u => u.id === userId)) throw new UnknownUserError();
      return state.workspaces[userId] || (state.workspaces[userId] = emptyState());
    };
    return {
      mode: owner.mode,
      read: () => owner.run(requireWorkspace, false),
      update: <T>(mutate: (state: LearningState) => T) => owner.run(state => mutate(requireWorkspace(state)), true),
      // The scoped view borrows the owner's resources; the lifecycle stays with the UserStore.
      close: async () => {},
    };
  }
  async close() { await this.queue; }
}
// One row per learner workspace (id = user id) plus a directory table. A row lock serializes updates across
// connections without holding a transaction open during external API calls.
// Requires the learning_users table from db/001_initial.sql; see docs/MULTI_USER_DESIGN.md (S5).
const toUser = (row: { id: string; handle: string; display_name: string; created_at: string | Date }): User =>
  ({ id: row.id, handle: row.handle, displayName: row.display_name, createdAt: new Date(row.created_at).toISOString() });
export class PostgresUserStore implements UserStore {
  mode = 'postgresql' as const;
  constructor(private pool: Pool) {}
  async listUsers(): Promise<User[]> {
    const result = await this.pool.query('SELECT id, handle, display_name, created_at FROM learning_users ORDER BY created_at');
    return result.rows.map(toUser);
  }
  async findUser(userId: string): Promise<User | null> {
    const result = await this.pool.query('SELECT id, handle, display_name, created_at FROM learning_users WHERE id = $1', [userId]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }
  async findByHandle(handle: string): Promise<User | null> {
    const result = await this.pool.query('SELECT id, handle, display_name, created_at FROM learning_users WHERE handle = $1', [normalizeHandle(handle)]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }
  async createUser(input: { handle: string; displayName: string }): Promise<User> {
    const user: User = { id: randomUUID(), handle: normalizeHandle(input.handle), displayName: input.displayName.trim(), createdAt: new Date().toISOString() };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO learning_users (id, handle, display_name, created_at) VALUES ($1, $2, $3, $4)', [user.id, user.handle, user.displayName, user.createdAt]);
      await client.query('INSERT INTO learning_workspaces (id, data) VALUES ($1, $2::jsonb)', [user.id, JSON.stringify(emptyState())]);
      await client.query('COMMIT');
      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new DuplicateHandleError();
      throw error;
    } finally { client.release(); }
  }
  forUser(userId: string): Store {
    const pool = this.pool;
    return {
      mode: this.mode,
      async read(): Promise<LearningState> {
        const result = await pool.query('SELECT data FROM learning_workspaces WHERE id = $1', [userId]);
        if (!result.rows[0]) throw new UnknownUserError();
        return result.rows[0].data;
      },
      async update<T>(mutate: (state: LearningState) => T): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await client.query('SELECT data FROM learning_workspaces WHERE id = $1 FOR UPDATE', [userId]);
          if (!result.rows[0]) throw new UnknownUserError();
          const state = result.rows[0].data as LearningState;
          const value = mutate(state);
          await client.query('UPDATE learning_workspaces SET data = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(state), userId]);
          await client.query('COMMIT');
          return value;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: async () => {},
    };
  }
  async close() { await this.pool.end(); }
}
