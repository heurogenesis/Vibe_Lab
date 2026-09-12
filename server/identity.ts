import type { Request } from 'express';
import { ApiError } from './github.js';
import type { UserStore } from './store.js';
import type { User } from '../shared/schema.js';
// The single place that decides which learner a request belongs to.
//
// Local mode (today): the client sends the selected user id in X-Vibe-User and that id is checked against the
// directory. This separates workspaces; it is NOT authentication. Anyone who can reach the API can name any
// user, so it is only acceptable because the server binds to 127.0.0.1 and /api rejects non-local hosts.
//
// Remote mode (later): replace the body of resolveUser with session or OAuth verification. Nothing else in the
// server changes, because every other layer only ever receives a userId. Finish the checklist in section 5 of
// docs/MULTI_USER_DESIGN.md before exposing this service beyond localhost.
export const USER_HEADER = 'x-vibe-user';
export async function resolveUser(req: Request, users: UserStore): Promise<User> {
  const header = req.get(USER_HEADER);
  if (!header) throw new ApiError(401, '사용할 학습자를 먼저 선택해 주세요.');
  const user = await users.findUser(header.trim());
  if (!user) throw new ApiError(401, '알 수 없는 학습자입니다. 다시 선택하거나 새로 만들어 주세요.');
  return user;
}
