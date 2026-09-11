export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Vibe-Lab': '1', ...options?.headers } }); }
  catch { throw new Error('서버에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `요청에 실패했습니다 (${response.status}).`);
  if (data === null) throw new Error('서버의 응답 형식이 올바르지 않습니다.');
  return data as T;
}
export function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
