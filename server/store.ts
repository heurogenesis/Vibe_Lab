import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';
import type { LearningState } from '../shared/schema.js';
export const emptyState = (): LearningState => ({ profile: null, assignments: [], messages: [] });
export interface Store { mode: 'postgresql' | 'demo-file'; read(): Promise<LearningState>; update<T>(mutate: (state: LearningState) => T): Promise<T>; close(): Promise<void> }
export class FileStore implements Store {
  mode = 'demo-file' as const;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) { this.file = resolve(file); }
  async read(): Promise<LearningState> {
    await this.queue;
    return this.load();
  }
  private async load(): Promise<LearningState> {
    try { return JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw error; }
  }
  update<T>(mutate: (state: LearningState) => T): Promise<T> {
    const operation = this.queue.then(async () => {
      const state = await this.load(); const result = mutate(state);
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file + '.tmp', JSON.stringify(state, null, 2), 'utf8');
      await rename(this.file + '.tmp', this.file);
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async close() { await this.queue; }
}
// One local workspace aggregate. JSONB retains generated curriculum versions and profile snapshots.
// A row lock serializes updates across connections without holding a transaction during external API calls.
export class PostgresStore implements Store {
  mode = 'postgresql' as const;
  constructor(private pool: Pool) {}
  async read(): Promise<LearningState> {
    const result = await this.pool.query('SELECT data FROM learning_workspaces WHERE id = $1', ['local']);
    if (!result.rows[0]) throw new Error('Workspace missing; run npm run db:migrate');
    return result.rows[0].data;
  }
  async update<T>(mutate: (state: LearningState) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT data FROM learning_workspaces WHERE id = $1 FOR UPDATE', ['local']);
      if (!result.rows[0]) throw new Error('Workspace missing');
      const state = result.rows[0].data as LearningState;
      const value = mutate(state);
      await client.query('UPDATE learning_workspaces SET data = $1::jsonb, updated_at = NOW() WHERE id = $2', [JSON.stringify(state), 'local']);
      await client.query('COMMIT'); return value;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
