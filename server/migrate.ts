import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await pool.query(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8'));
  console.log('Database migration complete. Existing learning data preserved.');
} finally { await pool.end(); }
