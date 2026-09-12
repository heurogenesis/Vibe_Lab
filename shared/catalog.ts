import type { Profile } from './schema.js';
import { hasRoleSignal, resolveEnvironments, resolveGoalIntent, resolveLanguage, resolveOutputTarget,
  resolvePromptSkill, resolveRole, type Environment, type GoalIntentId, type Language, type OutputTarget,
  type PromptSkill, type Role } from './taxonomy.js';

// IDs are content identifiers, not database enums. New personas and disciplines are
// registered here without changing stored profiles or the execution protocol.
export const CATALOG_VERSION = 'engineering-2026-09-v1';
export const personas = [
  { id: 'student', label: '이공계 대학생' },
  { id: 'engineer', label: '실무 엔지니어' },
];
export const themes = [
  { id: 'clean', label: '데이터 정제', concept: '함수 · 필터 · 평균' },
  { id: 'compare', label: '실험·조건 비교', concept: '그룹화 · 집계 · 데이터 구조' },
  { id: 'quality', label: '품질·기준 확인', concept: '조건식 · 경계값 · 비율' },
  { id: 'async', label: '비동기 데이터 처리', concept: 'Promise · 병렬 처리 · 부분 실패' },
];
export type ThemeId = typeof themes[number]['id'];
export type DataRow = { group: string; value: number | null };
export type Discipline = {
  id: string; label: string; keywords: string[]; subject: string;
  measurement: string; unit: string; min: number; max: number;
  groups: [string, string]; context: string;
};
export const disciplines: Discipline[] = [
  { id: 'electronics', label: '전기·전자', keywords: ['전자','전기','electrical','electronic'], subject: '센서 측정 로그', measurement: '전압', unit: 'V', min: 0, max: 3.3, groups: ['센서 A','센서 B'], context: '센서별 측정값을 정제하고 허용 범위와 비교합니다.' },
  { id: 'mechanical', label: '기계·항공', keywords: ['기계','항공','mechanical','aerospace'], subject: '회전 장비 시험', measurement: '진동 속도', unit: 'mm/s', min: 0, max: 10, groups: ['장비 A','장비 B'], context: '장비 시험 조건별 진동 기록을 비교합니다.' },
  { id: 'chemical', label: '화학·화학공학', keywords: ['화학','화공','chemical','chemistry'], subject: '반응 조건 실험', measurement: '수율', unit: '%', min: 0, max: 100, groups: ['조건 A','조건 B'], context: '반응 조건별 수율을 정리하고 누락된 실험을 구분합니다.' },
  { id: 'materials', label: '재료·신소재', keywords: ['재료','신소재','금속','material'], subject: '소재 인장 시험', measurement: '인장 강도', unit: 'MPa', min: 0, max: 1000, groups: ['소재 A','소재 B'], context: '소재별 시험 결과를 집계하고 측정 범위를 확인합니다.' },
  { id: 'civil', label: '토목·건축', keywords: ['토목','건축','civil','architect'], subject: '구조물 변위 관측', measurement: '변위', unit: 'mm', min: -20, max: 20, groups: ['지점 A','지점 B'], context: '관측 지점별 부호가 있는 변위 데이터를 비교합니다.' },
  { id: 'environment', label: '환경·에너지', keywords: ['환경','에너지','지구','environment','energy'], subject: '환경 관측 기록', measurement: '기온', unit: '°C', min: -40, max: 60, groups: ['관측소 A','관측소 B'], context: '관측소별 온도 기록에서 음수와 누락값을 구분합니다.' },
  { id: 'life', label: '생명·바이오', keywords: ['생명','생물','바이오','bio','life'], subject: '생물 표본 측정', measurement: '질량', unit: 'g', min: 0, max: 10000, groups: ['종 A','종 B'], context: '표본 그룹별 질량을 집계하고 공개 생태 데이터를 함께 탐색합니다.' },
  { id: 'software', label: '컴퓨터·정보통신', keywords: ['컴퓨터','소프트웨어','정보','통신','computer','software'], subject: '서비스 응답 로그', measurement: '응답 시간', unit: 'ms', min: 0, max: 5000, groups: ['API A','API B'], context: '서비스별 응답 시간과 실패한 요청을 분리해 분석합니다.' },
  { id: 'science', label: '물리·수학·통계', keywords: ['물리','수학','통계','physics','math','statistic'], subject: '반복 측정 실험', measurement: '기준 대비 오차', unit: 'a.u.', min: -5, max: 5, groups: ['조건 A','조건 B'], context: '반복 측정의 부호 있는 오차와 조건별 평균을 비교합니다.' },
  { id: 'semiconductor', label: '반도체·디스플레이', keywords: ['반도체','디스플레이','웨이퍼','tft','포토','식각','semiconductor','display'], subject: '웨이퍼 계측 로그', measurement: '막 두께', unit: 'nm', min: 0, max: 500, groups: ['로트 A','로트 B'], context: '로트별 계측값의 산포를 비교하고 측정 실패를 구분합니다.' },
  { id: 'automotive', label: '자동차·모빌리티', keywords: ['자동차','모빌리티','차량','완성차','automotive','vehicle'], subject: '주행 시험 로그', measurement: '연비', unit: 'km/L', min: 0, max: 30, groups: ['차량 A','차량 B'], context: '주행 조건별 연비 기록을 비교합니다.' },
  { id: 'industrial', label: '산업·시스템공학', keywords: ['산업공학','시스템공학','물류','생산관리','최적화','industrial'], subject: '작업 시간 기록', measurement: '사이클 타임', unit: '초', min: 0, max: 600, groups: ['라인 A','라인 B'], context: '공정 단계별 소요 시간과 결측 구간을 정리합니다.' },
  { id: 'biomedical', label: '의공학·헬스케어', keywords: ['의공학','의료','헬스케어','재활','biomedical','medical'], subject: '생체 신호 기록', measurement: '심박수', unit: 'bpm', min: 30, max: 200, groups: ['피험자 A','피험자 B'], context: '합성 샘플에서 잡음과 결측을 구분합니다. 실제 진단이나 의학적 판단에 사용하지 않습니다.' },
  { id: 'agrifood', label: '식품·농업', keywords: ['식품','농업','축산','원예','발효','agri','food'], subject: '품질 검사 기록', measurement: '당도', unit: 'Brix', min: 0, max: 30, groups: ['농장 A','농장 B'], context: '수확 배치별 품질 편차를 확인합니다.' },
  { id: 'marine', label: '해양·조선', keywords: ['해양','조선','선박','항만','marine','naval'], subject: '운항 계측 기록', measurement: '선속', unit: 'knot', min: 0, max: 40, groups: ['항로 A','항로 B'], context: '항로별 운항 기록에서 결측 구간을 정리합니다.' },
  { id: 'business', label: '경영·경제', keywords: ['경영','경제','회계','마케팅','물류관리','business','economics'], subject: '운영 지표 기록', measurement: '일 매출', unit: '만원', min: 0, max: 5000, groups: ['지점 A','지점 B'], context: '지점별 운영 지표에서 누락과 이상값을 구분합니다.' },
  { id: 'general', label: '융합·기타 분야', keywords: [], subject: '업무 측정 데이터', measurement: '측정값', unit: 'a.u.', min: -100, max: 100, groups: ['그룹 A','그룹 B'], context: '다양한 분야에 적용할 수 있는 데이터 정제와 집계를 학습합니다.' },
];
export const projectDiscipline: Discipline = { id: 'project', label: '프로젝트·생산 운영', keywords: [], subject: '프로젝트 작업 기록', measurement: '작업 소요 시간', unit: '시간', min: 0, max: 160, groups: ['프로젝트 A','프로젝트 B'], context: '프로젝트별 작업 시간을 비교합니다. 작업 시간 평균을 완료율이나 생산성으로 해석하지 않습니다.' };

export function resolveDiscipline(profile: Profile): Discipline {
  const explicit = disciplines.find(d => d.id === profile.disciplineId && d.id !== 'general');
  if (explicit) return explicit;
  const major = profile.major.toLowerCase();
  return disciplines.find(d => d.keywords.some(k => major.includes(k))) || disciplines[disciplines.length - 1];
}
export function usesPractice(profile: Profile) { return profile.domain === 'data' || !!profile.personaId || resolveDiscipline(profile).id !== 'general'; }
export function preferredThemes(profile: Profile): string[] {
  const explicit = (profile.interests || []).filter(id => themes.some(t => t.id === id));
  if (explicit.length) return [...new Set(explicit)];
  // The role decides which kind of data problem comes first. The regexes that used to live here are now one
  // classification in shared/taxonomy.ts, so the same wording cannot mean different things in different places.
  return roleOf(profile).themeBias;
}
function roleOf(profile: Profile): Role { return resolveRole({ role: profile.role, roleId: profile.roleId, goal: profile.goal }); }
// The normalized identity of a learner. Everything downstream reasons about this, never about the raw sentences.
//
// contentKey is the part shared by every learner with this background, so a generated body may be cached under
// it: discipline(10) x role(9) x theme(4) = 360 possible values, no matter how many learners sign up.
// level, goalIntent and style only change how the same body is presented, so they stay out of contentKey -
// including them would multiply the cache and the generation cost by 45 without changing the subject matter.
// The learner's own goal sentence is in neither key: it is personal text, applied at render time only.
export type ProfileSignature = {
  discipline: Discipline; role: Role; themeId: string; language: Language;
  outputTarget: OutputTarget; promptSkill: PromptSkill; environments: Environment[];
  level: Profile['level']; goalIntent: GoalIntentId;
  contentKey: string; renderKey: string;
};
export function profileSignature(profile: Profile): ProfileSignature {
  const discipline = resolveDiscipline(profile);
  const role = roleOf(profile);
  const themeId = preferredThemes(profile)[0];
  const goalIntent = resolveGoalIntent(profile.goal).id;
  const language = resolveLanguage(profile.languageId);
  const outputTarget = resolveOutputTarget(profile.outputTargetId);
  const promptSkill = resolvePromptSkill(profile.promptSkillId);
  // Language belongs in contentKey: a Python lesson body is genuinely different material, not the same body
  // presented differently. Output target, prompt skill, level and style only reshape one body, so they stay out.
  return { discipline, role, themeId, language, outputTarget, promptSkill,
    environments: resolveEnvironments(profile.environments), level: profile.level, goalIntent,
    contentKey: `${discipline.id}:${role.id}:${themeId}:${language.id}`,
    renderKey: `${discipline.id}:${role.id}:${themeId}:${language.id}:${outputTarget.id}:${promptSkill.id}:${profile.level}:${goalIntent}:${profile.style}` };
}
export function recommendation(profile: Profile) {
  const d = resolveDiscipline(profile);
  const role = roleOf(profile);
  // Primary role or a secondary planning signal: someone described as "연구개발 및 PM" is framed as a
  // researcher but still gets the project aggregation track.
  const project = role.id === 'planning' || hasRoleSignal(`${profile.role} ${profile.goal}`, 'planning');
  const tracks = project ? [d, projectDiscipline] : [d];
  const preferences = preferredThemes(profile);
  // A planning role still learns on their own field's data; the project track is added alongside, and only
  // takes over when the field itself could not be identified.
  const primary = project && d.id === 'general' ? projectDiscipline : d;
  const ids = preferences.slice(0, 3).map(t => `${primary.id}:${t}`);
  for (const theme of themes) if (ids.length < 3 && !ids.includes(`${primary.id}:${theme.id}`)) ids.push(`${primary.id}:${theme.id}`);
  if (project && primary.id !== 'project') ids[2] = 'project:compare';
  return { discipline: d, tracks, role, exerciseIds: ids, reason: `${d.label} · ${role.label} 조합에서 ${primary.subject}의 ${role.metric}을 다룹니다. ${role.decision}를 판단할 때 쓰는 계산이라고 생각하면 됩니다. ${d.id === 'general' ? '등록한 전공과 정확히 일치하는 분야가 없어 공통 데이터 실습으로 시작합니다. ' : ''}${project ? '기획·PM 직무라 프로젝트 집계 실습을 함께 추천합니다. ' : ''}난이도는 직무 대신 선택한 코딩 경험을 기준으로 정합니다.` };
}

export type ExerciseTest = { name: string; input: unknown; expected: unknown; hint: string };
export type Exercise = {
  id: string; version: string; disciplineId: string; theme: string; title: string;
  objective: string; theory: string; contract: string; starter: string;
  tests: ExerciseTest[]; hints: string[]; sample: DataRow[];
  sourceIds: string[]; referenceUrl: string;
};
const rowType = 'type Row = { group: string; value: number | null };';
export function sampleRows(d: Discipline): DataRow[] {
  const middle = (d.min + d.max) / 2;
  return [{ group: d.groups[0], value: d.min }, { group: d.groups[0], value: middle }, { group: d.groups[1], value: d.max }, { group: d.groups[1], value: null }, { group: d.groups[1], value: d.max + 1 }];
}
const mean = (a: number[]) => a.length ? a.reduce((sum, n) => sum + n, 0) / a.length : null;
export function getExercise(id: string): Exercise | undefined {
  const [disciplineId, theme, extra] = id.split(':');
  const d = [...disciplines, projectDiscipline].find(x => x.id === disciplineId);
  if (!d || extra || !themes.some(t => t.id === theme)) return undefined;
  const rows = sampleRows(d);
  const bounds = `${d.min} ≤ ${d.measurement} ≤ ${d.max} ${d.unit}`;
  const base = { id, version: CATALOG_VERSION, disciplineId, theme, sample: rows, sourceIds: d.id === 'life' ? ['palmer-penguins'] : [], referenceUrl: 'https://github.com/simple-statistics/simple-statistics', hints: ['입력과 반환 타입을 먼저 읽어 보세요.', '실패한 테스트의 기대값과 실제값을 비교하세요.'] };
  if (theme === 'clean') return { ...base, title: `${d.subject}: 유효 데이터 평균`, objective: `${d.measurement}(${d.unit})에서 누락값과 범위 밖 값을 제외한 평균 함수를 만듭니다.`, contract: `solve(rows: Row[]): number | null. ${bounds}, 양 끝 포함. null과 유한하지 않은 값은 제외합니다. 남은 값이 없으면 null입니다. 이 범위는 학습용 계약이며 산업 안전 기준이 아닙니다.`, theory: '필터는 어떤 관측을 계산에 포함할지 결정합니다. 0과 음수도 계약 범위 안에서는 유효합니다. 평균의 분모는 전체 행 수가 아니라 유효한 관측 수입니다. 필터로 제거한 원자료를 잘못된 측정이라고 단정하지 마세요.', starter: `${rowType}\nfunction solve(rows: Row[]): number | null {\n  const values = rows\n    .map(row => row.value)\n    .filter((value): value is number => {\n      return /* BLANK 1: 유효 숫자와 범위 검사 */ false;\n    });\n  if (values.length === 0) return null;\n  return /* BLANK 2: 합계 / 개수 */ 0;\n}`, tests: [
    { name: '정상·누락·범위 초과 혼합', input: rows, expected: (d.min+d.max)/2, hint: 'null을 0으로 변환하지 말고, 범위 밖 값도 제외하세요.' },
    { name: '빈 데이터', input: [], expected: null, hint: '관측이 없다는 것은 평균이 0이라는 뜻이 아닙니다.' },
    { name: '양 끝 경계 포함', input: [{group:'A',value:d.min},{group:'A',value:d.max}], expected: (d.min+d.max)/2, hint: '하한·상한을 포함하는 비교 연산자를 확인하세요.' },
    { name: '상한 한 건', input: [{group:'A',value:d.max}], expected: d.max, hint: '상수 값을 반환하지 말고 실제 입력을 계산하세요.' },
    { name: '전부 무효', input: [{group:'A',value:null},{group:'A',value:d.min-1},{group:'A',value:NaN},{group:'A',value:Infinity}], expected: null, hint: 'Number.isFinite와 null 검사를 함께 사용하세요.' },
  ], hints: [...base.hints, `typeof value === 'number'인 경우에만 ${bounds}를 검사해 보세요.`] };
  if (theme === 'compare') return { ...base, title: `${d.subject}: 그룹별 비교`, objective: `${d.groups.join(' / ')}의 ${d.measurement} 평균을 그룹별로 계산합니다.`, contract: 'solve(rows: Row[]): Record<string, number | null>. 그룹별 유한한 숫자의 평균. null은 제외하며 숫자가 없는 그룹은 null입니다. 빈 입력은 {}입니다. 이 실습은 유한한 범위 밖 값도 포함하여 정제 실습과 차이를 비교합니다.', theory: `집계 키는 어떤 관측을 같은 조건으로 묶을지 정합니다. 그룹마다 유효한 관측 수가 다르므로 합계와 개수를 따로 관리해야 합니다. ${d.context} 평균만으로 인과관계나 통계적 유의성을 판단할 수는 없습니다.`, starter: `${rowType}\nfunction solve(rows: Row[]): Record<string, number | null> {\n  const groups = new Map<string, number[]>();\n  for (const row of rows) {\n    if (!groups.has(row.group)) groups.set(row.group, []);\n    /* BLANK 1: 유효 숫자를 해당 그룹에 추가 */\n  }\n  return Object.fromEntries([...groups].map(([key, values]) => [\n    key, /* BLANK 2: 그룹 평균 또는 null */ null\n  ]));\n}`, tests: [
    { name: '서로 다른 그룹 평균', input: rows, expected: {[d.groups[0]]: mean([d.min,(d.min+d.max)/2]),[d.groups[1]]:mean([d.max,d.max+1])}, hint: '각 그룹의 합계와 유효 개수를 독립적으로 계산하세요.' },
    { name: '빈 데이터', input: [], expected: {}, hint: '존재하지 않는 그룹을 생성하지 않습니다.' },
    { name: '누락값만 있는 그룹', input: [{group:'missing',value:null},{group:'valid',value:2}], expected: {missing:null,valid:2}, hint: '그룹은 유지하고 관측이 없다는 사실을 null로 반환하세요.' },
    { name: '특수 이름·0·음수', input: [{group:'__proto__',value:0},{group:'constructor',value:-2}], expected: Object.fromEntries([['__proto__',0],['constructor',-2]]), hint: '그룹 키 충돌을 피하려면 Map으로 집계하세요. 0과 음수도 숫자입니다.' },
  ] };
  if (theme === 'quality') return { ...base, title: `${d.subject}: 기준 충족 비율`, objective: `${d.measurement} 기록에서 유효 관측 수와 ${bounds} 조건을 충족하는 비율을 계산합니다.`, contract: 'solve(rows: Row[]): { observed: number; accepted: number; rate: number | null }. null·NaN·Infinity는 관측 수에서 제외하고, 범위 밖의 유한한 숫자는 관측 수에 포함합니다. rate는 accepted/observed (0~1)이며 관측이 없으면 null. 범위는 학습용 계약입니다.', theory: '비율은 분모의 정의에 따라 해석이 달라집니다. 누락된 측정을 정상으로 간주하면 결과가 왜곡됩니다. 범위 밖 관측은 평균 정제에서는 제외할 수 있지만 품질 비율의 분모에는 남겨야 합니다.', starter: `${rowType}\nfunction solve(rows: Row[]): { observed: number; accepted: number; rate: number | null } {\n  const values = rows.map(row => row.value).filter(\n    (value): value is number => typeof value === 'number' && Number.isFinite(value)\n  );\n  const accepted = values.filter(value => /* BLANK 1: 양 끝 포함 범위 */ false).length;\n  return { observed: values.length, accepted, rate: /* BLANK 2: 비율 또는 null */ null };\n}`, tests: [
    { name: '누락값을 분모에서 제외', input: rows, expected: {observed:4,accepted:3,rate:0.75}, hint: '범위 밖 숫자는 실패한 관측으로 분모에 포함합니다.' },
    { name: '빈 데이터', input: [], expected: {observed:0,accepted:0,rate:null}, hint: '관측이 없으면 0% 또는 100%로 표현하지 않습니다.' },
    { name: '양 끝값 충족', input: [{group:'A',value:d.min},{group:'A',value:d.max}], expected: {observed:2,accepted:2,rate:1}, hint: '양 끝값을 포함하세요.' },
    { name: '전부 범위 밖', input: [{group:'A',value:d.min-1}], expected: {observed:1,accepted:0,rate:0}, hint: '정상 관측이 없어도 관측 자체는 존재합니다.' },
  ] };
  return { ...base, title: `${d.subject}: 비동기 수집`, objective: `${d.subject}의 여러 데이터 묶음을 불러오고 실패한 묶음을 별도로 보고합니다.`, contract: 'solve(loaders: Array<() => Promise<Row[]>>): Promise<{rows: Row[]; failed: number}>. 모든 loader를 시작하고 성공한 행을 입력 묶음 순서로 합칩니다. 일부 실패해도 다른 결과를 보존합니다. 실제 네트워크 대신 테스트용 loader를 주입합니다.', theory: 'Promise.all은 하나라도 거절되면 전체 대기가 거절됩니다. Promise.allSettled는 각 작업의 성공과 실패를 분리합니다. 실패를 빈 데이터와 구분하면 누락된 수집을 숨기지 않을 수 있습니다. 네트워크 접근과 집계 함수를 분리하면 테스트가 재현 가능합니다.', starter: `${rowType}\nasync function solve(loaders: Array<() => Promise<Row[]>>): Promise<{ rows: Row[]; failed: number }> {\n  const results = await Promise.allSettled(\n    loaders.map(load => Promise.resolve().then(load))\n  );\n  const rows: Row[] = [];\n  let failed = 0;\n  for (const result of results) {\n    /* BLANK: 성공이면 rows에 합치고 실패이면 failed 증가 */\n  }\n  return { rows, failed };\n}`, tests: [
    { name: '성공·실패 혼합', input: [{rows:rows.slice(0,2)},{error:true},{rows:rows.slice(2,3)}], expected: {rows:rows.slice(0,3),failed:1}, hint: 'fulfilled와 rejected 결과를 나누어 처리하세요.' },
    { name: '빈 수집 목록', input: [], expected: {rows:[],failed:0}, hint: '요청이 없다는 것은 요청 실패가 아닙니다.' },
    { name: '모두 실패', input: [{error:true},{error:true}], expected: {rows:[],failed:2}, hint: '실패 횟수를 숨기지 말고 반환하세요.' },
    { name: '완료 순서와 입력 순서', input: [{rows:[rows[0]],delay:30},{rows:[rows[1]],delay:0}], expected: {rows:rows.slice(0,2),failed:0}, hint: 'Promise 완료 시점과 입력 순서는 다릅니다.' },
  ], referenceUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled' };
}
export function listExercises() { return [...disciplines,projectDiscipline].flatMap(d => themes.map(t => getExercise(`${d.id}:${t.id}`)!)); }
