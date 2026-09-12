import { afterEach, expect, it, vi } from 'vitest';
import { LearningAI } from '../server/ai.js';
import { generateRules } from '../server/curriculum.js';
import { defaultProfile } from '../shared/schema.js';
afterEach(()=>vi.unstubAllGlobals());
// 경영학 is a real discipline since 2026-09-12, which routes to the executable practice catalog.
// Tests that need the project/AI path use a major no discipline claims, so the routing is stated, not assumed.
const projectProfile = { ...defaultProfile, major: '융합 전공' };
it('sends structured output requirements and validates a completed Responses API curriculum',async()=> {
  const curriculum=generateRules(projectProfile,[]);
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:'resp_test',object:'response',created_at:1,status:'completed',model:'test-model',output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(curriculum),annotations:[]}]}]}),{status:200,headers:{'content-type':'application/json'}}));
  vi.stubGlobal('fetch',fetcher);
  const result=await new LearningAI('test-api-key','test-model').generate(projectProfile,[]);
  expect(result.source).toBe('ai');expect(result.curriculum.title).toBe(curriculum.title);
  const call=fetcher.mock.calls[0] as unknown as [RequestInfo,RequestInit];
  const body=JSON.parse(String(call[1].body));
  expect(body.store).toBe(false);expect(body.model).toBe('test-model');expect(body.text.format.type).toBe('json_schema');expect(body.text.format.strict).toBe(true);
});
it('surfaces AI failures without silently relabeling rule-based output as AI',async()=> {
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'Quota exceeded',type:'insufficient_quota'}}),{status:429,headers:{'content-type':'application/json'}})));
  await expect(new LearningAI('test-api-key','test-model').generate(projectProfile,[])).rejects.toMatchObject({status:502});
});
