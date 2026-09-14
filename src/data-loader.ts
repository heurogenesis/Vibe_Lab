import { dataSources, normalizeRows } from '../shared/data-sources';
import type { DataRow } from '../shared/catalog';

const cache = new Map<string, { expires: number; rows: DataRow[] }>();
// Raw data stays in the browser; there is no server proxy or dataset table.
export async function loadDataset(id: string, fetcher: typeof fetch = fetch): Promise<DataRow[]> {
  const source = dataSources.find(s => s.id === id);
  if (!source) throw new Error('등록되지 않은 데이터 출처입니다.');
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return structuredClone(hit.rows);
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('데이터 출처 설정을 확인해 주세요.');
  try {
    const response = await fetcher(url.href, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`외부 데이터 조회 실패 (${response.status})`);
    if (Number(response.headers.get('content-length')) > source.maxBytes) throw new Error('데이터 크기 한도를 초과했습니다.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('데이터 본문을 읽을 수 없습니다.');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > source.maxBytes) throw new Error('데이터 크기 한도를 초과했습니다.');
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const rows = normalizeRows(JSON.parse(new TextDecoder().decode(bytes)), source);
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(id, { expires: Date.now() + 15 * 60_000, rows });
    return structuredClone(rows);
  } catch (error) {
    throw new Error(`공개 데이터를 불러오지 못했습니다. ${error instanceof Error ? error.message : ''} 재시도하거나 합성 샘플을 선택해 주세요.`);
  }
}
