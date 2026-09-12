import type { DataRow } from './catalog.js';

export type DataSource = {
  id: string; provider: 'github-json' | 'http-json'; title: string;
  url: string; version: string; homepage: string; license: string;
  attribution: string; valueField: string; groupField: string; unit: string;
  maxBytes: number; maxRows: number;
};
const revision = '2434f551e0bb12b99a4ce6764fbc0ef39bea145e';
export const dataSources: DataSource[] = [{
  id: 'palmer-penguins', provider: 'github-json', title: 'Palmer Penguins · 종별 체질량',
  url: `https://raw.githubusercontent.com/vega/vega-datasets/${revision}/data/penguins.json`,
  version: revision, homepage: 'https://allisonhorst.github.io/palmerpenguins/', license: 'CC0-1.0',
  attribution: 'Palmer Station LTER · Kristen Gorman; Horst, Hill & Gorman (2020). JSON 배포: Vega Datasets.',
  valueField: 'Body Mass (g)', groupField: 'Species', unit: 'g', maxBytes: 128 * 1024, maxRows: 1000,
}];
export function normalizeRows(data: unknown, source: DataSource): DataRow[] {
  if (!Array.isArray(data) || data.length > source.maxRows) throw new Error('데이터의 행 수 또는 배열 형식이 올바르지 않습니다.');
  return data.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('데이터 행 형식이 올바르지 않습니다.');
    const value = row[source.valueField]; const group = row[source.groupField];
    if (typeof group !== 'string' || !group.trim() || group.length > 80 || !(value === null || (typeof value === 'number' && Number.isFinite(value)))) throw new Error('외부 데이터 필드가 변경되었거나 유효하지 않습니다.');
    return { group, value };
  });
}
