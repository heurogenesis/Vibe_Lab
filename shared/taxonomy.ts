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
export type RoleId = 'research' | 'design' | 'process' | 'quality' | 'planning' | 'operation' | 'student' | 'teaching' | 'general';
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
