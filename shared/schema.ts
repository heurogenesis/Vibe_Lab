import { z } from 'zod';
export const profileSchema = z.object({
  personaId: z.string().trim().min(1).max(80).optional(),
  disciplineId: z.string().trim().min(1).max(80).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  name: z.string().trim().min(1).max(40), major: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(80),
  level: z.enum(['beginner', 'intermediate', 'advanced']), style: z.enum(['hands-on', 'concept-first', 'guided']),
  domain: z.enum(['business', 'data', 'education']), goal: z.string().trim().min(5).max(500),
  minutes: z.number().int().min(20).max(180), knowledge: z.array(z.enum(['html', 'javascript', 'react', 'api', 'sql', 'git'])).max(6)
});
export type Profile = z.infer<typeof profileSchema>;
export const lessonSchema = z.object({
  title: z.string().min(1).max(120), description: z.string().min(1).max(1200),
  objective: z.string().min(1).max(1000), prompt: z.string().min(1).max(2000),
  theory: z.string().min(1).max(2400), experiment: z.string().min(1).max(1000),
  checks: z.array(z.string().min(1).max(300)).min(2).max(5)
});
export const curriculumSchema = z.object({
  title: z.string().min(1).max(120), summary: z.string().min(1).max(1500), rationale: z.string().min(1).max(1000),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']), minutes: z.number().int().min(20).max(1080),
  concepts: z.array(z.string().min(1).max(80)).min(3).max(8),
  lessons: z.array(lessonSchema).min(3).max(6),
  quiz: z.array(z.object({ question: z.string().min(1).max(500), options: z.array(z.string().min(1).max(300)).length(4), answer: z.number().int().min(0).max(3), explanation: z.string().min(1).max(800) })).min(2).max(5)
});
export type Curriculum = z.infer<typeof curriculumSchema>;
export type QuizResult = { score: number; total: number; feedback: { correct: boolean; answer: number; explanation: string }[] };
export type Submission = { url: string; reflection: string; submittedAt: string; evidence: { name: string; defaultBranch: string; pushedAt: string; commit: string | null; commitMessage: string | null; readme: boolean; files: string[]; workflow: string | null; warnings: string[] } };
export type PracticePlan = { catalogVersion: string; exerciseIds: string[] };
export type PracticeAttempt = { exerciseId: string; version: string; passed: number; total: number; status: 'passed' | 'failed' | 'error'; dataSourceId: string; recordedAt: string; verification: 'browser-reported' };
export type Assignment = Curriculum & { id: string; createdAt: string; source: 'rules' | 'ai'; profile: Profile; completedSteps: number[]; quizResult?: QuizResult; submission?: Submission; practice?: PracticePlan; practiceAttempts?: PracticeAttempt[] };
export type PublicAssignment = Omit<Assignment, 'quiz'> & { quiz: { question: string; options: string[] }[] };
export type Message = { id: string; assignmentId: string; role: 'user' | 'assistant'; content: string; createdAt: string; source?: 'rules' | 'ai' };
export type LearningState = { profile: Profile | null; assignments: Assignment[]; messages: Message[]; practiceHistory?: PracticeAttempt[] };
export type PublicState = Omit<LearningState, 'assignments'> & { assignments: PublicAssignment[] };
export type Health = { storage: 'postgresql' | 'demo-file'; ai: boolean; githubAuthenticated: boolean; localOnly: true };
export type Repository = { fullName: string; description: string; url: string; language: string | null; stars: number; license: string | null; updatedAt: string; isTemplate: boolean };
export const defaultProfile: Profile = { name: '학습자', major: '경영학', role: '기획·운영', level: 'beginner', style: 'guided', domain: 'business', goal: '반복되는 업무를 자동화하고, 내가 만든 코드가 어떻게 작동하는지 이해하고 싶어요.', minutes: 60, knowledge: [] };
export const levelLabels = { beginner: '입문', intermediate: '기초 경험 있음', advanced: '개발 경험 있음' };
export const styleLabels = { 'hands-on': '직접 만들며 배우기', 'concept-first': '원리를 먼저 이해하기', guided: '단계별 안내 따라가기' };
export const domainLabels = { business: '업무 자동화', data: '데이터 활용', education: '교육·학습' };
// Accounts layer. The single-learner state above is unchanged; accounts wrap it so every learner gets an
// isolated workspace, and the session decides which one a request may touch.
// See docs/MULTI_USER_DESIGN.md.
export const STORE_VERSION = 3;
// An account id is 7-24 characters and must mix letters and digits, so it never reads like a display nickname.
export const userHandleSchema = z.string().trim()
  .min(7, '아이디는 7자 이상이어야 해요.').max(24, '아이디는 24자까지 쓸 수 있어요.')
  .regex(/^[A-Za-z0-9]+$/, '아이디는 영문과 숫자만 사용할 수 있어요.')
  .regex(/[A-Za-z]/, '아이디에 영문을 포함해 주세요.')
  .regex(/[0-9]/, '아이디에 숫자를 포함해 주세요.');
export const passwordSchema = z.string().min(8, '비밀번호는 8자 이상이어야 해요.').max(128);
export const nicknameSchema = z.string().trim().min(1, '닉네임을 입력해 주세요.').max(40);
export const signupSchema = z.object({ handle: userHandleSchema, password: passwordSchema, displayName: nicknameSchema }).strict();
export const loginSchema = z.object({ handle: z.string().trim().min(1).max(24), password: z.string().min(1).max(128) }).strict();
export type User = { id: string; handle: string; displayName: string; createdAt: string };
// Never leaves the server. The public User above is the only shape the client ever receives.
export type StoredUser = User & { passwordHash: string };
export type MultiUserState = { version: number; users: StoredUser[]; workspaces: Record<string, LearningState> };
