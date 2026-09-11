import { expect, it } from 'vitest';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { PostgresStore } from '../server/store.js';
import { defaultProfile } from '../shared/schema.js';
// Only run against a dedicated disposable test database. Never use the learning DATABASE_URL.
it.runIf(!!process.env.TEST_DATABASE_URL)('real PostgreSQL: migration, rollback and concurrent row updates',async()=> {
  const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,connectionTimeoutMillis:5000,max:5});
  const store=new PostgresStore(pool);
  try {
    const sql=await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8');
    await pool.query(sql);await pool.query(sql);
    await store.update(state=>{state.profile={...defaultProfile,name:'postgres-test'};state.messages=[];});
    await expect(store.update(state=>{state.profile!.name='must roll back';throw new Error('intentional rollback');})).rejects.toThrow('intentional rollback');
    expect((await store.read()).profile?.name).toBe('postgres-test');
    await Promise.all([0,1,2].map(i=>store.update(state=>{state.messages.push({id:String(i),assignmentId:'test',role:'user',content:'test',createdAt:new Date().toISOString()});})));
    expect((await store.read()).messages).toHaveLength(3);
  } finally { await store.close(); }
});
