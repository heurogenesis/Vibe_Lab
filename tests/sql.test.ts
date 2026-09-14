import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { disciplines, listExercises, projectDiscipline, type Discipline, type Exercise } from '../shared/catalog.js';
import type { DataRow } from '../shared/catalog.js';

// The same SQLite build the browser worker uses, loaded from disk here so every generated SQL exercise can be
// checked against a real database rather than against a hand-written expectation.
const require = createRequire(import.meta.url);
// Node hands back a Buffer that may sit inside a larger pooled ArrayBuffer, so slice out exactly these bytes.
const wasm = await readFile(require.resolve('sql.js/dist/sql-wasm.wasm'));
const SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer });

export function runSql(sql: string, rows: DataRow[]): Record<string, unknown>[] {
  const db = new SQL.Database();
  try {
    db.run('CREATE TABLE readings (grp TEXT, value REAL);');
    const insert = db.prepare('INSERT INTO readings (grp, value) VALUES (?, ?)');
    for (const row of rows) insert.run([row.group, row.value]);
    insert.free();
    const results = db.exec(sql);
    const last = results[results.length - 1];
    if (!last) return [];
    return last.values.map(values => Object.fromEntries(last.columns.map((column, i) => [column, values[i]])));
  } finally { db.close(); }
}

const field = (d: Discipline) => `value BETWEEN ${d.min} AND ${d.max}`;
const accepted = (d: Discipline) => `COALESCE(SUM(CASE WHEN ${field(d)} THEN 1 ELSE 0 END), 0)`;
function reference(exercise: Exercise, d: Discipline): string {
  if (exercise.theme === 'clean') return `SELECT AVG(value) AS average FROM readings WHERE value IS NOT NULL AND ${field(d)};`;
  if (exercise.theme === 'compare') return 'SELECT grp, AVG(value) AS average FROM readings WHERE value IS NOT NULL GROUP BY grp ORDER BY grp;';
  return `SELECT COUNT(value) AS observed, ${accepted(d)} AS accepted, (${accepted(d)} * 1.0) / COUNT(value) AS rate FROM readings;`;
}

// Mirrors the tolerance the practice runner uses, so a float that differs in the last bit is not a failure.
function close(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') return Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected));
  return actual === expected;
}

const byId = new Map([...disciplines, projectDiscipline].map(d => [d.id, d]));
const sqlExercises = listExercises().filter(e => e.language === 'sql');

describe('generated SQL exercises', () => {
  it('covers three themes for every field', () => {
    expect(sqlExercises.length).toBe(byId.size * 3);
    expect(new Set(sqlExercises.map(e => e.theme))).toEqual(new Set(['clean', 'compare', 'quality']));
  });

  it.each(sqlExercises.map(e => [e.id, e] as const))('%s reference query returns every published expectation', (_id, exercise) => {
    const d = byId.get(exercise.disciplineId)!;
    const query = reference(exercise, d);
    for (const test of exercise.tests) {
      const actual = runSql(query, test.input as DataRow[]);
      const expected = test.expected as Record<string, unknown>[];
      expect(actual.length, `${test.name}: 행 수`).toBe(expected.length);
      for (const [index, row] of expected.entries()) {
        for (const [column, value] of Object.entries(row)) {
          expect(close(actual[index][column], value), `${test.name}: ${column} = ${actual[index][column]} (기대 ${value})`).toBe(true);
        }
      }
    }
  });

  it('starter queries run without a syntax error and do not already pass', () => {
    for (const exercise of sqlExercises.slice(0, 12)) {
      // The blanks are placeholders that still parse, so a learner sees a real result before solving anything.
      const rows = exercise.tests[0].input as DataRow[];
      const started = runSql(exercise.starter, rows);
      const expected = exercise.tests[0].expected as Record<string, unknown>[];
      const solved = started.length === expected.length && started.every((row, i) =>
        Object.entries(expected[i]).every(([column, value]) => close(row[column], value)));
      expect(solved, `${exercise.id}: 빈칸을 채우기 전에 이미 정답이면 학습이 되지 않습니다`).toBe(false);
    }
  });

  it('reports NULL rather than zero when nothing was observed', () => {
    const quality = sqlExercises.find(e => e.theme === 'quality')!;
    const d = byId.get(quality.disciplineId)!;
    expect(runSql(reference(quality, d), [])).toEqual([{ observed: 0, accepted: 0, rate: null }]);
  });

  it('drops an all-NULL group, which is where SQL and the function version differ', () => {
    const compare = sqlExercises.find(e => e.theme === 'compare')!;
    const d = byId.get(compare.disciplineId)!;
    const rows: DataRow[] = [{ group: 'missing', value: null }, { group: 'valid', value: 2 }];
    expect(runSql(reference(compare, d), rows)).toEqual([{ grp: 'valid', average: 2 }]);
  });
});
