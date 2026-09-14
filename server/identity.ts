import type { Request } from 'express';
import { ApiError } from './github.js';
import type { User } from '../shared/schema.js';
// The single place that decides which learner a request belongs to.
//
// The answer comes from the signed session cookie that Passport hydrates into req.user (see server/auth.ts),
// so a request can only reach the workspace its owner signed in to. Everything downstream receives a userId and
// never learns how it was established: adding GitHub OAuth later means registering another Passport strategy,
// not touching the store or a single route handler.
//
// Before serving this beyond localhost, finish the checklist in section 5 of docs/MULTI_USER_DESIGN.md -
// most importantly the secure cookie flag, a persistent session store and a real CSRF token.
export function resolveUser(req: Request): User {
  if (!req.user) throw new ApiError(401, '로그인이 필요합니다.');
  return req.user;
}
