import { randomBytes } from 'node:crypto';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { loginSchema, signupSchema, userHandleSchema, type User } from '../shared/schema.js';
import { ApiError } from './github.js';
import { DuplicateHandleError, type UserStore } from './store.js';
// Passport fills req.user from the session; this is the shape it carries. Password hashes never appear here.
declare global {
  namespace Express {
    interface User { id: string; handle: string; displayName: string; createdAt: string }
  }
}
// bcrypt work factor. 10 keeps a pure-JS hash near a few hundred milliseconds: slow for an attacker, still
// responsive for a learner signing in on a laptop.
const BCRYPT_ROUNDS = 10;
// Comparing against a real hash even when the account is missing keeps the response time flat, so login cannot
// be used to discover which ids are registered.
const ABSENT_ACCOUNT_HASH = bcrypt.hashSync('vibe-lab-absent-account', BCRYPT_ROUNDS);
function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  console.warn('SESSION_SECRET is not set. Using a random secret: everyone is signed out when the server restarts.');
  return randomBytes(32).toString('hex');
}
// Mounts the session, Passport and every /api/auth route. All authentication enters the app through here.
export function attachAuth(app: express.Express, users: UserStore) {
  // A Passport instance per app. The default export is a process-wide singleton whose serializeUser and
  // deserializeUser handlers accumulate, so two apps in one process (tests, or an embedded server) would
  // deserialize sessions against each other's stores.
  const auth = new passport.Passport();
  auth.use(new LocalStrategy({ usernameField: 'handle', passwordField: 'password' }, async (handle, password, done) => {
    try {
      const account = await users.findCredentials(handle);
      const matches = await bcrypt.compare(password, account?.passwordHash || ABSENT_ACCOUNT_HASH);
      if (!account || !matches) return done(null, false);
      return done(null, { id: account.id, handle: account.handle, displayName: account.displayName, createdAt: account.createdAt });
    } catch (error) { return done(error as Error); }
  }));
  auth.serializeUser<string>((user, done) => done(null, user.id));
  auth.deserializeUser<string>(async (id, done) => {
    try { done(null, (await users.findUser(id)) || false); }
    catch (error) { done(error as Error); }
  });
  app.use('/api', session({
    name: 'vibe.sid',
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    // secure must become true once this is served over HTTPS. See docs/MULTI_USER_DESIGN.md section 5.
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
  }), auth.initialize(), auth.session());
  const router = express.Router();
  // Brute force guard, deliberately stricter than the general /api limit.
  const attempts = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '시도가 너무 많습니다. 1분 후 다시 시도해 주세요.' } });
  router.get('/session', (req, res) => {
    if (!req.user) throw new ApiError(401, '로그인이 필요합니다.');
    res.json(req.user);
  });
  // The duplicate check a signup form needs. It does reveal whether an id is taken, which is unavoidable for
  // this UX and is the same information the signup request itself returns.
  router.get('/available', async (req, res) => {
    const parsed = userHandleSchema.safeParse(req.query.handle);
    if (!parsed.success) return res.json({ available: false, reason: parsed.error.issues[0].message });
    const taken = await users.isHandleTaken(parsed.data);
    res.json({ available: !taken, reason: taken ? '이미 사용 중인 아이디예요.' : '사용할 수 있는 아이디예요.' });
  });
  router.post('/signup', attempts, async (req, res, next) => {
    const body = signupSchema.parse(req.body);
    let created: User;
    // The store runs the uniqueness check and the insert as one operation, so a duplicate cannot slip through
    // between the availability check above and this call.
    try { created = await users.createUser({ handle: body.handle, displayName: body.displayName, passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS) }); }
    catch (error) { if (error instanceof DuplicateHandleError) throw new ApiError(409, error.message); throw error; }
    req.login(created, error => error ? next(error) : res.status(201).json(created));
  });
  router.post('/login', attempts, (req, res, next) => {
    loginSchema.parse(req.body);
    auth.authenticate('local', (error: unknown, user: Express.User | false) => {
      if (error) return next(error);
      // One message for both cases: never say which half was wrong.
      if (!user) return next(new ApiError(401, '아이디 또는 비밀번호가 올바르지 않습니다.'));
      req.login(user, loginError => loginError ? next(loginError) : res.json(user));
    })(req, res, next);
  });
  router.post('/logout', (req, res, next) => {
    req.logout(error => {
      if (error) return next(error);
      req.session.destroy(destroyError => destroyError ? next(destroyError) : res.clearCookie('vibe.sid').status(204).end());
    });
  });
  app.use('/api/auth', router);
}
