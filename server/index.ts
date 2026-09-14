import 'dotenv/config';
import pg from 'pg';
import { createApp } from './app.js';
import { LearningAI } from './ai.js';
import { GitHubClient } from './github.js';
import { FileUserStore, PostgresUserStore, type UserStore } from './store.js';
const port = Number(process.env.PORT || 3001);
// Stays on the loopback address unless HOST says otherwise, so a local run is never reachable from the
// network by accident. A container or EC2 instance behind a load balancer sets HOST=0.0.0.0.
const host = process.env.HOST || '127.0.0.1';
// RDS terminates TLS with its own CA. DATABASE_CA_CERT (the PEM contents) verifies it properly;
// DATABASE_SSL=true without a CA still encrypts but cannot detect an impersonated endpoint, so it warns.
function databaseSsl() {
  if (process.env.DATABASE_CA_CERT) return { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true };
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  console.warn('DATABASE_SSL is on without DATABASE_CA_CERT: the connection is encrypted but the server certificate is not verified.');
  return { rejectUnauthorized: false };
}
const store: UserStore = process.env.DATABASE_URL ? new PostgresUserStore(new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, max: 5, ssl: databaseSsl() })) : new FileUserStore(process.env.DATA_FILE || '.data/learning.json');
try { await store.countUsers(); } catch { console.error('Storage unavailable. Check DATABASE_URL and run npm run db:migrate.'); await store.close(); process.exit(1); }
const app = createApp(store, new LearningAI(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL), new GitHubClient(process.env.GITHUB_TOKEN), { port, githubAuthenticated: !!process.env.GITHUB_TOKEN });
const server = app.listen(port, host, () => console.log(`API ready: http://${host}:${port} | storage: ${store.mode} | sessions: ${store.pool ? 'postgresql' : 'memory'}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(() => { void store.close().then(() => process.exit(0)); }); });
