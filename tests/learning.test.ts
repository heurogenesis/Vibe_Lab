import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newDb, DataType } from 'pg-mem';
import { createApp } from '../server/app.js';
import { LearningAI } from '../server/ai.js';
import { GitHubClient, parseRepositoryUrl } from '../server/github.js';
import { createAssignment, generateRules } from '../server/curriculum.js';
import { FileUserStore, PostgresUserStore } from '../server/store.js';
import { curriculumSchema, defaultProfile, type Profile, type PublicAssignment } from '../shared/schema.js';
import { client, refreshCsrf } from './helpers.js';
// 경영학 is a real discipline since 2026-09-12, which routes to the executable practice catalog.
// Tests that need the project/AI path use a major no discipline claims, so the routing is stated, not assumed.
const projectProfile = { ...defaultProfile, major: '융합 전공' };
const folders: string[] = [];
afterEach(async()=> { for (const folder of folders.splice(0)) await rm(folder,{recursive:true,force:true}); });
async function setup() {
  const folder = await mkdtemp(join(tmpdir(),'vibelab-test-')); folders.push(folder);
  const users = new FileUserStore(join(folder,'state.json'));
  const github = new GitHubClient();
  const app = createApp(users,new LearningAI(),github);
  // A signed-in agent: supertest keeps the session cookie between requests, exactly like a browser,
  // and carries the CSRF token the same way the real client does.
  const agent = await client(app);
  const signup = await agent.post('/api/auth/signup').set('X-Vibe-Lab','1').send({handle:'tester01',password:'test-password',displayName:'테스터'}).expect(201);
  const userId = signup.body.id as string;
  return {users,store:users.forUser(userId),app,github,agent,userId};
}
describe('learner workflow via HTTP',()=> {
  it('persists profile → curriculum → progress → quiz → tutor, without leaking quiz answers',async()=> {
    const {agent,store,userId} = await setup();
    await agent.post('/api/assignments').set('X-Vibe-Lab','1').send({}).expect(400);
    await agent.put('/api/profile').set('X-Vibe-Lab','1').send(projectProfile).expect(200);
    const created = await agent.post('/api/assignments').set('X-Vibe-Lab','1').send({}).expect(201);
    const a = created.body as PublicAssignment;
    expect(a.lessons).toHaveLength(4); expect(a.quiz[0]).not.toHaveProperty('answer');
    expect(a.quiz[0]).not.toHaveProperty('explanation');
    await agent.patch(`/api/assignments/${a.id}/progress`).set('X-Vibe-Lab','1').send({step:0,completed:true}).expect(200);
    await agent.patch(`/api/assignments/${a.id}/progress`).set('X-Vibe-Lab','1').send({step:0,completed:true}).expect(200);
    expect((await store.read()).assignments[0].completedSteps).toEqual([0]);
    await agent.patch(`/api/assignments/${a.id}/progress`).set('X-Vibe-Lab','1').send({step:99,completed:true}).expect(400);
    await agent.post(`/api/assignments/${a.id}/quiz`).set('X-Vibe-Lab','1').send({answers:[0,0]}).expect(400);
    const graded = await agent.post(`/api/assignments/${a.id}/quiz`).set('X-Vibe-Lab','1').send({answers:(await store.read()).assignments[0].quiz.map(q=>q.answer)}).expect(200);
    expect(graded.body.score).toBe(3);
    const chat = await agent.post(`/api/assignments/${a.id}/chat`).set('X-Vibe-Lab','1').send({message:'원리를 설명해 줘',lessonIndex:0}).expect(200);
    expect(chat.body[1].source).toBe('rules'); expect(chat.body[1].content).toContain('타입');
    const state = (await agent.get('/api/state').expect(200)).body;
    expect(state.assignments[0].quizResult.score).toBe(3); expect(state.messages).toHaveLength(2);
    const reopened = new FileUserStore(join(folders[0],'state.json'));
    expect((await reopened.forUser(userId).read()).profile?.major).toBe('융합 전공');
  });
  it('rejects invalid profiles, foreign origins and missing request headers',async()=> {
    const {agent,app}=await setup();
    await request(app).put('/api/profile').send(defaultProfile).expect(403);
    await request(app).put('/api/profile').set('X-Vibe-Lab','1').set('Origin','https://evil.example').send(defaultProfile).expect(403);
    await request(app).get('/api/state').set('Host','evil.example').expect(403);
    await agent.put('/api/profile').set('X-Vibe-Lab','1').send({...defaultProfile,minutes:-1}).expect(400);
    await agent.put('/api/profile').set('X-Vibe-Lab','1').send({...defaultProfile,name:' '}).expect(400);
    await agent.get('/api/no-such-route').expect(404);
    await agent.post('/api/assignments/missing/chat').set('X-Vibe-Lab','1').send({message:'hello',lessonIndex:0}).expect(404);
    // A signed-in session is not on its own permission to change anything: the browser attaches that cookie
    // to a forged cross-site request too. Without the session's token, or with someone else's, the write dies.
    await agent.put('/api/profile').set('X-CSRF-Token','').send(defaultProfile).expect(403);
    await agent.put('/api/profile').set('X-CSRF-Token','f'.repeat(64)).send(defaultProfile).expect(403);
    // Reading is still allowed without one, which is what keeps the token fetchable in the first place.
    await agent.get('/api/state').set('X-CSRF-Token','').expect(200);
  });
  it('serializes concurrent progress updates without losing either step',async()=> {
    const {agent,store}=await setup();
    await store.update(s=>{s.profile=defaultProfile;s.assignments=[createAssignment(generateRules(defaultProfile,[]),defaultProfile,'rules')];});
    const id=(await store.read()).assignments[0].id;
    await Promise.all([0,1,2].map(step=>agent.patch(`/api/assignments/${id}/progress`).set('X-Vibe-Lab','1').send({step,completed:true}).expect(200)));
    expect((await store.read()).assignments[0].completedSteps).toEqual([0,1,2]);
  });
  it('saves submission evidence only after a valid repository check succeeds',async()=> {
    const {agent,store,github}=await setup();
    await store.update(s=>{s.assignments=[createAssignment(generateRules(defaultProfile,[]),defaultProfile,'rules')];});
    const id=(await store.read()).assignments[0].id;
    const evidence=vi.spyOn(github,'evidence').mockResolvedValue({name:'example/course',defaultBranch:'main',pushedAt:'2026-09-01T00:00:00Z',commit:'abc123',commitMessage:'learning',readme:true,files:['README.md'],workflow:null,warnings:[]});
    const reflection='화면에서 API로 요청을 보내고 DB에 기록하는 과정을 이해했습니다.';
    await agent.post(`/api/assignments/${id}/submission`).set('X-Vibe-Lab','1').send({url:'https://localhost/private',reflection}).expect(400);
    expect(evidence).not.toHaveBeenCalled();
    await agent.post(`/api/assignments/${id}/submission`).set('X-Vibe-Lab','1').send({url:'https://github.com/example/course',reflection}).expect(200);
    expect((await store.read()).assignments[0].submission?.reflection).toBe(reflection);
    evidence.mockRejectedValue(new Error('network unavailable'));
    await agent.post(`/api/assignments/${id}/submission`).set('X-Vibe-Lab','1').send({url:'https://github.com/example/new-course',reflection}).expect(500);
    expect((await store.read()).assignments[0].submission?.url).toBe('https://github.com/example/course');
  });
});
describe('adaptive curriculum',()=> {
  it('matches the schema for all domains, styles and experience levels',()=> {
    for(const domain of ['business','data','education'] as const) for(const style of ['hands-on','concept-first','guided'] as const) for(const level of ['beginner','intermediate','advanced'] as const) {
      const p:Profile={...defaultProfile,domain,style,level,minutes:180};
      expect(curriculumSchema.safeParse(generateRules(p,[])).success).toBe(true);
    }
  });
  it('changes domain content and adapts the next task based on actual assessment',()=> {
    const first=createAssignment(generateRules(projectProfile,[]),projectProfile,'rules');
    expect(generateRules({...projectProfile,domain:'data'},[]).title).not.toBe(first.title);
    first.completedSteps=[0,1,2,3];first.quizResult={score:3,total:3,feedback:[]};
    expect(generateRules(projectProfile,[first]).difficulty).toBe('intermediate');
    first.quizResult={score:1,total:3,feedback:[]};
    expect(generateRules({...projectProfile,level:'advanced'},[first]).difficulty).toBe('beginner');
  });
});
describe('PostgreSQL persistence contract (pg-mem)',()=> {
  it('applies the SQL migration idempotently and roundtrips JSONB curriculum',async()=> {
    // pg-mem reports unused AST nodes for an already-existing CREATE TABLE IF NOT EXISTS.
    // Disable its AST coverage check, while retaining actual query execution and constraint checks.
    const db=newDb({noAstCoverageCheck:true});
    db.public.registerFunction({name:'jsonb_typeof',args:[DataType.jsonb],returns:DataType.text,implementation:value=>Array.isArray(value)?'array':typeof value});
    const sql=await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8');
    db.public.none(sql);db.public.none(sql);
    const {Pool}=db.adapters.createPg();
    const users=new PostgresUserStore(new Pool());
    const learner=await users.createUser({handle:'pgtester1',displayName:'PG',passwordHash:'not-used-here'});
    const store=users.forUser(learner.id);
    await store.update(s=>{s.profile=projectProfile;s.assignments.push(createAssignment(generateRules(projectProfile,[]),projectProfile,'rules'));});
    const loaded=await store.read();expect(loaded.profile).toEqual(projectProfile);expect(loaded.assignments[0].lessons).toHaveLength(4);
    db.public.none(sql);expect((await store.read()).assignments).toHaveLength(1);
    await users.close();
  });
});
describe('repository boundaries',()=> {
  it('accepts only a clean public GitHub repository URL',()=> {
    expect(parseRepositoryUrl('https://github.com/example/project.git')).toBe('example/project');
    for(const bad of ['http://github.com/example/project','https://github.com.evil.com/example/project','https://localhost/example/project','https://github.com/example/project/tree/main','https://a:b@github.com/example/project','https://github.com/example/project?token=x']) expect(()=>parseRepositoryUrl(bad)).toThrow();
  });
});
describe('accounts and sessions',()=> {
  it('enforces the id rules, blocks duplicates and keeps every workspace private',async()=> {
    const {agent,app}=await setup();
    const anonymous=await client(app);
    for(const handle of ['short1','alllettersonly','1234567890']) await anonymous.post('/api/auth/signup').send({handle,password:'test-password',displayName:'x'}).expect(400);
    await anonymous.post('/api/auth/signup').send({handle:'sora1234',password:'short',displayName:'소라'}).expect(400);
    expect((await request(app).get('/api/auth/available').query({handle:'tester01'}).expect(200)).body.available).toBe(false);
    expect((await request(app).get('/api/auth/available').query({handle:'sora1234'}).expect(200)).body.available).toBe(true);
    const sora=await client(app);
    const created=await sora.post('/api/auth/signup').send({handle:'Sora1234',password:'test-password',displayName:'소라'}).expect(201);
    expect(created.body.handle).toBe('sora1234');
    expect(created.body).not.toHaveProperty('passwordHash');
    await anonymous.post('/api/auth/signup').send({handle:'SORA1234',password:'test-password',displayName:'중복'}).expect(409);
    await request(app).get('/api/state').expect(401);
    await anonymous.post('/api/auth/login').send({handle:'sora1234',password:'wrong-password'}).expect(401);
    await sora.put('/api/profile').set('X-Vibe-Lab','1').send({...defaultProfile,name:'소라'}).expect(200);
    expect((await agent.get('/api/state').expect(200)).body.profile).toBeNull();
    expect((await sora.get('/api/state').expect(200)).body.profile.name).toBe('소라');
    await sora.post('/api/auth/logout').set('X-Vibe-Lab','1').expect(204);
    await sora.get('/api/state').expect(401);
    // Logging out took the CSRF token with the session; signing back in needs a new one.
    await sora.post('/api/auth/login').send({handle:'sora1234',password:'test-password'}).expect(403);
    await refreshCsrf(sora);
    await sora.post('/api/auth/login').set('X-Vibe-Lab','1').send({handle:'sora1234',password:'test-password'}).expect(200);
    expect((await sora.get('/api/state').expect(200)).body.profile.name).toBe('소라');
  });
});
