import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './github.js';
// Synchronizer-token CSRF protection, replacing the X-Vibe-Lab header as the actual defence.
//
// The token lives in the session (now a PostgreSQL row, see server/auth.ts), so an attacker's page cannot
// read it: it is never sent to another origin and never stored anywhere JavaScript from another site can
// reach. The browser will happily attach our session cookie to a cross-site request, which is exactly why
// the cookie alone cannot authorise a state change.
//
// X-Vibe-Lab stays in server/app.ts as a cheap early filter, not as the CSRF defence it used to stand in for.
declare module 'express-session' {
  interface SessionData { csrfToken?: string }
}
// GET/HEAD/OPTIONS do not change state, so they carry no token. Any route that mutates behind a GET would
// defeat this, which is a reason to keep mutations on POST/PUT/PATCH/DELETE.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_MISMATCH = 'csrf-token-mismatch';
// Same token for the life of the session.
export function issueCsrfToken(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
}
// req.login regenerates the session (session-fixation defence) and the token would go with it, invalidating
// the one the page is holding on the single request most likely to be in flight. The session id still
// rotates - only the token value is carried across, and a token the browser already had is no more exposed
// after sign-in than before. Without this every sign-in costs a rejected request and a retry.
export function loginPreservingCsrf(req: Request, user: Express.User, done: (error?: unknown) => void) {
  const carried = req.session.csrfToken;
  req.login(user, error => {
    if (!error && carried) req.session.csrfToken = carried;
    done(error);
  });
}
function matches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  // timingSafeEqual throws on a length mismatch, and the length itself is not a secret.
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const expected = req.session?.csrfToken;
  const provided = req.get('X-CSRF-Token');
  // Fail closed: no session token means nothing to compare against, so the request cannot be trusted.
  if (!expected || !provided || !matches(expected, provided)) {
    return next(new ApiError(403, `요청 검증에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요. (${CSRF_MISMATCH})`));
  }
  next();
}
