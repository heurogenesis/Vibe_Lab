import { z } from 'zod';
import type { Repository, Submission } from '../shared/schema.js';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const repositoryNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/, 'owner/repository 형식으로 입력해 주세요.').refine(value => !value.split('/').some(part => part === '.' || part === '..'));
export function parseRepositoryUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(400, '올바른 GitHub 저장소 URL을 입력해 주세요.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new ApiError(400, 'https://github.com/소유자/저장소 주소만 사용할 수 있습니다.');
  return repositoryNameSchema.parse(url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, ''));
}
const repoSchema = z.object({ full_name: z.string(), description: z.string().nullable(), language: z.string().nullable(), stargazers_count: z.number(), license: z.object({ spdx_id: z.string() }).nullable(), pushed_at: z.string(), default_branch: z.string(), is_template: z.boolean().optional(), private: z.boolean() });
type GithubRepo = z.infer<typeof repoSchema>;
export class GitHubClient {
  private cache = new Map<string, { expires: number; data: unknown }>();
  constructor(private token?: string, private fetcher: typeof fetch = fetch) {}
  async get(path: string): Promise<unknown> {
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.data;
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'VibeLab-Learning', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, signal: AbortSignal.timeout(12000), redirect: 'error' });
    } catch { throw new ApiError(502, 'GitHub에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.'); }
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new ApiError(429, 'GitHub 요청 한도 또는 권한 제한입니다. 잠시 후 다시 시도하거나 서버의 GITHUB_TOKEN 설정을 확인해 주세요.');
      if (response.status === 404) throw new ApiError(404, 'GitHub 저장소 또는 자료를 찾을 수 없습니다. 공개 여부와 주소를 확인해 주세요.');
      if (response.status >= 500) throw new ApiError(502, `GitHub 응답이 지연되거나 일시적으로 사용할 수 없습니다 (${response.status}). 잠시 후 다시 시도해 주세요.`);
      throw new ApiError(502, `GitHub 요청에 실패했습니다 (${response.status}). 서버 토큰 설정을 확인해 주세요.`);
    }
    const data: unknown = await response.json();
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(path, { expires: Date.now() + 5 * 60_000, data });
    return data;
  }
  async search(query: string): Promise<Repository[]> {
    const data = z.object({ items: z.array(repoSchema) }).parse(await this.get(`/search/repositories?q=${encodeURIComponent(query + ' archived:false is:public')}&sort=stars&order=desc&per_page=9`));
    return data.items.filter(repo => !repo.private).map(repo => ({ fullName: repo.full_name, description: repo.description || '저장소 설명이 없습니다.', url: `https://github.com/${repo.full_name}`, language: repo.language, stars: repo.stargazers_count, license: repo.license?.spdx_id || null, updatedAt: repo.pushed_at, isTemplate: repo.is_template || false }));
  }
  private async repo(name: string): Promise<GithubRepo> {
    repositoryNameSchema.parse(name);
    const repo = repoSchema.parse(await this.get(`/repos/${name}`));
    if (repo.private) throw new ApiError(403, '현재 버전은 공개 저장소만 지원합니다.');
    return repo;
  }
  async details(name: string) {
    const repo = await this.repo(name);
    const warnings: string[] = [];
    let readme = '', files: string[] = [];
    try { const data = z.object({ content: z.string(), encoding: z.string() }).parse(await this.get(`/repos/${name}/readme`)); if (data.encoding === 'base64') readme = Buffer.from(data.content, 'base64').toString('utf8').slice(0, 16000); }
    catch (error) { warnings.push(error instanceof ApiError && error.status === 404 ? 'README가 없습니다.' : 'README를 조회하지 못했습니다.'); }
    try { files = z.array(z.object({ name: z.string() })).parse(await this.get(`/repos/${name}/contents`)).slice(0, 60).map(file => file.name); }
    catch { warnings.push('파일 구조를 조회하지 못했습니다.'); }
    return { name: repo.full_name, defaultBranch: repo.default_branch, pushedAt: repo.pushed_at, license: repo.license?.spdx_id || null, isTemplate: !!repo.is_template, readme, files, warnings };
  }
  async evidence(url: string): Promise<Submission['evidence']> {
    const name = parseRepositoryUrl(url);
    const details = await this.details(name);
    let commit: string | null = null, commitMessage: string | null = null, workflow: string | null = null;
    try { const commits = z.array(z.object({ sha: z.string(), commit: z.object({ message: z.string() }) })).parse(await this.get(`/repos/${name}/commits?per_page=1`)); commit = commits[0]?.sha || null; commitMessage = commits[0]?.commit.message || null; }
    catch { details.warnings.push('최근 커밋을 조회하지 못했습니다.'); }
    try { const data = z.object({ workflow_runs: z.array(z.object({ status: z.string(), conclusion: z.string().nullable(), head_sha: z.string() })) }).parse(await this.get(`/repos/${name}/actions/runs?branch=${encodeURIComponent(details.defaultBranch)}&per_page=5`)); const run = data.workflow_runs.find(run => run.head_sha === commit); workflow = run ? run.conclusion || run.status : null; if (!run) details.warnings.push('현재 커밋에 해당하는 자동 검사 기록이 없습니다.'); }
    catch { details.warnings.push('GitHub Actions 결과를 조회하지 못했습니다.'); }
    return { name: details.name, defaultBranch: details.defaultBranch, pushedAt: details.pushedAt, commit, commitMessage, readme: !!details.readme, files: details.files, workflow, warnings: details.warnings };
  }
}
