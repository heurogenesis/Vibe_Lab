import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { STORE_VERSION, type LearningState, type MultiUserState, type StoredUser, type User } from '../shared/schema.js';
export const emptyState = (): LearningState => ({ profile: null, assignments: [], messages: [] });
export const emptyDirectory = (): MultiUserState => ({ version: STORE_VERSION, users: [], workspaces: {} });
export class UnknownUserError extends Error { constructor() { super('알 수 없는 사용자입니다.'); this.name = 'UnknownUserError'; } }
export class DuplicateHandleError extends Error { constructor() { super('이미 사용 중인 아이디입니다.'); this.name = 'DuplicateHandleError'; } }
const normalizeHandle = (handle: string) => handle.trim().toLowerCase();
// Password hashes stay inside the store. Everything that leaves it is the public shape.
const toPublic = ({ id, handle, displayName, createdAt }: StoredUser): User => ({ id, handle, displayName, createdAt });
// One learner's workspace. Route handlers only ever receive this, so they stay unaware of who the learner is.
export interface Store { mode: 'postgresql' | 'demo-file'; read(): Promise<LearningState>; update<T>(mutate: (state: LearningState) => T): Promise<T>; close(): Promise<void> }
// The user directory plus a way to scope a Store to one of them. Identity is resolved in server/identity.ts and
// never here: this layer trusts the userId it is handed. See docs/MULTI_USER_DESIGN.md.
export interface UserStore {
  mode: 'postgresql' | 'demo-file';
  // Present only on the PostgreSQL implementation. server/auth.ts uses it to keep sessions in the same
  // database as the learners, so a restart (or a second instance behind a load balancer) does not sign
  // everyone out. The file store has no pool and falls back to the in-memory session store.
  pool?: Pool;
  countUsers(): Promise<number>;
  findUser(userId: string): Promise<User | null>;
  isHandleTaken(handle: string): Promise<boolean>;
  // The only method that exposes a password hash; used by the login strategy and nothing else.
  findCredentials(handle: string): Promise<StoredUser | null>;
  createUser(input: { handle: string; displayName: string; passwordHash: string }): Promise<User>;
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
  countUsers() { return this.run(state => state.users.length, false); }
  findUser(userId: string) { return this.run(state => { const found = state.users.find(u => u.id === userId); return found ? toPublic(found) : null; }, false); }
  isHandleTaken(handle: string) { const wanted = normalizeHandle(handle); return this.run(state => state.users.some(u => u.handle === wanted), false); }
  findCredentials(handle: string) { const wanted = normalizeHandle(handle); return this.run(state => state.users.find(u => u.handle === wanted) || null, false); }
  createUser(input: { handle: string; displayName: string; passwordHash: string }) {
    const handle = normalizeHandle(input.handle);
    return this.run(state => {
      // The uniqueness check and the insert share one queued operation, so two signups cannot race here.
      if (state.users.some(u => u.handle === handle)) throw new DuplicateHandleError();
      const user: StoredUser = { id: randomUUID(), handle, displayName: input.displayName.trim(), createdAt: new Date().toISOString(), passwordHash: input.passwordHash };
      state.users.push(user); state.workspaces[user.id] = emptyState();
      return toPublic(user);
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
const toUser = (row: { id: string; handle: string; display_name: string; created_at: string | Date; password_hash?: string }): StoredUser =>
  ({ id: row.id, handle: row.handle, displayName: row.display_name, createdAt: new Date(row.created_at).toISOString(), passwordHash: row.password_hash || '' });
export class PostgresUserStore implements UserStore {
  mode = 'postgresql' as const;
  constructor(readonly pool: Pool) {}
  async countUsers(): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM learning_users');
    return result.rows[0]?.count ?? 0;
  }
  async findUser(userId: string): Promise<User | null> {
    const result = await this.pool.query('SELECT id, handle, display_name, created_at FROM learning_users WHERE id = $1', [userId]);
    return result.rows[0] ? toPublic(toUser(result.rows[0])) : null;
  }
  async isHandleTaken(handle: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM learning_users WHERE handle = $1', [normalizeHandle(handle)]);
    return result.rows.length > 0;
  }
  async findCredentials(handle: string): Promise<StoredUser | null> {
    const result = await this.pool.query('SELECT id, handle, display_name, created_at, password_hash FROM learning_users WHERE handle = $1', [normalizeHandle(handle)]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }
  async createUser(input: { handle: string; displayName: string; passwordHash: string }): Promise<User> {
    const user: StoredUser = { id: randomUUID(), handle: normalizeHandle(input.handle), displayName: input.displayName.trim(), createdAt: new Date().toISOString(), passwordHash: input.passwordHash };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The UNIQUE constraint on handle is the real guard: it rejects a duplicate even under concurrent signups.
      await client.query('INSERT INTO learning_users (id, handle, display_name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [user.id, user.handle, user.displayName, user.passwordHash, user.createdAt]);
      await client.query('INSERT INTO learning_workspaces (id, data) VALUES ($1, $2::jsonb)', [user.id, JSON.stringify(emptyState())]);
      await client.query('COMMIT');
      return toPublic(user);
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
