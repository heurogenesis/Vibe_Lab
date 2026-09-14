import type { Exercise } from './catalog.js';
import { profileSignature } from './catalog.js';
import type { Profile } from './schema.js';

// Turns what the workspace already knows - the exercise contract, the learner's code, which test failed
// with what expected/actual, the learner's field and level - into a prompt worth pasting into an LLM.
// That context is the whole point: "why doesn't my code work" gets a guess back, the same question with
// the failing test attached gets an answer.
//
// The persona framing comes from prompts.chat (github.com/f/awesome-chatgpt-prompts). Its prompt data is
// dedicated to the public domain under CC0 1.0, so the three entries below are reproduced verbatim with
// the act name and contributor kept. Editing these texts is fine license-wise but pointless: if we want
// different wording we should write our own persona rather than pass off an edit as theirs.
export type PromptKind = 'debug' | 'fix' | 'explain';
export type PromptTestOutcome = { name: string; passed: boolean; expected: string; actual: string; hint: string };
export type PromptRunOutcome = { tests: PromptTestOutcome[]; logs: string[]; preview?: string; error?: string };
export type PromptPersona = { act: string; contributor: string; source: string; license: string; text: string };
export type PromptInput = { exercise: Exercise; code: string; result?: PromptRunOutcome | null; profile?: Profile | null; persona?: PromptPersona };
export type BuiltPrompt = { kind: PromptKind; label: string; persona: PromptPersona; text: string; notes: string[] };

const FROM_PROMPTS_CHAT = { source: 'prompts.chat', license: 'CC0-1.0' };
export const personas: Record<PromptKind, PromptPersona> = {
  debug: { ...FROM_PROMPTS_CHAT, act: 'Debugging Detective', contributor: 'mikeaitrends24',
    text: `Act as a senior debugging engineer with 15+ years of experience finding root causes in production systems. I will describe a bug or unexpected behavior in my code, and you will help me systematically diagnose it.

For each issue I bring you, follow this process:
1. Ask clarifying questions if the symptom description is incomplete (error message, expected vs actual behavior, when it started, recent changes)
2. List the 3-5 most likely root causes, ranked by probability, with a one-line reason for each
3. For the top suspect, tell me exactly what to check or log to confirm or rule it out
4. Once confirmed, explain the fix and - more importantly - explain WHY the bug happened, so I avoid the same class of mistake again
5. Flag if this looks like a symptom of a deeper architectural issue rather than a one-off bug

Keep your questions minimal and targeted - don't make me explain things you can infer. Prioritize the fastest path to root cause over exhaustive theorizing. My first issue is: \${describe_your_bug_here}` },
  fix: { ...FROM_PROMPTS_CHAT, act: 'Code Reviewer', contributor: 'rajudandigam',
    text: 'I want you to act as a Code reviewer who is experienced developer in the given code language. I will provide you with the code block or methods or code file along with the code language name, and I would like you to review the code and share the feedback, suggestions and alternative recommended approaches. Please write explanations behind the feedback or suggestions or alternative approaches.' },
  explain: { ...FROM_PROMPTS_CHAT, act: 'Explainer with Analogies', contributor: 'prompts.chat contributor',
    text: `I want you to act as an explainer who uses analogies to clarify complex topics. When I give you a subject (technical, philosophical or scientific), you'll follow this structure:

1. Ask me 1-2 quick questions to assess my current level of understanding.

2. Based on my answer, create three analogies to explain the topic:

  - One that a 10-year-old would understand (simple everyday analogy)

  - One for a high-school student would understand (intermediate analogy)

  - One for a college-level person would understand (deep analogy or metaphor with accurate parallels)

3. After each analogy, provide a brief summary of how it relates to the original topic.

4. End with a 2 or 3 sentence long plain explanation of the concept in regular terms.

Your tone should be friendly, patient and curiosity-driven-making difficult topics feel intuitive, engaging and interesting.` },
};

export const promptKinds: { id: PromptKind; label: string; description: string }[] = [
  { id: 'debug', label: '오류 해결', description: '실행 오류나 실패한 테스트의 원인을 찾는 질문을 만듭니다.' },
  { id: 'fix', label: '코드 수정', description: '지금 코드를 두고 어디를 어떻게 고칠지 묻는 질문을 만듭니다.' },
  { id: 'explain', label: '동작 설명', description: '이 코드와 개념이 왜 그렇게 동작하는지 묻는 질문을 만듭니다.' },
];

// 'explain' needs nothing but the exercise, so it is always available. The other two describe a run, and
// a prompt that says "here is my error" with no error in it is worse than no prompt at all.
export function canBuild(kind: PromptKind, result?: PromptRunOutcome | null): boolean {
  if (kind === 'explain') return true;
  if (!result) return false;
  if (kind === 'fix') return true;
  return Boolean(result.error) || result.tests.some(t => !t.passed);
}

const runtimes: Record<Exercise['language'], { label: string; fence: string; runtime: string }> = {
  typescript: { label: 'TypeScript', fence: 'ts', runtime: '브라우저 샌드박스(iframe)에서 실행됩니다. Node.js API나 외부 패키지 import는 쓸 수 없습니다.' },
  sql: { label: 'SQL', fence: 'sql', runtime: 'SQLite를 WebAssembly로 컴파일한 sql.js에서 실행됩니다. 테이블은 readings(grp TEXT, value REAL) 하나뿐입니다.' },
  r: { label: 'R', fence: 'r', runtime: 'webR(WebAssembly로 컴파일한 실제 R)에서 실행됩니다. 기본 패키지만 있고 CRAN 설치는 하지 않습니다.' },
};

function clip(text: string, max: number): { text: string; clipped: boolean } {
  return text.length <= max ? { text, clipped: false } : { text: text.slice(0, max), clipped: true };
}

export function buildPrompt(kind: PromptKind, input: PromptInput): BuiltPrompt {
  const { exercise, code, result, profile } = input;
  const persona = input.persona || personas[kind];
  const runtime = runtimes[exercise.language];
  const notes: string[] = [];
  const parts: string[] = [];

  // prompts.chat marks the spot where the asker's own case goes with a ${...} token. Ours goes below, so
  // point the persona at it instead of leaving the literal placeholder in the copied text.
  parts.push(persona.text.replace(/\$\{[^}]*\}/g, 'the situation, code and test results described below.'));

  const situation = [`- 학습 플랫폼: Vibe Lab 브라우저 실습 (실행과 채점이 브라우저 안에서 끝납니다)`,
    `- 언어: ${runtime.label}. ${runtime.runtime}`,
    `- 실습 제목: ${exercise.title}`,
    `- 지켜야 할 요구사항: ${exercise.contract}`];
  if (profile) {
    const sig = profileSignature(profile);
    situation.push(`- 나의 배경: ${sig.discipline.label} / ${sig.role.label} / ${levelLabel(sig.level)}`);
    situation.push(`- AI에게 코드를 요청해 본 경험: ${sig.promptSkill.label}`);
  }
  parts.push(`---\n\n## 상황\n${situation.join('\n')}`);

  const body = clip(code.trim(), 6000);
  if (body.clipped) notes.push('코드가 길어 앞부분 6,000자만 담았습니다.');
  parts.push(`## 내 ${runtime.label} 코드\n\`\`\`${runtime.fence}\n${body.text}${body.clipped ? '\n// ... 이하 생략' : ''}\n\`\`\``);

  if (result && kind !== 'explain') parts.push(outcomeSection(result, notes));
  parts.push(`## 원하는 답변\n${wanted(kind, profile).join('\n')}`);
  return { kind, label: promptKinds.find(k => k.id === kind)!.label, persona, text: parts.join('\n\n'), notes };
}

function levelLabel(level: Profile['level']): string {
  return level === 'beginner' ? '시작하는 단계' : level === 'intermediate' ? '기본기를 다지는 단계' : '스스로 만들어 보는 단계';
}

function outcomeSection(result: PromptRunOutcome, notes: string[]): string {
  if (result.error) return `## 실행 결과\n실행 자체가 실패했습니다.\n\n\`\`\`\n${clip(result.error, 1200).text}\n\`\`\``;
  const failed = result.tests.filter(t => !t.passed);
  const passed = result.tests.length - failed.length;
  const lines = [`${passed} / ${result.tests.length} 테스트 통과.`];
  if (result.preview) lines.push(`샘플 데이터로 돌렸을 때의 출력: \`${clip(result.preview, 300).text}\``);
  if (failed.length === 0) return `## 실행 결과\n${lines.join('\n')}\n모든 테스트는 통과했습니다.`;
  // Three failures are enough to find a cause; past that the prompt gets long without getting better.
  const shown = failed.slice(0, 3);
  if (failed.length > shown.length) notes.push(`실패한 테스트 ${failed.length}개 중 앞 ${shown.length}개만 담았습니다.`);
  lines.push('', '실패한 테스트:');
  for (const t of shown) lines.push(`\n### ${t.name}\n- 기대한 값: \`${clip(t.expected, 600).text}\`\n- 실제 값: \`${clip(t.actual, 600).text}\``);
  return `## 실행 결과\n${lines.join('\n')}`;
}

function wanted(kind: PromptKind, profile?: Profile | null): string[] {
  const common = ['- 한국어로 답해 주세요.'];
  // The learner is meant to fix this themselves - that is the exercise. Asking for the finished answer
  // first would hand it over, so every variant asks the assistant to hold it back one step.
  if (kind === 'debug') common.push(
    '- 완성된 정답 코드를 먼저 주지 말고, 무엇을 먼저 확인해야 하는지부터 알려 주세요.',
    '- 기대한 값과 실제 값의 차이가 무엇을 뜻하는지 짚어 주세요.',
    '- 원인을 찾은 뒤에 고치는 방법을 알려 주세요.');
  if (kind === 'fix') common.push(
    '- 완성된 정답 코드를 먼저 주지 말고, 고쳐야 할 곳부터 짚어 주세요.',
    '- 지금 코드에서 고쳐야 할 곳을 짚고, 왜 그곳인지 설명해 주세요.',
    '- 한 번에 전체를 다시 써 주기보다 바꿀 부분만 알려 주세요.',
    '- 고친 뒤에도 남는 경계 조건(빈 입력, 결측값, 범위 밖 값)이 있으면 알려 주세요.');
  if (kind === 'explain') common.push(
    '- 이 코드가 무엇을 계산하는지, 왜 그런 순서로 계산하는지 설명해 주세요.',
    '- 정답 코드를 주지 말고 개념과 작은 힌트만 주세요.');
  if (profile && profile.level === 'beginner') common.push('- 전문 용어를 쓸 때는 짧게 풀어서 같이 설명해 주세요.');
  return common;
}

// Shown next to the generated prompt so the learner can see where the persona came from.
export function attribution(persona: PromptPersona): string {
  return `페르소나 문구 출처: ${persona.source} · "${persona.act}" (${persona.contributor}) · ${persona.license}`;
}