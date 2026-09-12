import type { DataRow, Exercise } from '../shared/catalog';
import type { RunHandle, RunResult } from './runner';
// SQL practice deliberately does not use the iframe sandbox.
//
// That sandbox exists to contain learner-written JavaScript, which would otherwise run with the page's own
// privileges. A SQL string is not JavaScript: it is parsed and executed by SQLite compiled to WebAssembly,
// which in sql.js owns nothing but an in-memory database - no filesystem, no network, no DOM. What a query can
// still do is run for a very long time, so it executes in its own worker that we terminate on timeout or
// cancel. The worker is our code rather than the learner's, so its reply needs no schema check the way the
// sandbox frame's does.
//
// First run downloads and compiles about 1.2MB of WebAssembly, hence the longer limit than the 5s used for
// JavaScript. Compiling WebAssembly requires 'wasm-unsafe-eval' in the page CSP (see server/app.ts).
const TIMEOUT_MS = 10_000;
export function startSqlRun(exercise: Exercise, sql: string, rows: DataRow[]): RunHandle {
  let finish: (result: RunResult) => void = () => undefined;
  const result = new Promise<RunResult>(resolve => { finish = resolve; });
  if (sql.trim().length === 0) {
    finish({ tests: [], logs: [], error: '질의문을 작성해 주세요.' });
    return { result, cancel: () => undefined };
  }
  if (sql.length > 20000) {
    finish({ tests: [], logs: [], error: '질의문은 20,000자 이하로 작성해 주세요.' });
    return { result, cancel: () => undefined };
  }
  const worker = new Worker(new URL('./sql-worker.ts', import.meta.url), { type: 'module' });
  let done = false;
  const cleanup = (value: RunResult) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker.terminate();
    finish(value);
  };
  const timer = setTimeout(() => cleanup({ tests: [], logs: [], error: '실행 제한 시간(10초)을 초과했습니다. 질의가 너무 무겁거나 처음 실행이라 SQLite를 내려받는 중일 수 있습니다.' }), TIMEOUT_MS);
  worker.onmessage = ({ data }) => cleanup(data as RunResult);
  worker.onerror = event => cleanup({ tests: [], logs: [], error: `SQLite를 불러오지 못했습니다: ${event.message || '알 수 없는 오류'}` });
  worker.postMessage({ sql, tests: exercise.tests, rows });
  return { result, cancel: () => cleanup({ tests: [], logs: [], error: '실행을 중지했습니다.' }) };
}
