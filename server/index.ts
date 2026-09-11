import 'dotenv/config';
import pg from 'pg';
import { createApp } from './app.js';
import { LearningAI } from './ai.js';
import { GitHubClient } from './github.js';
import { FileStore, PostgresStore } from './store.js';
const port = Number(process.env.PORT || 3001);
const store = process.env.DATABASE_URL ? new PostgresStore(new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 5 })) : new FileStore(process.env.DATA_FILE || '.data/learning.json');
try { await store.read(); } catch { console.error('Storage unavailable. Check DATABASE_URL and run npm run db:migrate.'); await store.close(); process.exit(1); }
const app = createApp(store, new LearningAI(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL), new GitHubClient(process.env.GITHUB_TOKEN), { port, githubAuthenticated: !!process.env.GITHUB_TOKEN });
const server = app.listen(port, '127.0.0.1', () => console.log(`API ready: http://127.0.0.1:${port} | storage: ${store.mode} | local single-learner workspace`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(() => { void store.close().then(() => process.exit(0)); }); });
