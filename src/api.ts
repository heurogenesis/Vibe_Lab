// Who the request belongs to is carried by the session cookie, which the browser attaches on its own
// (same-origin). The client never holds an identifier of its own. See docs/MULTI_USER_DESIGN.md.
//
// Anything that changes state also carries a CSRF token from the session (server/csrf.ts). The cookie alone
// is not enough: a browser attaches it to cross-site requests too, which is the whole shape of the attack.
const SAFE_METHODS = ['GET', 'HEAD'];
let csrfToken: string | null = null;
async function currentToken(): Promise<string> {
  if (!csrfToken) {
    const response = await fetch('/api/auth/csrf', { headers: { 'X-Vibe-Lab': '1' } });
    if (!response.ok) throw new Error('요청 검증 토큰을 받지 못했습니다. 서버 상태를 확인해 주세요.');
    csrfToken = (await response.json()).token as string;
  }
  return csrfToken;
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const mutating = !SAFE_METHODS.includes((options?.method || 'GET').toUpperCase());
  // Signing in regenerates the session and with it the token, so a rejected token is expected once rather
  // than an error worth showing. Retry exactly once, then let the failure surface.
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Vibe-Lab': '1', ...(options?.headers as Record<string, string>) };
    if (mutating) headers['X-CSRF-Token'] = await currentToken();
    let response: Response;
    try { response = await fetch('/api' + path, { ...options, headers }); }
    catch { throw new Error('서버에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.'); }
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (mutating && attempt === 0 && response.status === 403 && String(data?.error).includes('csrf-token-mismatch')) { csrfToken = null; continue; }
      throw new Error(data?.error || `요청에 실패했습니다 (${response.status}).`);
    }
    if (data === null) throw new Error('서버의 응답 형식이 올바르지 않습니다.');
    return data as T;
  }
}
export function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
