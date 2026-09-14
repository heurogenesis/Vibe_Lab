/// <reference lib="webworker" />
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { DataRow } from '../shared/catalog';
// SQLite compiled to WebAssembly, running in a disposable worker. The database is in memory only: sql.js has no
// filesystem, no network and no DOM, and the whole worker is terminated on timeout or cancel.
type Test = { name: string; input: DataRow[]; expected: unknown; hint: string };
type Payload = { sql: string; tests: Test[]; rows: DataRow[] };
let loading: Promise<SqlJsStatic> | undefined;
const load = () => (loading ||= initSqlJs({ locateFile: () => wasmUrl }));
const show = (value: unknown) => {
  try { return (JSON.stringify(value) ?? String(value)).slice(0, 1200); }
  catch { return '[표시할 수 없는 값]'; }
};
// Same tolerance as the JavaScript runner: SQLite returns floats, so the last bit must not decide a test.
function equal(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left), rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && rightKeys.every(key => Object.prototype.hasOwnProperty.call(left, key) && equal(left[key], right[key]));
}
function query(SQL: SqlJsStatic, sql: string, rows: DataRow[]): Record<string, unknown>[] {
  const db = new SQL.Database();
  try {
    db.run('CREATE TABLE readings (grp TEXT, value REAL);');
    const insert = db.prepare('INSERT INTO readings (grp, value) VALUES (?, ?)');
    for (const row of rows) insert.run([row.group, row.value]);
    insert.free();
    const results = db.exec(sql);
    const last = results[results.length - 1];
    if (!last) return [];
    return last.values.map(values => Object.fromEntries(last.columns.map((column, index) => [column, values[index]])));
  } finally { db.close(); }
}
onmessage = async ({ data }: MessageEvent<Payload>) => {
  try {
    const SQL = await load();
    const tests = data.tests.map(test => {
      try {
        const actual = query(SQL, data.sql, test.input);
        return { name: test.name, passed: equal(actual, test.expected), actual: show(actual), expected: show(test.expected), hint: test.hint };
      } catch (error) {
        return { name: test.name, passed: false, actual: String((error as Error)?.message || error).slice(0, 1200), expected: show(test.expected), hint: test.hint };
      }
    });
    let preview: string;
    try { preview = show(query(SQL, data.sql, data.rows)); }
    catch (error) { preview = '샘플 실행 오류: ' + String((error as Error)?.message || error).slice(0, 1200); }
    postMessage({ tests, logs: [], preview });
  } catch (error) {
    postMessage({ tests: [], logs: [], error: String((error as Error)?.message || error).slice(0, 1200) });
  }
};
