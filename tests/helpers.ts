import request from 'supertest';
import type { Express } from 'express';
// Every mutating request needs a session-bound CSRF token (server/csrf.ts), so a test client has to do what
// the real one does: hold a session and carry the token. The token survives sign-in, so one fetch is enough
// for the life of the agent.
export async function client(app: Express) {
  const agent = request.agent(app);
  agent.set('X-Vibe-Lab', '1');
  return refreshCsrf(agent);
}
// Logging out destroys the session and the token with it, so the next sign-in needs a fresh one. The real
// client reaches the same place by retrying once on a rejected token (src/api.ts); this is that step, made
// explicit so a test failure here means the protection changed rather than the test drifted.
export async function refreshCsrf<T extends request.Agent>(agent: T): Promise<T> {
  const response = await agent.get('/api/auth/csrf').expect(200);
  agent.set('X-CSRF-Token', response.body.token);
  return agent;
}
