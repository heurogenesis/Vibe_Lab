// Every piece of free text a learner types is interpreted here and nowhere else.
//
// Before this module the interpretation was scattered: resolveDiscipline() matched keywords against `major`,
// preferredThemes() and recommendation() each ran their own regexes over `${role} ${goal}`, and the result was
// never stored. Two learners with the same background but different wording could land on different content,
// and the same learner's wording change could silently reroute them.
//
// The rule now: free text is classified once into a bounded category, the category is what the system reasons
// about, and the raw sentence is only ever used as display text for its own author. That keeps the number of
// distinct content combinations finite (and therefore cacheable) no matter how many learners sign up.
// See docs/DATA_ARCHITECTURE.md for the resulting cache design.
export type RoleId = 'research' | 'design' | 'process' | 'quality' | 'planning' | 'operation' | 'student' | 'teaching'
  | 'data' | 'safety' | 'software' | 'founder' | 'admin' | 'general';
export type GoalIntentId = 'automate' | 'analyze' | 'report' | 'clean' | 'understand';
// What a role actually changes: the data it looks at, the number it cares about, and the decision it supports.
// Content generation reads these fields instead of interpolating the learner's own job title into a sentence.
export type Role = {
  id: RoleId; label: string; keywords: string[];
  subject: string; metric: string; decision: string; themeBias: string[];
};
export const roles: Role[] = [
  { id: 'research', label: '연구·개발', keywords: ['연구', '연구개발', 'r&d', 'rnd', '실험', 'research', '선행'],
    subject: '실험 관측값', metric: '재현성과 분산', decision: '실험 조건을 바꿀지', themeBias: ['compare', 'clean', 'quality'] },
  { id: 'design', label: '설계', keywords: ['설계', 'design', '회로', '도면', '구조해석', '시뮬레이션'],
    subject: '설계 검증 결과', metric: '사양 충족 여부', decision: '설계를 수정할지', themeBias: ['compare', 'quality', 'clean'] },
  { id: 'process', label: '공정·생산', keywords: ['공정', '생산', '제조', '양산', 'process', 'manufactur', '라인'],
    subject: '공정 계측 로그', metric: '수율과 변동 폭', decision: '공정 조건을 조정할지', themeBias: ['quality', 'compare', 'clean'] },
  { id: 'quality', label: '품질·분석', keywords: ['품질', '검사', '시험', '분석', '신뢰성', 'quality', 'qa', 'qc', '측정'],
    subject: '검사 측정값', metric: '규격 충족 비율', decision: '합격으로 판정할지', themeBias: ['quality', 'clean', 'compare'] },
  { id: 'planning', label: '기획·PM', keywords: ['기획', 'pm', '프로젝트', 'project', '관리', 'product', '운영기획', '일정'],
    subject: '작업 진행 기록', metric: '진척과 지연', decision: '일정을 다시 잡을지', themeBias: ['compare', 'clean', 'async'] },
  { id: 'operation', label: '현장·운영', keywords: ['운영', '현장', '유지보수', '보전', '설비', '가동', 'operation', 'maintenance'],
    subject: '설비 가동 이력', metric: '가동률과 이상 발생 빈도', decision: '언제 점검할지', themeBias: ['async', 'quality', 'clean'] },
  { id: 'student', label: '학생·취업준비', keywords: ['학생', '대학생', '학부', '석사', '박사', '취준', '준비생', 'student', '조교'],
    subject: '수업·실험 과제 데이터', metric: '결과를 설명할 수 있는 정도', decision: '리포트에 어떤 결론을 쓸지', themeBias: ['clean', 'compare', 'quality'] },
  { id: 'teaching', label: '교육·강의', keywords: ['교육', '강의', '강사', '교사', '튜터', 'teaching', 'instructor'],
    subject: '학습 활동 기록', metric: '이해도 분포', decision: '다음 수업에서 무엇을 다룰지', themeBias: ['compare', 'clean', 'quality'] },
  { id: 'data', label: '데이터·분석', keywords: ['데이터', '분석가', '데이터분석', 'analyst', '머신러닝', 'ml', '인공지능'],
    subject: '수집한 원자료', metric: '지표의 안정성', decision: '어떤 지표를 보고할지', themeBias: ['clean', 'compare', 'async'] },
  { id: 'safety', label: '안전·환경', keywords: ['안전', '환경', '보건', '방재', 'ehs', 'safety'],
    subject: '점검·측정 기록', metric: '기준 초과 건수', decision: '작업을 멈출지', themeBias: ['quality', 'clean', 'compare'] },
  { id: 'software', label: '개발·IT', keywords: ['개발자', '소프트웨어', '프로그래머', '백엔드', '프론트', 'developer', 'software'],
    subject: '서비스 로그와 지표', metric: '오류율과 지연', decision: '배포를 진행할지', themeBias: ['async', 'clean', 'compare'] },
  { id: 'founder', label: '창업·1인 운영', keywords: ['창업', '대표', '자영업', '프리랜서', '1인', 'founder', 'startup'],
    subject: '매출·고객 기록', metric: '반복 구매와 이탈', decision: '어디에 시간을 쓸지', themeBias: ['compare', 'clean', 'quality'] },
  { id: 'admin', label: '사무·운영지원', keywords: ['사무', '총무', '인사', '경리', '행정', '지원', 'admin'],
    subject: '업무 접수 기록', metric: '처리 건수와 대기 시간', decision: '어느 단계를 자동화할지', themeBias: ['clean', 'compare', 'async'] },
  // Fallback. Kept last so an unmatched role lands here deliberately rather than by accident.
  { id: 'general', label: '기타 직무', keywords: [],
    subject: '업무 측정 데이터', metric: '기준 충족 여부', decision: '다음 조치를 정할지', themeBias: ['clean', 'compare', 'quality'] },
];
// What the learner wants to end up with. Shapes how a lesson is framed, not which data it uses.
export type GoalIntent = { id: GoalIntentId; label: string; keywords: string[]; framing: string };
export const goalIntents: GoalIntent[] = [
  { id: 'automate', label: '반복 작업 자동화', keywords: ['자동화', '자동', '반복', '스크립트', '매크로', 'automat', '줄이'],
    framing: '손으로 반복하던 절차를 함수 하나로 바꾸는 데 초점을 둡니다.' },
  { id: 'report', label: '보고·시각화', keywords: ['보고', '리포트', '시각화', '대시보드', '그래프', '차트', 'report', 'dashboard', '발표'],
    framing: '집계 결과를 남에게 설명할 수 있는 형태로 만드는 데 초점을 둡니다.' },
  { id: 'clean', label: '데이터 정리', keywords: ['정리', '정제', '전처리', '클렌징', '누락', '결측', '이상치', 'clean'],
    framing: '믿을 수 있는 입력을 만드는 과정, 즉 무엇을 버리고 무엇을 남길지에 초점을 둡니다.' },
  { id: 'analyze', label: '분석·비교', keywords: ['분석', '비교', '통계', '상관', '추세', '경향', '원인', 'analy'],
    framing: '숫자들 사이의 차이가 의미 있는 차이인지 판단하는 데 초점을 둡니다.' },
  // Fallback: a learning platform's safest default is "I want to understand how it works".
  { id: 'understand', label: '원리 이해', keywords: ['이해', '원리', '배우', '공부', '학습', '익히', 'understand', '어떻게 작동'],
    framing: '코드가 왜 그렇게 동작하는지 따라가며 확인하는 데 초점을 둡니다.' },
];
// Highest keyword hit count wins; ties go to declaration order; no hit falls back to the last entry.
// Deterministic on purpose: the same wording must always produce the same category, on any machine, with no
// model call. An LLM pass can be layered on later for text this table misses, but it must write its answer
// back into these same bounded ids.
function classify<T extends { id: string; keywords: string[] }>(entries: T[], text: string): T {
  const haystack = text.toLowerCase();
  let best: T | undefined; let bestScore = 0; let bestAt = Number.MAX_SAFE_INTEGER;
  for (const entry of entries) {
    let score = 0; let at = Number.MAX_SAFE_INTEGER;
    for (const keyword of entry.keywords) {
      const index = haystack.indexOf(keyword);
      if (index >= 0) { score++; at = Math.min(at, index); }
    }
    // More matches wins. On a tie the keyword appearing earliest wins, because Korean job titles name the
    // domain first and the generic activity last: 공정설계 is process work, 회로설계 is design work, and
    // 품질관리 is quality work rather than planning.
    if (score > bestScore || (score === bestScore && score > 0 && at < bestAt)) { best = entry; bestScore = score; bestAt = at; }
  }
  return best || entries[entries.length - 1];
}
export function resolveRole(input: { role: string; roleId?: string; goal?: string }): Role {
  const explicit = roles.find(r => r.id === input.roleId && r.id !== 'general');
  if (explicit) return explicit;
  // The job title carries the signal; the goal sentence only breaks ties, so a goal like "자동화하고 싶다"
  // cannot override an explicit job title.
  const matched = classify(roles, input.role);
  return matched.id === 'general' && input.goal ? classify(roles, input.goal) : matched;
}
// A learner often carries more than one signal ("연구개발 및 PM"). The primary role decides how the content is
// framed, but a secondary signal can still earn an extra track, so the raw match stays available. Keeping this
// here means the keyword list has exactly one home.
export function hasRoleSignal(text: string, id: RoleId): boolean {
  const role = roles.find(r => r.id === id);
  if (!role) return false;
  const haystack = text.toLowerCase();
  return role.keywords.some(keyword => haystack.includes(keyword));
}
export function resolveGoalIntent(goal: string): GoalIntent {
  return classify(goalIntents, goal);
}
export const roleLabels = Object.fromEntries(roles.map(r => [r.id, r.label])) as Record<RoleId, string>;

// The language the learner wants to read, write and prompt in.
//
// executable=true means the browser sandbox can run and grade it today. Python would need a WebAssembly runtime
// (Pyodide, roughly 10MB on first load) that this MVP does not ship, so it is honest about what it is for now:
// prompts, examples and theory come in Python, while the runnable graded practice stays TypeScript. Flipping
// executable to true later is the only change this table needs. See docs/DATA_ARCHITECTURE.md.
export type LanguageId = 'typescript' | 'javascript' | 'python' | 'sql' | 'r';
export type Language = { id: LanguageId; label: string; executable: boolean; ecosystem: string; note: string };
export const languages: Language[] = [
  { id: 'typescript', label: 'TypeScript', executable: true, ecosystem: 'Node.js · React · Vitest',
    note: '브라우저에서 바로 실행하고 테스트로 채점합니다. JavaScript에 타입 표기를 더한 언어라 JavaScript 문법이 그대로 통합니다.' },
  { id: 'javascript', label: 'JavaScript', executable: true, ecosystem: 'Node.js · 브라우저',
    note: '타입 없이 먼저 익히고 싶을 때 고르세요. 빈칸 실습은 TypeScript 형태로 제공되지만 타입 표기를 지워도 그대로 실행되고 채점됩니다.' },
  { id: 'python', label: 'Python', executable: false, ecosystem: 'pandas · matplotlib · Jupyter',
    note: '데이터 업무에서 가장 많이 만나는 언어입니다. 프롬프트와 예제를 Python으로 드리고, 브라우저에서 채점되는 실습은 아직 TypeScript입니다.' },
  { id: 'sql', label: 'SQL', executable: true, ecosystem: 'PostgreSQL · SQLite · BigQuery',
    note: '데이터가 DB에 있다면 반드시 만나는 언어입니다. 브라우저 안의 SQLite에서 질의문을 그대로 실행하고 채점합니다.' },
  { id: 'r', label: 'R', executable: true, ecosystem: 'tidyverse · ggplot2 · RStudio',
    note: '통계와 논문 그래프에 강한 언어입니다. 브라우저에서 실제 R을 실행해 채점합니다. 처음 실행할 때 R 런타임 약 17MB를 내려받습니다.' },
];
// The sandbox compiles TypeScript to JavaScript and runs it in a Worker, so only those two execute today.
// If a second runtime is ever added, SQL is the cheapest one: SQLite compiled to WebAssembly (sql.js) is about
// 1MB, against roughly 10MB for CPython (Pyodide) and more for R (webR).
export const defaultLanguage: LanguageId = 'typescript';
export function resolveLanguage(id?: string): Language {
  return languages.find(l => l.id === id) || languages[0];
}
// What the learner wants to end up holding. Vibe coding starts from a picture of the finished thing, so this
// shapes the closing step of a curriculum rather than the data it uses.
export type OutputTargetId = 'script' | 'notebook' | 'webapp' | 'automation' | 'dashboard';
export type OutputTarget = { id: OutputTargetId; label: string; hint: string; closing: string };
export const outputTargets: OutputTarget[] = [
  { id: 'script', label: '한 번에 돌리는 스크립트', hint: '파일 하나를 받아 결과를 내보내는 형태',
    closing: '입력 파일을 바꿔도 같은 결과가 나오는지 확인하고, 실행 방법을 README에 적습니다.' },
  { id: 'notebook', label: '분석 노트북', hint: '단계별로 실행하며 설명과 그래프를 남기는 형태',
    closing: '각 단계가 왜 필요한지 주석으로 남기고, 결론을 문장으로 정리합니다.' },
  { id: 'webapp', label: '웹 화면이 있는 도구', hint: '다른 사람도 열어서 쓸 수 있는 형태',
    closing: '빈 입력과 잘못된 입력에서 화면이 어떻게 반응하는지 확인합니다.' },
  { id: 'automation', label: '주기적으로 도는 자동화', hint: '켜두지 않아도 정해진 때에 도는 형태',
    closing: '실패했을 때 무엇을 남겨야 다음에 원인을 찾을 수 있을지 정합니다.' },
  { id: 'dashboard', label: '지표를 보는 대시보드', hint: '숫자를 계속 확인하는 형태',
    closing: '숫자가 이상할 때 원자료까지 되짚어갈 수 있는 경로를 만듭니다.' },
];
export function resolveOutputTarget(id?: string): OutputTarget {
  return outputTargets.find(t => t.id === id) || outputTargets[0];
}
// Where the learner will actually run what they build. Vibe coding rarely happens in one place: the data sits
// in a spreadsheet, the code gets written in an editor with an assistant, and the result has to survive being
// re-run tomorrow. Selecting these changes the closing guidance, not the subject matter, so they stay out of
// contentKey.
export type EnvironmentId = 'browser' | 'editor' | 'notebook' | 'terminal' | 'spreadsheet' | 'git';
export type Environment = { id: EnvironmentId; label: string; hint: string };
export const environments: Environment[] = [
  { id: 'browser', label: '이 화면의 실습 편집기', hint: '설치 없이 바로 실행하고 채점받습니다.' },
  { id: 'editor', label: 'VS Code · Cursor 같은 편집기', hint: 'AI 자동완성과 함께 파일을 직접 다룹니다.' },
  { id: 'notebook', label: 'Jupyter · Colab 노트북', hint: '셀 단위로 실행하며 결과와 설명을 함께 남깁니다.' },
  { id: 'terminal', label: '터미널 · 셸', hint: '명령 한 줄로 실행하고 결과를 파일로 남깁니다.' },
  { id: 'spreadsheet', label: '엑셀 · 구글 시트', hint: '데이터가 이미 있는 곳에서 시작하고, 내보내기부터 연결합니다.' },
  { id: 'git', label: 'Git · GitHub', hint: '바꾼 내용을 기록하고 언제든 되돌릴 수 있게 합니다.' },
];
export function resolveEnvironments(ids?: string[]): Environment[] {
  const chosen = environments.filter(e => ids?.includes(e.id));
  return chosen.length ? chosen : [environments[0]];
}
// How much the learner has worked with an AI coding assistant. This is the dimension that makes the platform
// about vibe coding rather than about typing code: it changes how much of the prompt is handed over and how
// much verification is asked for.
export type PromptSkillId = 'none' | 'some' | 'fluent';
export type PromptSkill = { id: PromptSkillId; label: string; coaching: string };
export const promptSkills: PromptSkill[] = [
  { id: 'none', label: 'AI에게 코드를 요청해 본 적 없어요',
    coaching: '프롬프트를 통째로 드립니다. 한 군데만 바꿔 보고 결과가 어떻게 달라지는지 함께 확인합니다.' },
  { id: 'some', label: '써봤지만 원하는 답을 얻기 어려워요',
    coaching: '요구사항을 조각으로 나눠 요청하는 순서와, 돌아온 코드를 테스트로 확인하는 습관을 연습합니다.' },
  { id: 'fluent', label: 'AI로 코드를 자주 만들어요',
    coaching: '생성된 코드의 경계 조건과 실패 사례를 먼저 의심하는 데 초점을 둡니다.' },
];
export function resolvePromptSkill(id?: string): PromptSkill {
  return promptSkills.find(s => s.id === id) || promptSkills[1];
}
// Which assistant the learner already has open. Only used to phrase the copy-and-paste guidance.
export const aiTools = [
  { id: 'chatgpt', label: 'ChatGPT' }, { id: 'claude', label: 'Claude' }, { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'gemini', label: 'Gemini' }, { id: 'cursor', label: 'Cursor' }, { id: 'other', label: '그 밖의 도구' },
];

