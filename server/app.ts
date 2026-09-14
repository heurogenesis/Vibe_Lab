import express from 'express';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { profileSchema, type Assignment, type PublicAssignment, type QuizResult, type Submission } from '../shared/schema.js';
import { createAssignment } from './curriculum.js';
import { ApiError, GitHubClient, parseRepositoryUrl, repositoryNameSchema } from './github.js';
import { LearningAI } from './ai.js';
import type { Store, UserStore } from './store.js';
import { resolveUser } from './identity.js';
import { attachAuth } from './auth.js';
import { CATALOG_VERSION, getExercise } from '../shared/catalog.js';
import { dataSources } from '../shared/data-sources.js';
import { sandboxCsp, sandboxHtml } from './sandbox.js';
function publicAssignment(a: Assignment): PublicAssignment { return { ...a, quiz: a.quiz.map(({ question, options }) => ({ question, options })) }; }
function findAssignment(assignments: Assignment[], id: string | string[]) { const target = z.string().parse(id); const a = assignments.find(a => a.id === target); if (!a) throw new ApiError(404, '과제를 찾을 수 없습니다.'); return a; }
type ScopedRequest = express.Request & { workspace?: Store };
// Handlers never learn who the learner is; they only receive the workspace scoped to them.
function workspaceOf(req: express.Request): Store {
  const workspace = (req as ScopedRequest).workspace;
  if (!workspace) throw new ApiError(401, '사용할 학습자를 먼저 선택해 주세요.');
  return workspace;
}
export function createApp(users: UserStore, ai: LearningAI, github: GitHubClient, options: { port?: number; githubAuthenticated?: boolean } = {}) {
  const app = express(); app.disable('x-powered-by');
  // Trust only the loopback hop: this process only ever receives connections from a same-machine proxy
  // (Cloudflare Tunnel's cloudflared, or none in local dev). That proxy terminates TLS and forwards plain
  // HTTP, so without this Express sees every request as insecure and express-session's `secure` cookie
  // option silently drops Set-Cookie entirely (documented express-session behavior, not a bug there).
  app.set('trust proxy', 'loopback');
  app.get('/practice-sandbox.html', (_req,res) => {
    // A document embedded in a cross-origin isolated page must carry the policy itself, or the browser refuses
    // to load the frame. This is what keeps the JavaScript practice sandbox working once COEP is on.
    res.set({ 'Content-Security-Policy': sandboxCsp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.type('html').send(sandboxHtml);
  });
  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    contentSecurityPolicy: { directives: { 'font-src': ["'self'", 'https://fonts.gstatic.com'],
    // SQL practice runs SQLite compiled to WebAssembly in a worker; compiling it requires wasm-unsafe-eval,
    // which allows WebAssembly compilation and nothing else. JavaScript eval stays blocked.
    'script-src': ["'self'", "'wasm-unsafe-eval'"], 'worker-src': ["'self'", 'blob:'], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'connect-src': ["'self'", ...new Set(dataSources.map(s => new URL(s.url).origin))], 'frame-src': ["'self'"], 'upgrade-insecure-requests': null } } }));
  // PUBLIC_ORIGIN opts a single deployment into being reachable through a tunnel/proxy (e.g. Cloudflare
  // Tunnel). Unset, behavior is unchanged: localhost only. Set, it adds exactly that one origin/host - never
  // a wildcard - so the check still rejects arbitrary Host headers instead of trusting whatever the proxy forwards.
  const publicOrigin = process.env.PUBLIC_ORIGIN;
  const publicHost = publicOrigin ? new URL(publicOrigin).hostname : undefined;
  app.use('/api', (req, res, next) => {
    const host = req.hostname;
    if (!['127.0.0.1', 'localhost', '[::1]', '::1', publicHost].includes(host)) return res.status(403).json({ error: '로컬 접속만 허용됩니다.' });
    const origin = req.get('origin');
    const allowed = ['http://127.0.0.1:5173', 'http://localhost:5173', `http://127.0.0.1:${options.port || 3001}`, `http://localhost:${options.port || 3001}`, ...(publicOrigin ? [publicOrigin] : [])];
    if (origin && !allowed.includes(origin)) return res.status(403).json({ error: '허용되지 않은 요청 출처입니다.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Vibe-Lab') !== '1') return res.status(403).json({ error: '요청 검증 헤더가 필요합니다.' });
    res.set('Cache-Control', 'no-store'); next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }));
  app.use(express.json({ limit: '64kb' }));
  // Session, Passport and every /api/auth route. Mounted before the guard so signing in is possible.
  attachAuth(app, users);
  // Keyed per learner rather than per IP: these routes cost money, and a shared address (a classroom, an
  // office, a NAT) would otherwise let one learner exhaust everyone else's budget. Falls back to the IP for
  // requests that arrive without a session. The general /api limiter above stays IP-keyed on purpose - it
  // runs before the session exists and guards against volume, not spend.
  const expensive = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req: express.Request) => req.user?.id || ipKeyGenerator(req.ip || ''),
    message: { error: 'AI 요청이 많습니다. 1분 후 다시 시도해 주세요.' } });
  // Health answers before anyone signs in, and deliberately exposes no account information.
  app.get('/api/health', async (_req, res) => { await users.countUsers(); res.json({ storage: users.mode, ai: ai.enabled, githubAuthenticated: !!options.githubAuthenticated, localOnly: true }); });
  // Everything past this point belongs to exactly one signed-in learner. Identity lives in server/identity.ts.
  app.use('/api', (req, _res, next) => {
    try { (req as ScopedRequest).workspace = users.forUser(resolveUser(req).id); next(); }
    catch (error) { next(error); }
  });
  app.get('/api/state', async (req, res) => { const state = await workspaceOf(req).read(); res.json({ ...state, assignments: state.assignments.map(publicAssignment) }); });
  app.put('/api/profile', async (req, res) => { const profile = profileSchema.parse(req.body); await workspaceOf(req).update(state => { state.profile = profile; }); res.json(profile); });
  app.post('/api/practice/results', async (req, res) => { const store = workspaceOf(req);
    const body = z.object({ exerciseId: z.string().max(100), version: z.literal(CATALOG_VERSION), passed: z.number().int().min(0), total: z.number().int().min(1).max(20), status: z.enum(['passed','failed','error']), dataSourceId: z.string().max(100), assignmentId: z.string().max(100).optional() }).strict().parse(req.body);
    const exercise = getExercise(body.exerciseId);
    if (!exercise || body.total !== exercise.tests.length || body.passed > body.total || (body.status === 'passed') !== (body.passed === body.total)) throw new ApiError(400, '실습 버전 또는 결과 형식이 올바르지 않습니다.');
    if (body.dataSourceId !== `sample:${exercise.disciplineId}` && !exercise.sourceIds.includes(body.dataSourceId)) throw new ApiError(400, '이 실습에서 지원하지 않는 데이터 출처입니다.');
    const { assignmentId, ...summary } = body;
    const record = { ...summary, recordedAt: new Date().toISOString(), verification: 'browser-reported' as const };
    await store.update(state => {
      if (!state.profile) throw new ApiError(400, '학습 프로필을 먼저 저장해 주세요.');
      if (assignmentId) {
        const assignment = findAssignment(state.assignments, assignmentId);
        if (assignment.practice?.catalogVersion !== body.version || !assignment.practice.exerciseIds.includes(body.exerciseId)) throw new ApiError(400, '이 과제에 포함되지 않은 실습입니다.');
        assignment.practiceAttempts = [...(assignment.practiceAttempts || []).filter(a => a.exerciseId !== body.exerciseId), record];
      }
      state.practiceHistory = [...(state.practiceHistory || []), record].slice(-100);
    });
    res.status(201).json(record);
  });
  app.post('/api/assignments', expensive, async (req, res) => { const store = workspaceOf(req);
    const state = await store.read(); if (!state.profile) throw new ApiError(400, '학습 프로필을 먼저 저장해 주세요.');
    if (state.assignments.length >= 100) throw new ApiError(409, '로컬 과제 보관 한도(100개)에 도달했습니다.');
    const generated = await ai.generate(state.profile, state.assignments);
    const assignment = createAssignment(generated.curriculum, state.profile, generated.source);
    await store.update(current => { if (current.assignments.length >= 100) throw new ApiError(409, '과제 보관 한도에 도달했습니다.'); current.assignments.unshift(assignment); });
    res.status(201).json(publicAssignment(assignment));
  });
  app.patch('/api/assignments/:id/progress', async (req, res) => { const store = workspaceOf(req);
    const body = z.object({ step: z.number().int().min(0), completed: z.boolean() }).parse(req.body);
    const result = await store.update(state => { const a = findAssignment(state.assignments, req.params.id); if (body.step >= a.lessons.length) throw new ApiError(400, '잘못된 실습 단계입니다.'); a.completedSteps = body.completed ? [...new Set([...a.completedSteps, body.step])].sort() : a.completedSteps.filter(s => s !== body.step); return publicAssignment(a); });
    res.json(result);
  });
  app.post('/api/assignments/:id/quiz', async (req, res) => { const store = workspaceOf(req);
    const body = z.object({ answers: z.array(z.number().int().min(0).max(3)).min(2).max(5) }).parse(req.body);
    res.json(await store.update(state => { const a = findAssignment(state.assignments, req.params.id); if (body.answers.length !== a.quiz.length) throw new ApiError(400, '모든 질문에 답해 주세요.'); const feedback = a.quiz.map((q, i) => ({ correct: q.answer === body.answers[i], answer: q.answer, explanation: q.explanation })); const result: QuizResult = { score: feedback.filter(f => f.correct).length, total: feedback.length, feedback }; a.quizResult = result; return result; }));
  });
  app.post('/api/assignments/:id/chat', expensive, async (req, res) => { const store = workspaceOf(req);
    const body = z.object({ message: z.string().trim().min(1).max(2000), lessonIndex: z.number().int().min(0) }).parse(req.body);
    const state = await store.read(); const a = findAssignment(state.assignments, req.params.id); if (body.lessonIndex >= a.lessons.length) throw new ApiError(400, '잘못된 실습 단계입니다.');
    const result = await ai.chat(a, state.messages.filter(m => m.assignmentId === a.id), body.message, body.lessonIndex);
    const messages = [{ id: randomUUID(), assignmentId: a.id, role: 'user' as const, content: body.message, createdAt: new Date().toISOString() }, { id: randomUUID(), assignmentId: a.id, role: 'assistant' as const, content: result.content, source: result.source, createdAt: new Date().toISOString() }];
    await store.update(current => { current.messages.push(...messages); current.messages = current.messages.slice(-500); }); res.json(messages);
  });
  app.get('/api/github/search', async (req, res) => { const query = z.string().trim().min(2).max(120).parse(req.query.q); res.json(await github.search(query)); });
  app.get('/api/github/repository', async (req, res) => { const name = repositoryNameSchema.parse(req.query.name); res.json(await github.details(name)); });
  app.post('/api/assignments/:id/submission', async (req, res) => { const store = workspaceOf(req);
    const body = z.object({ url: z.string().max(240), reflection: z.string().trim().min(20).max(3000) }).parse(req.body);
    findAssignment((await store.read()).assignments, req.params.id); const name = parseRepositoryUrl(body.url);
    const submission: Submission = { url: `https://github.com/${name}`, reflection: body.reflection, submittedAt: new Date().toISOString(), evidence: await github.evidence(body.url) };
    await store.update(state => { findAssignment(state.assignments, req.params.id).submission = submission; }); res.json(submission);
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API를 찾을 수 없습니다.' }));
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res, next) => res.sendFile(resolve('dist/index.html'), error => { if (error) next(error); }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: '입력 형식을 확인해 주세요.', details: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: '올바른 JSON 형식이 아닙니다.' });
    if ((error as { status?: number })?.status === 413) return res.status(413).json({ error: '입력 내용이 너무 큽니다.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({ error: '서버 처리에 실패했습니다. DB 연결과 서버 설정을 확인해 주세요.' });
  });
  return app;
}
