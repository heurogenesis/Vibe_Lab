import { WebR } from 'webr';
import type { DataRow, Exercise } from '../shared/catalog';
import type { RunHandle, RunResult, TestResult } from './runner';
// R practice runs in webR: a real R interpreter compiled to WebAssembly, in a worker webR manages itself.
//
// This is why the app is cross-origin isolated (see server/app.ts and vite.config.ts). Isolation enables
// SharedArrayBuffer, which is the only webR channel that can interrupt R code already running - without it a
// learner's infinite loop could not be stopped. The runtime is self-hosted at /webr/ rather than fetched from a
// CDN, because an isolated page refuses cross-origin resources that have not opted in.
//
// The runtime is about 17MB, so one instance is created lazily and reused for the rest of the session: only the
// first run of the first R exercise pays the download.
let starting: Promise<WebR> | undefined;
let ready = false;
function runtime(): Promise<WebR> {
  return (starting ||= (async () => {
    const webR = new WebR({ baseUrl: '/webr/' });
    await webR.init();
    ready = true;
    return webR;
  })());
}
const show = (value: unknown) => {
  try { return (JSON.stringify(value) ?? String(value)).slice(0, 1200); }
  catch { return '[표시할 수 없는 값]'; }
};
function equal(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && rightKeys.every(key => Object.prototype.hasOwnProperty.call(left, key) && equal(left[key], right[key]));
}
// webR hands back {type, names, values}. Collapse that into the plain JavaScript shape the exercise expects:
// a one-element vector becomes a scalar, a named vector or list becomes an object, R's NULL and NA become null.
function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value !== 'object') return value;
  const node = value as { type?: string; names?: string[] | null; values?: unknown[] };
  if (node.type === 'null') return null;
  if (!Array.isArray(node.values)) return value;
  const items = node.values.map(toPlain);
  if (node.names) return Object.fromEntries(node.names.map((name, index) => [name, items[index]]));
  return items.length === 1 ? items[0] : items;
}
const literal = (value: number | null): string =>
  value === null ? 'NA' : Number.isNaN(value) ? 'NaN' : value === Infinity ? 'Inf' : value === -Infinity ? '-Inf' : String(value);
function frame(rows: DataRow[]): string {
  if (!rows.length) return 'data.frame(group = character(0), value = numeric(0), stringsAsFactors = FALSE)';
  const groups = rows.map(row => JSON.stringify(row.group)).join(', ');
  const values = rows.map(row => literal(row.value)).join(', ');
  return `data.frame(group = c(${groups}), value = as.numeric(c(${values})), stringsAsFactors = FALSE)`;
}
// local() keeps each run's definitions to itself, so one exercise cannot leave state behind for the next.
const program = (code: string, rows: DataRow[]) => `local({\n  rows <- ${frame(rows)}\n${code}\n  solve(rows)\n})`;
export function startRRun(exercise: Exercise, code: string, rows: DataRow[]): RunHandle {
  let finish: (result: RunResult) => void = () => undefined;
  const result = new Promise<RunResult>(resolve => { finish = resolve; });
  if (code.trim().length === 0) { finish({ tests: [], logs: [], error: 'R 코드를 작성해 주세요.' }); return { result, cancel: () => undefined }; }
  if (code.length > 20000) { finish({ tests: [], logs: [], error: '코드는 20,000자 이하로 작성해 주세요.' }); return { result, cancel: () => undefined }; }
  let done = false;
  let interrupt: () => void = () => undefined;
  // Resolving a finished run must not interrupt R. webR's interrupt only sets a flag that R checks when it
  // next evaluates, so interrupting an idle interpreter cancels nothing and instead poisons the following
  // run, which then dies with 'A non-local transfer of control occurred during evaluation' or stalls until
  // the timeout. Only an abort - the time limit, or the learner pressing stop - has R code running to stop.
  const settle = (value: RunResult) => { if (done) return; done = true; clearTimeout(timer); finish(value); };
  const abort = (value: RunResult) => { if (done) return; interrupt(); settle(value); };
  // The first run downloads and starts R; later runs only evaluate.
  const limit = ready ? 20_000 : 120_000;
  const timer = setTimeout(() => abort({ tests: [], logs: [], error: ready
    ? '실행 제한 시간(20초)을 초과했습니다. 끝나지 않는 반복이 있는지 확인해 주세요.'
    : 'R 런타임(약 17MB)을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.' }), limit);
  void (async () => {
    try {
      const webR = await runtime();
      interrupt = () => webR.interrupt();
      const shelter = await new webR.Shelter();
      try {
        const tests: TestResult[] = [];
        for (const test of exercise.tests) {
          if (done) return;
          try {
            const actual = toPlain(await (await shelter.evalR(program(code, test.input as DataRow[]))).toJs());
            tests.push({ name: test.name, passed: equal(actual, test.expected), actual: show(actual), expected: show(test.expected), hint: test.hint });
          } catch (error) {
            tests.push({ name: test.name, passed: false, actual: String((error as Error)?.message || error).slice(0, 1200), expected: show(test.expected), hint: test.hint });
          }
        }
        let preview: string;
        try { preview = show(toPlain(await (await shelter.evalR(program(code, rows))).toJs())); }
        catch (error) { preview = '샘플 실행 오류: ' + String((error as Error)?.message || error).slice(0, 1200); }
        settle({ tests, logs: [], preview });
      } finally { await shelter.purge(); }
    } catch (error) {
      settle({ tests: [], logs: [], error: String((error as Error)?.message || error).slice(0, 1200) });
    }
  })();
  return { result, cancel: () => abort({ tests: [], logs: [], error: '실행을 중지했습니다.' }) };
}
