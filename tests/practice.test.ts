import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { CATALOG_VERSION, disciplines, getExercise, listExercises, projectDiscipline, recommendation, resolveDiscipline, type Exercise } from '../shared/catalog.js';
import { dataSources, normalizeRows } from '../shared/data-sources.js';
import { curriculumSchema, defaultProfile, profileSchema } from '../shared/schema.js';
import { createAssignment, generateRules } from '../server/curriculum.js';
import { LearningAI } from '../server/ai.js';
import { createApp } from '../server/app.js';
import { GitHubClient } from '../server/github.js';
import { FileUserStore } from '../server/store.js';
import { compileCode, workerProgram, type RunResult } from '../src/runner.js';
import { loadDataset } from '../src/data-loader.js';
import { client } from './helpers.js';

const profile={...defaultProfile,personaId:'engineer',major:'전자공학',role:'연구개발 및 PM',domain:'data' as const};
const folders:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();vi.restoreAllMocks();for(const folder of folders.splice(0))await rm(folder,{recursive:true,force:true});});

// Executes our owned reference fixtures through the same harness used by the
// browser. Isolation/CSP and timeout are checked separately in a real browser.
async function execute(exercise:Exercise,source:string):Promise<RunResult>{
 const code=await compileCode(source);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Fixture timeout')),2000);
  const context=createContext({structuredClone,setTimeout,clearTimeout,payload:{code,tests:exercise.tests,theme:exercise.theme,rows:exercise.sample},postMessage:(result:RunResult)=>{clearTimeout(timer);resolve(result);}});
  try{runInContext(workerProgram+'\nvoid onmessage({data:payload});',context,{timeout:1000});}catch(e){clearTimeout(timer);reject(e);}
 });
}
function reference(exercise:Exercise){
 const d=[...disciplines,projectDiscipline].find(d=>d.id===exercise.disciplineId)!;
 const valid=`typeof v==='number' && Number.isFinite(v)`;
 if(exercise.theme==='median')return `function solve(rows){const a=rows.map(r=>r.value).filter(v=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>a-b);return !a.length?null:a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2;}`;
 if(exercise.theme==='trend')return `function solve(rows){return rows.map((_,i)=>{const a=rows.slice(Math.max(0,i-2),i+1).map(r=>r.value).filter(v=>typeof v==='number'&&Number.isFinite(v));return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;});}`;
 if(exercise.theme==='normalize')return `function solve(rows){return rows.map(r=>typeof r.value==='number'&&Number.isFinite(r.value)?(r.value-(${d.min}))/(${d.max}-(${d.min})):null);}`;
 if(exercise.theme==='clean')return `function solve(rows){let sum=0,count=0;for(const row of rows){const v=row.value;if(${valid} && v>=${d.min} && v<=${d.max}){sum+=v;count++;}}return count?sum/count:null;}`;
 if(exercise.theme==='compare')return `function solve(rows){const groups=new Map();for(const row of rows){if(!groups.has(row.group))groups.set(row.group,[]);const v=row.value;if(${valid})groups.get(row.group).push(v);}return Object.fromEntries([...groups].map(([key,values])=>[key,values.length?values.reduce((a,b)=>a+b,0)/values.length:null]));}`;
 if(exercise.theme==='quality')return `function solve(rows){const values=rows.map(r=>r.value).filter(v=>${valid});const accepted=values.filter(v=>v>=${d.min} && v<=${d.max}).length;return {observed:values.length,accepted,rate:values.length?accepted/values.length:null};}`;
 return `async function solve(loaders){const results=await Promise.allSettled(loaders.map(f=>Promise.resolve().then(f)));return {rows:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),failed:results.filter(r=>r.status==='rejected').length};}`;
}
describe('personalized engineering curriculum',()=>{
 it('changes learning objectives, data, units and tests for different majors',()=>{
  const electrical=generateRules(profile,[]);const chemical=generateRules({...profile,major:'화학공학',role:'공정 엔지니어'},[]);
  expect(electrical.lessons[0].objective).not.toBe(chemical.lessons[0].objective);
  expect(electrical.summary).toContain('센서');expect(chemical.summary).toContain('반응');
  expect(getExercise('electronics:clean')?.sample).not.toEqual(getExercise('chemical:clean')?.sample);
  expect(curriculumSchema.safeParse(electrical).success).toBe(true);
  expect(recommendation(profile).exerciseIds).toContain('project:compare');
 });
 it('supports old STEM profiles and new persona IDs without a schema migration',()=>{
  expect(generateRules({...profile,personaId:undefined,domain:'business'},[]).lessons[0].title).toContain('센서');
  const future=profileSchema.parse({...profile,personaId:'technical-instructor',disciplineId:'new-field',major:'새로운 융합 전공',interests:['new-theme']});
  expect(future.personaId).toBe('technical-instructor');expect(resolveDiscipline(future).id).toBe('general');
  expect(recommendation(future).reason).toContain('공통 데이터 실습');
  expect(profileSchema.safeParse(defaultProfile).success).toBe(true);
 });
 it('uses explicit interests and coding level instead of assuming engineer proficiency',()=>{
  expect(recommendation({...profile,interests:['async']}).exerciseIds[0]).toBe('electronics:async');
  expect(generateRules({...profile,level:'beginner'},[]).difficulty).toBe('beginner');
  expect(resolveDiscipline({...profile,disciplineId:'mechanical'}).id).toBe('mechanical');
 });
 it('does not spend model tokens to generate reviewed executable exercises',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const result=await new LearningAI('test-only','test-model').generate(profile,[]);
  expect(result.source).toBe('rules');expect(fetcher).not.toHaveBeenCalled();
 });
});
// The first dynamic import of typescript inside compileCode pays Vite's transform cost for the whole
// compiler, which on a loaded machine runs into seconds. Paying it once here keeps that one-time module
// load out of the per-exercise timeouts below, which exist to catch runaway learner code rather than a
// slow import. Without this the first two exercises in the loop fail intermittently at 5s.
beforeAll(async()=>{await compileCode('function solve(rows){return rows;}');},60000);
describe('executable exercise contracts',()=>{
 it.each(listExercises().filter(e=>e.language==='typescript').map(exercise=>[exercise.id,exercise] as const))('%s reference passes every published test',async(_id,exercise)=>{
  const result=await execute(exercise,reference(exercise));
  expect(result.error).toBeUndefined();expect(result.tests).toHaveLength(exercise.tests.length);
  expect(result.tests.filter(t=>!t.passed)).toEqual([]);
 });
 it('blank and incorrect denominator fail with actionable feedback',async()=>{
  const exercise=getExercise('electronics:clean')!;
  expect((await execute(exercise,exercise.starter)).tests.some(t=>!t.passed)).toBe(true);
  const wrong=await execute(exercise,`function solve(rows){return rows.length ? rows.reduce((s,r)=>s+(r.value??0),0)/rows.length:null;}`);
  expect(wrong.tests.find(t=>!t.passed)?.hint).toContain('null');
 });
 it('rejects syntax errors and imports before runtime',async()=>{
  await expect(compileCode('function solve( {')).rejects.toThrow();
  await expect(compileCode("import x from 'x'; function solve(){return x;}")).rejects.toThrow('import');
  expect(getExercise('electronics:clean:extra')).toBeUndefined();
 });
});
describe('external data without a server data copy',()=>{
 it('rejects changed fields, oversized bodies and unknown sources, then caches a valid source',async()=>{
  const source=dataSources[0];
  expect(()=>normalizeRows([{Species:'A','Body Mass (g)':'3500'}],source)).toThrow();
  const noFetch=vi.fn();await expect(loadDataset('https://localhost/private',noFetch)).rejects.toThrow('등록');expect(noFetch).not.toHaveBeenCalled();
  await expect(loadDataset(source.id,vi.fn(async()=>new Response(new Uint8Array(source.maxBytes+1))))).rejects.toThrow('크기');
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify([{Species:'Adelie','Body Mass (g)':3750},{Species:'Gentoo','Body Mass (g)':null}])));
  const first=await loadDataset(source.id,fetcher);first[0].value=1;
  expect((await loadDataset(source.id,fetcher))[0].value).toBe(3750);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toContain(source.version);
 });
});
describe('practice result persistence and sandbox boundary',()=>{
 it('stores only compact bounded reports and rejects mismatched exercises or full datasets',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'vibelab-practice-'));folders.push(folder);
  const file=join(folder,'state.json');const users=new FileUserStore(file);
  const app=createApp(users,new LearningAI(),new GitHubClient());
  const agent=await client(app);
  const learner=(await agent.post('/api/auth/signup').set('X-Vibe-Lab','1').send({handle:'tester01',password:'test-password',displayName:'테스터'}).expect(201)).body;
  const store=users.forUser(learner.id);
  const a=createAssignment(generateRules(profile,[]),profile,'rules');
  await store.update(s=>{s.profile=profile;s.assignments=[a];});
  const exercise=getExercise(a.practice!.exerciseIds[0])!;
  const body={assignmentId:a.id,exerciseId:exercise.id,version:CATALOG_VERSION,passed:exercise.tests.length,total:exercise.tests.length,status:'passed',dataSourceId:`sample:${exercise.disciplineId}`};
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send({...body,rows:exercise.sample}).expect(400);
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send({...body,version:'stale'}).expect(400);
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send({...body,passed:0}).expect(400);
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send(body).expect(201);
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send({...body,exerciseId:'life:clean'}).expect(400);
  const state=await new FileUserStore(file).forUser(learner.id).read();expect(state.practiceHistory?.[0].verification).toBe('browser-reported');expect(state.assignments[0].practiceAttempts).toHaveLength(1);
  expect(state.practiceHistory?.[0]).not.toHaveProperty('rows');expect(state.practiceHistory?.[0]).not.toHaveProperty('code');
  await store.update(s=>{s.practiceHistory=Array(100).fill(state.practiceHistory![0]);});
  await agent.post('/api/practice/results').set('X-Vibe-Lab','1').send(body).expect(201);
  expect((await store.read()).practiceHistory).toHaveLength(100);
  const response=await agent.get('/practice-sandbox.html').expect(200);
  expect(response.headers['content-security-policy']).toContain("connect-src 'none'");
  expect(response.headers['content-security-policy']).toContain('sandbox allow-scripts');
  expect(response.headers['content-security-policy']).not.toContain('allow-same-origin');
 });
});
