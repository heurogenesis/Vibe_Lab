import type { Discipline, Exercise, DataRow } from './catalog.js';

// Additive exercise IDs keep saved v1 assignments and their test contracts valid.
export function extendedExercise(d: Discipline, theme: string, base: Omit<Exercise, 'title' | 'objective' | 'theory' | 'contract' | 'starter' | 'tests'>): Exercise | undefined {
  const rows = (values: (number | null)[]): DataRow[] => values.map(value => ({ group: d.groups[0], value }));
  const rowType = 'type Row = { group: string; value: number | null };';
  const hint = '빈 배열, 결측, 0, 음수를 각각 시험하고 기대값과 비교하세요.';
  if (theme === 'median') return { ...base,
    title: `${d.subject}: 이상값과 중앙값`,
    objective: `${d.measurement}의 유한한 관측을 정렬해 중앙값을 계산하고 평균과 비교합니다.`,
    contract: 'solve(rows: Row[]): number | null. null·NaN·Infinity를 제외하고 숫자 오름차순으로 정렬합니다. 홀수 개면 가운데 값, 짝수 개면 가운데 두 값의 평균, 빈 관측이면 null. 범위 밖 유한한 값도 포함합니다. 입력은 변경하지 않습니다.',
    theory: '중앙값은 순서의 가운데입니다. 극단값에 평균보다 덜 영향을 받지만 이상값을 제거하거나 데이터가 정상임을 증명하지는 않습니다. JavaScript sort()에는 숫자 비교 함수를 전달해야 2와 10을 숫자 순서로 정렬합니다.',
    starter: `${rowType}\nfunction solve(rows: Row[]): number | null {\n  const values = rows.map(r => r.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));\n  values.sort(/* BLANK 1: 숫자 오름차순 */);\n  if (!values.length) return null;\n  const middle = Math.floor(values.length / 2);\n  return /* BLANK 2: 홀수와 짝수 개를 구분 */ null;\n}`,
    sample: rows([2, 10, 3, null, 100]), tests: [
      { name: '극단값과 짝수 관측', input: rows([2, 10, 3, null, 100]), expected: 6.5, hint: '정렬 후 가운데 3과 10의 평균입니다.' },
      { name: '문자열 정렬 방지', input: rows([10, 2, 3]), expected: 3, hint: '기본 sort()는 문자열 순서입니다.' },
      { name: '관측 없음', input: rows([null, NaN, Infinity]), expected: null, hint },
      { name: '음수와 중복', input: rows([-4, 0, -4]), expected: -4, hint },
      { name: '빈 입력', input: [], expected: null, hint },
    ] };
  if (theme === 'trend') return { ...base,
    title: `${d.subject}: 최근 3개 행 이동평균`,
    objective: `${d.measurement}의 시간 순서 기록을 최근 3개 행 단위로 평활화합니다.`,
    contract: 'solve(rows: Row[]): (number | null)[]. 각 위치에서 현재 행과 직전 최대 2개 행을 사용합니다. 그 창 안의 null·NaN·Infinity는 제외하고 남은 숫자의 평균을 반환합니다. 창에 숫자가 없으면 null. 그룹은 구분하지 않고 입력 순서를 시간 순서로 간주합니다. 결측 행도 창의 자리를 차지합니다.',
    theory: '이동평균은 인접 관측의 잡음을 줄이지만 급격한 변화에 늦게 반응합니다. 결측을 먼저 전체 배열에서 제거하면 시간 창이 달라집니다. 먼저 행 위치로 창을 자르고 창 내부에서 결측을 제외해야 합니다.',
    starter: `${rowType}\nfunction solve(rows: Row[]): (number | null)[] {\n  return rows.map((_, index) => {\n    const window = rows.slice(/* BLANK 1: 시작 위치 */ 0, index + 1);\n    const values = window.map(r => r.value).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));\n    return /* BLANK 2: 창 평균 또는 null */ null;\n  });\n}`,
    sample: rows([2, 4, 6, 8]), tests: [
      { name: '시간 순서와 창 이동', input: rows([2, 4, 6, 8]), expected: [2, 3, 4, 6], hint: '마지막 창은 [4, 6, 8]입니다.' },
      { name: '결측 행이 창을 차지함', input: rows([2, null, null, 8]), expected: [2, 2, 2, 8], hint: '마지막 창에는 이전의 2가 포함되지 않습니다.' },
      { name: '관측 없는 창', input: rows([null, Infinity, 0]), expected: [null, null, 0], hint },
      { name: '음수와 0', input: rows([-2, 0, 2]), expected: [-2, -1, 0], hint },
      { name: '빈 입력', input: [], expected: [], hint },
    ] };
  if (theme === 'normalize') return { ...base,
    title: `${d.subject}: 기준 구간 정규화`,
    objective: `${d.measurement}(${d.unit})를 학습 기준 ${d.min}~${d.max}의 상대 위치로 변환합니다.`,
    contract: `solve(rows: Row[]): (number | null)[]. 유한한 값 x는 (x - ${d.min}) / (${d.max} - ${d.min})로 변환합니다. null·NaN·Infinity는 null. 입력 순서와 길이를 유지합니다. 범위 밖 숫자는 0 미만 또는 1 초과 결과를 그대로 보존합니다.`,
    theory: '정규화는 단위를 없애고 지정한 구간에서 상대 위치를 표현합니다. 최솟값·최댓값을 현재 표본에서 다시 추정하는 방식과 다릅니다. 0~1 밖 결과를 강제로 자르면 범위 초과 정보가 사라집니다. 다른 지표의 정규화 값이 같아도 물리적 의미가 같지는 않습니다.',
    starter: `${rowType}\nfunction solve(rows: Row[]): (number | null)[] {\n  const lower = ${d.min}, upper = ${d.max};\n  return rows.map(({ value }) => {\n    if (/* BLANK 1: 유효하지 않은 숫자 검사 */ true) return null;\n    return /* BLANK 2: 기준 구간에 대한 상대 위치 */ 0;\n  });\n}`,
    sample: rows([d.min, (d.min + d.max) / 2, d.max, null]), tests: [
      { name: '하한·중간·상한', input: rows([d.min, (d.min + d.max) / 2, d.max]), expected: [0, 0.5, 1], hint: '분자에서 하한을 빼고 구간 폭으로 나눕니다.' },
      { name: '범위 밖 값 보존', input: rows([d.min - (d.max - d.min), d.max + (d.max - d.min)]), expected: [-1, 2], hint: 'clamp로 0과 1에 고정하지 않습니다.' },
      { name: '결측 위치 유지', input: rows([null, d.min, NaN, Infinity]), expected: [null, 0, null, null], hint },
      { name: '빈 입력', input: [], expected: [], hint },
    ] };
}
