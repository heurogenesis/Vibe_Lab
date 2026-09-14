import { z } from 'zod';
import { getExercise, recommendation, resolveDiscipline, type Discipline } from '../shared/catalog.js';
import type { Assignment, Curriculum, Profile } from '../shared/schema.js';

export const BANK_VERSION = '2026-09-15-v1';
const kinds = ['mean', 'valid-count', 'missing', 'group-mean', 'weighted', 'group-count', 'rate', 'rejected', 'boundary', 'failures', 'requests', 'partial', 'median', 'median-count', 'outlier', 'moving', 'window-count', 'window-null', 'normalized', 'span', 'outside', 'state', 'validation', 'sql', 'http', 'duplicate', 'secret'] as const;
export const templateSchema = z.object({
  id: z.string().min(1).max(100), version: z.literal(BANK_VERSION),
  theme: z.enum(['clean', 'compare', 'quality', 'async', 'median', 'trend', 'normalize', 'web']),
  kind: z.enum(kinds), questionPattern: z.string().min(1).max(300),
}).strict();
export type QuestionTemplate = z.infer<typeof templateSchema>;
const definitions: [QuestionTemplate['theme'], QuestionTemplate['kind'], string][] = [
  ['clean','mean','{{subject}}에서 {{lower}}~{{upper}} {{unit}} 안의 관측만 남기면 평균은?'],
  ['clean','valid-count','{{subject}}에서 결측과 {{lower}}~{{upper}} {{unit}} 밖의 값을 제외하면 남는 관측 수는?'],
  ['clean','missing','{{subject}}에서 결측을 0으로 대체하여 평균에 포함할 때의 문제는?'],
  ['compare','group-mean','{{subject}}에서 그룹 A의 유한한 값만으로 계산한 평균은?'],
  ['compare','weighted','{{subject}}에서 A와 B를 합친 전체 평균은? 그룹 크기를 반영하세요.'],
  ['compare','group-count','{{subject}}에서 그룹 B의 평균 분모에 들어가는 유한한 관측 수는?'],
  ['quality','rate','{{subject}}의 {{lower}}~{{upper}} {{unit}} 충족 비율은? 결측은 분모에서 제외합니다.'],
  ['quality','rejected','{{subject}}에서 {{lower}}~{{upper}} {{unit}} 밖의 유한한 관측 수는?'],
  ['quality','boundary','{{subject}}에서 하한 {{lower}}와 상한 {{upper}}를 포함하는 조건식은?'],
  ['async','failures','{{subject}} 수집 결과에서 실패한 요청 수는?'],
  ['async','requests','{{subject}} 수집 결과에서 성공한 요청 수는? 빈 결과도 성공 요청입니다.'],
  ['async','partial','{{subject}} 수집 중 일부 요청이 실패했을 때 성공 데이터를 보존하는 방법은?'],
  ['median','median','{{subject}}의 유한한 숫자를 정렬했을 때 중앙값은?'],
  ['median','median-count','{{subject}}의 중앙값 계산에 참여하는 관측 수는?'],
  ['median','outlier','{{subject}}에 큰 이상값이 섞여 있을 때 중앙값을 함께 확인하는 이유는?'],
  ['trend','moving','{{subject}}의 마지막 위치에서 최근 3개 행 이동평균은? 창 안의 결측만 제외합니다.'],
  ['trend','window-count','{{subject}}의 마지막 3개 행 창에서 평균의 분모는?'],
  ['trend','window-null','{{subject}}의 최근 3개 행이 모두 결측일 때 이동평균은?'],
  ['normalize','normalized','{{subject}}의 첫 번째 값 x를 (x - {{lower}}) / ({{upper}} - {{lower}})로 정규화하면?'],
  ['normalize','span','{{subject}}의 {{lower}}~{{upper}} {{unit}} 정규화에서 사용하는 분모는?'],
  ['normalize','outside','{{subject}}의 기준 구간 정규화에서 1보다 큰 결과의 의미는?'],
  ['web','state','{{subject}} 기록을 React state에만 보관하면 새로고침 후 어떻게 되나요?'],
  ['web','validation','{{subject}} 등록 API가 외부 입력을 실행 시점에 검사해야 하는 이유는?'],
  ['web','sql','{{subject}} 검색값을 SQL에 전달하는 안전한 방법은?'],
  ['web','http','{{subject}} 저장 요청이 실패했을 때 화면은 어떻게 처리해야 하나요?'],
  ['web','duplicate','{{subject}}를 동시에 중복 등록해도 하나만 저장하려면 어디서 보장해야 하나요?'],
  ['web','secret','{{subject}}의 AI 도움 기능에 사용하는 비밀키는 어디에 두어야 하나요?'],
];
export const questionTemplates: QuestionTemplate[] = definitions.map(([theme, kind, questionPattern]) => ({ id: `${theme}:${kind}`, version: BANK_VERSION, theme, kind, questionPattern }));

// A future API can supply ONLY these validated data parameters. It cannot supply executable formulas.
export const parametersSchema = z.object({
  values: z.array(z.number().finite().min(-1e6).max(1e6).nullable()).min(1).max(12),
  lower: z.number().finite().min(-1e6).max(1e6), upper: z.number().finite().min(-1e6).max(1e6),
  groups: z.array(z.enum(['A','B'])).min(1).max(12),
  outcomes: z.array(z.enum(['success','empty','failed'])).min(1).max(12),
}).strict().refine(p => p.upper > p.lower && p.groups.length === p.values.length, '상한은 하한보다 커야 하고 그룹 수와 관측 수가 같아야 합니다.');
export type QuestionParameters = z.infer<typeof parametersSchema>;
export type BankQuestion = Curriculum['quiz'][number] & { templateId: string; templateVersion: string; parameters: QuestionParameters; exerciseId?: string };
const round = (n: number) => Math.round(n * 10000) / 10000;
const show = (n: number | null) => n === null ? 'null (관측 없음)' : String(round(n));
const average = (xs: number[]) => xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : null;
const finite = (xs: (number | null)[]) => xs.filter((n): n is number => n !== null);

export function scenario(d: Discipline, seed: number): QuestionParameters {
  const span = d.max - d.min;
  const fraction = (seed % 7 + 1) / 10;
  return parametersSchema.parse({ lower: d.min, upper: d.max,
    values: [round(d.min + span * fraction), round(d.min + span * 0.8), null, round(d.min + span * 0.4), round(d.max + span * (0.1 + seed % 3 / 10))],
    groups: ['A','B','B','B','B'],
    outcomes: Array.from({length: 4 + seed % 3}, (_, i) => i < 1 + seed % 2 ? 'failed' : i === 2 ? 'empty' : 'success'),
  });
}

export function renderQuestion(templateInput: QuestionTemplate, d: Pick<Discipline, 'subject'|'unit'>, input: unknown, rotation = 0, exerciseId?: string): BankQuestion {
  const t = templateSchema.parse(templateInput);
  if (!definitions.some(([theme, kind]) => theme === t.theme && kind === t.kind)) throw new Error('문제 유형과 테마가 일치하지 않습니다.');
  const p = parametersSchema.parse(input);
  const values = finite(p.values), valid = values.filter(v => v >= p.lower && v <= p.upper);
  let answer: number | null = null, explanation = '', choices: string[] | undefined;
  const concept = (correct: string, wrong: string[], reason: string) => { choices = [correct, ...wrong]; explanation = reason; };
  switch (t.kind) {
    case 'mean': answer = average(valid); explanation = `유효 관측 ${valid.length}개만 합산하여 그 개수로 나눕니다. 결과는 ${show(answer)}입니다.`; break;
    case 'valid-count': answer = valid.length; explanation = `결측은 제외하고 ${p.lower} 이상 ${p.upper} 이하인 값은 ${valid.length}개입니다.`; break;
    case 'missing': concept('실제 0과 관측 없음을 혼동하고 평균의 분모도 바꾼다', ['결측 수가 자동으로 줄어든다','평균이 항상 정확해진다','데이터가 없다는 사실이 보존된다'], '결측을 0으로 대체하려면 별도의 근거가 필요합니다. 평균이 커질지 작아질지는 원래 관측값에 따라 달라집니다.'); break;
    case 'group-mean': answer = average(finite(p.values.filter((_,i) => p.groups[i] === 'A'))); explanation = `A 그룹 안에서만 결측을 제외하고 계산합니다. 결과 ${show(answer)}. 유한한 범위 밖 값도 이 집계에서는 포함합니다.`; break;
    case 'weighted': answer = average(values); explanation = `그룹 평균을 단순히 반씩 더하지 않고 전체 합계 / 전체 유효 관측 ${values.length}개로 계산합니다. 결과 ${show(answer)}.`; break;
    case 'group-count': answer = finite(p.values.filter((_,i) => p.groups[i] === 'B')).length; explanation = `그룹 B의 결측을 제외한 관측 ${answer}개가 분모입니다.`; break;
    case 'rate': answer = values.length ? valid.length / values.length : null; explanation = `충족 ${valid.length} / 관측 ${values.length}. 비율은 0~1 척도이며 소수 넷째 자리까지 표시합니다: ${show(answer)}.`; break;
    case 'rejected': answer = values.length - valid.length; explanation = `관측 ${values.length}개 중 충족 ${valid.length}개를 빼면 ${answer}개입니다. 결측은 실패 관측으로 세지 않습니다.`; break;
    case 'boundary': concept('x >= lower && x <= upper', ['x > lower && x < upper','x >= lower || x <= upper','x < lower && x > upper'], '이 실습의 학습 계약은 양 끝을 포함합니다. 두 조건을 AND로 동시에 만족해야 합니다.'); break;
    case 'failures': answer = p.outcomes.filter(o => o === 'failed').length; explanation = `failed만 세면 ${answer}건입니다. empty는 성공했지만 반환 행이 없는 요청입니다.`; break;
    case 'requests': answer = p.outcomes.filter(o => o !== 'failed').length; explanation = `success와 empty를 합친 ${answer}건입니다. 요청 성공 수와 데이터 행 수는 다릅니다.`; break;
    case 'partial': concept('각 요청의 성공·실패를 분리하고 성공 결과와 실패 수를 보관한다', ['하나가 실패하면 성공 데이터도 삭제한다','실패를 정상 관측값 0으로 바꾼다','성공할 때까지 제한 없이 재시도한다'], 'Promise.allSettled는 각 결과를 분리합니다. 동기 예외도 Promise.resolve().then(loader)로 포착할 수 있습니다.'); break;
    case 'median': { const sorted = [...values].sort((a,b) => a-b), m = Math.floor(sorted.length/2); answer = sorted.length ? sorted.length%2 ? sorted[m] : (sorted[m-1]+sorted[m])/2 : null; explanation = `숫자 순으로 정렬하고 가운데를 선택합니다. 짝수 개이면 가운데 둘의 평균입니다. 결과 ${show(answer)}.`; break; }
    case 'median-count': answer = values.length; explanation = `유한한 관측 ${answer}개입니다. 이상값처럼 보이더라도 이 계약에서는 숫자를 임의로 제거하지 않습니다.`; break;
    case 'outlier': concept('중앙값은 극단값 크기의 영향을 평균보다 덜 받는다', ['중앙값은 항상 평균과 같다','중앙값이 있으면 이상값 검토가 필요 없다','중앙값은 가장 큰 값이다'], '중앙값은 순서에 기반한 요약입니다. 원자료·평균·표본 수와 함께 해석합니다.'); break;
    case 'moving': answer = average(finite(p.values.slice(-3))); explanation = `먼저 마지막 3개 행을 자른 뒤 그 안의 결측만 제외합니다. 평균 ${show(answer)}.`; break;
    case 'window-count': answer = finite(p.values.slice(-3)).length; explanation = `마지막 3개 행의 유효 관측 ${answer}개로 나눕니다. 전체 배열에서 결측을 먼저 제거하지 않습니다.`; break;
    case 'window-null': concept('null (관측 없음)', ['0 (실제 평균)','직전 값으로 자동 대체','항상 1'], '이 계약은 창에 관측이 없으면 null을 반환합니다. 보간이나 직전 값 대체는 별도 정책입니다.'); break;
    case 'normalized': answer = p.values[0] === null ? null : (p.values[0]-p.lower)/(p.upper-p.lower); explanation = `(첫 값 - ${p.lower}) / (${p.upper} - ${p.lower}) = ${show(answer)}. 기준 구간은 현재 표본에서 다시 구하지 않습니다.`; break;
    case 'span': answer = p.upper-p.lower; explanation = `상한 - 하한 = ${show(answer)}입니다. 상한 자체로 나누면 하한이 0이 아닌 경우 틀립니다.`; break;
    case 'outside': concept('입력값이 정해진 상한을 초과했다', ['코드가 반드시 고장 났다','입력값이 결측이다','정규화 결과는 무조건 1로 바꿔야 한다'], '고정 기준 정규화는 범위 밖 정보도 보존합니다. 1 초과를 자동으로 삭제하지 않습니다.'); break;
    case 'state': concept('별도로 저장하지 않았다면 메모리의 기록이 사라진다', ['DB에 자동 저장된다','GitHub에 자동 커밋된다','TypeScript가 자동 복원한다'], 'React state는 영구 저장소가 아닙니다. API로 저장하고 다시 조회해야 합니다.'); break;
    case 'validation': concept('TypeScript 타입은 외부 요청을 런타임에 검사하지 않는다', ['TypeScript가 SQL을 실행한다','HTTP는 숫자를 전달하지 못한다','React가 DB 권한을 보장한다'], '신뢰 경계에서 Zod 등으로 형식과 범위를 검사하고 DB 제약도 적용합니다.'); break;
    case 'sql': concept('SQL 구조와 값을 분리하는 매개변수화 쿼리', ['문자열 뒤에 검색어 이어 붙이기','입력창만 숨기기','프런트 검사만 사용하기'], '사용자 입력이 SQL 명령으로 해석되지 않도록 WHERE id = $1처럼 값을 바인딩합니다.'); break;
    case 'http': concept('실패를 알리고 입력을 보존하며 재시도 방법을 제공한다', ['저장 성공으로 표시한다','입력을 항상 삭제한다','같은 요청을 무한 반복한다'], '서버가 저장하지 못했는데 화면만 성공 처리하면 상태가 어긋납니다.'); break;
    case 'duplicate': concept('서버와 DB의 유일성 제약으로 보장한다', ['버튼 색을 변경한다','브라우저 탭을 하나만 열게 한다','요청 전에 1초 기다린다'], '동시 요청은 프런트 버튼 비활성화만으로 제어되지 않습니다.'); break;
    case 'secret': concept('서버의 비밀 환경변수에 보관한다', ['VITE_ 변수로 브라우저에 넣는다','공개 저장소 README에 넣는다','학습 코드 안에 붙인다'], '브라우저로 전달한 키는 사용자에게 노출됩니다. 서버가 권한과 한도를 검사한 뒤 호출해야 합니다.'); break;
  }
  if (!choices) {
    const text = show(answer), n = answer ?? 0;
    choices = [...new Set([text, show(n+1), show(n-1), show(n+2), 'null (관측 없음)', show(n+3)])].slice(0,4);
  }
  const offset = ((rotation % 4) + 4) % 4;
  const options = [...choices.slice(offset), ...choices.slice(0, offset)];
  const context: Record<string,string> = {subject:d.subject,unit:d.unit,lower:String(p.lower),upper:String(p.upper)};
  const statement = t.questionPattern.replace(/\{\{(\w+)\}\}/g, (_, key: string) => { if (!(key in context)) throw new Error('알 수 없는 문제 변수'); return context[key]; });
  const data = t.theme === 'web' ? '' : t.theme === 'async' ? `요청 결과: ${p.outcomes.join(', ')}` : `입력: ${p.values.map((v,i) => `${p.groups[i]}:${v === null ? 'null' : v}`).join(', ')} ${d.unit}`;
  return {question: [statement, data, t.theme === 'web' ? '' : '(계산값은 소수 넷째 자리까지 표시)'].filter(Boolean).join('\n'), options, answer:(4-offset)%4, explanation,
    templateId:t.id,templateVersion:t.version,parameters:p,...(exerciseId ? {exerciseId} : {})};
}

export function practiceMaterial(profile: Profile, previous: Assignment[], bank: QuestionTemplate[] = questionTemplates) {
  const plan = recommendation(profile), roundIndex = previous.filter(a => a.practice).length;
  const ids = [...plan.exerciseIds];
  // Keep the first course and PM's project exercise intact; later courses add new algorithms.
  if (roundIndex > 0 && !['sql','r'].includes(profile.languageId || '')) {
    const advanced = ['median','trend','normalize'];
    ids[0] = `${plan.discipline.id}:${advanced[(roundIndex-1)%advanced.length]}`;
  }
  const quiz = ids.map((id, index) => {
    const exercise = getExercise(id)!;
    const d = resolveDiscipline({...profile, disciplineId:exercise.disciplineId});
    // Project exercises use their own units rather than the learner's major.
    const subject = exercise.disciplineId === 'project' ? { ...d, subject:'프로젝트 작업 기록',unit:'시간',min:0,max:160 } : d;
    const candidates = bank.filter(t => t.theme === exercise.theme);
    if (!candidates.length) throw new Error(`문제 은행에 ${exercise.theme} 유형이 없습니다.`);
    return renderQuestion(candidates[(roundIndex + index) % candidates.length], subject, scenario(subject, roundIndex*3+index), roundIndex+index, id);
  });
  return { exerciseIds:ids, quiz };
}

export function generalQuiz(profile: Profile, previous: Assignment[], bank: QuestionTemplate[] = questionTemplates): BankQuestion[] {
  const available = bank.filter(t => t.theme === 'web');
  if (available.length < 3) throw new Error('일반 학습 문제 은행이 부족합니다.');
  const d = resolveDiscipline(profile), seed = previous.length;
  return Array.from({length:3}, (_,i) => renderQuestion(available[(seed*3+i)%available.length], {...d,subject:`${profile.role} 업무`},scenario(d,seed+i),seed+i));
}
