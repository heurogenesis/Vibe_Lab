import { expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { seedLearningContent, readQuestionBank } from '../server/learning-content-store.js';
import { renderQuestion, scenario } from '../server/question-bank.js';
import { disciplines } from '../shared/catalog.js';
import { PostgresUserStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { LearningAI } from '../server/ai.js';
import { GitHubClient } from '../server/github.js';
import { client } from './helpers.js';
import { defaultProfile } from '../shared/schema.js';

it.runIf(!!process.env.TEST_DATABASE_URL)('PostgreSQL content bank: idempotent seed, HTTP generation/grading and saved snapshot',async()=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:3});
 const users=new PostgresUserStore(pool);let userId:string|undefined;
 try {
  await pool.query(await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8'));
  expect(await seedLearningContent(pool)).toMatchObject({templates:27,examples:234});
  await seedLearningContent(pool);
  expect(Number((await pool.query('SELECT count(*) FROM learning_example_bank')).rows[0].count)).toBe(234);
  const bank=await readQuestionBank(pool);expect(bank).toHaveLength(27);
  const q=renderQuestion(bank[0],disciplines[0],scenario(disciplines[0],2));expect(q.options[q.answer]).toBeDefined();
  const agent=await client(createApp(users,new LearningAI(),new GitHubClient()));
  const signup=await agent.post('/api/auth/signup').send({handle:'qb'+randomUUID().replaceAll('-','').slice(0,14)+'1',password:'test-only-password',displayName:'문제 은행 검증'}).expect(201);
  userId=signup.body.id;
  await agent.put('/api/profile').send({...defaultProfile,major:'전자공학',role:'연구개발',domain:'data'}).expect(200);
  const a=(await agent.post('/api/assignments').send({}).expect(201)).body;
  for(const q of a.quiz){expect(Object.keys(q).sort()).toEqual(['options','question']);}
  const saved=(await users.forUser(userId!).read()).assignments[0];
  const graded=await agent.post(`/api/assignments/${a.id}/quiz`).send({answers:saved.quiz.map(q=>q.answer)}).expect(200);
  expect(graded.body.score).toBe(3);
  const next=(await agent.post('/api/assignments').send({}).expect(201)).body;expect(next.quiz).not.toEqual(a.quiz);
  const reloaded=(await users.forUser(userId!).read()).assignments.find(x=>x.id===a.id)!;
  expect(reloaded.quiz).toEqual(saved.quiz);expect(reloaded.quizResult!.score).toBe(3);
  const stranger=await client(createApp(users,new LearningAI(),new GitHubClient()));
  await stranger.get('/api/state').expect(401);
 }finally{
  if(userId){await pool.query('DELETE FROM learning_workspaces WHERE id=$1',[userId]);await pool.query('DELETE FROM learning_users WHERE id=$1',[userId]);}
  await users.close();
 }
},30000);
