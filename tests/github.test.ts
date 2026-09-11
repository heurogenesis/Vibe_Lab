import { expect, it, vi } from 'vitest';
import { GitHubClient } from '../server/github.js';
const repo = {full_name:'example/course',description:'Learning repository',language:'TypeScript',stargazers_count:42,license:{spdx_id:'MIT'},pushed_at:'2026-09-01T00:00:00Z',default_branch:'main',is_template:true,private:false};
it('fetches real-shaped repository metadata, README, commits and matching workflow evidence',async()=> {
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    const data=url.includes('/readme')?{content:Buffer.from('# Course').toString('base64'),encoding:'base64'}:url.includes('/contents')?[{name:'README.md'},{name:'src'}]:url.includes('/commits')?[{sha:'abc123',commit:{message:'add working example'}}]:url.includes('/actions/runs')?{workflow_runs:[{head_sha:'old123',status:'completed',conclusion:'success'},{head_sha:'abc123',status:'completed',conclusion:'failure'}]}:repo;
    return new Response(JSON.stringify(data),{status:200});
  });
  const client=new GitHubClient('test-token',fetcher as typeof fetch);
  const evidence=await client.evidence('https://github.com/example/course');
  expect(evidence.readme).toBe(true);expect(evidence.workflow).toBe('failure');expect(evidence.commit).toBe('abc123');
  const calls=fetcher.mock.calls.length;await client.evidence('https://github.com/example/course');expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(fetcher.mock.calls.every(([url])=>String(url).startsWith('https://api.github.com/'))).toBe(true);
});
it('reports rate limits instead of substituting fake repository results',async()=> {
  const client=new GitHubClient(undefined,vi.fn(async()=>new Response('{}',{status:429})) as typeof fetch);
  await expect(client.search('react')).rejects.toMatchObject({status:429});
});
it('does not expose private repositories even if the server token can read them',async()=> {
  const client=new GitHubClient('test-token',vi.fn(async()=>new Response(JSON.stringify({...repo,private:true}),{status:200})) as typeof fetch);
  await expect(client.details('example/course')).rejects.toMatchObject({status:403});
});
