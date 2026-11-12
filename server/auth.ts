import type { Request, Response, NextFunction, Router } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { exec, one } from './db.js';
import { h, HttpError, text } from './util.js';

export interface SessionUser {
  user_id: number;
  name: string;
  email: string;
  picture: string;
  role: 'admin' | 'teacher' | 'student';
  teacher_id: number | null;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    kiosk?: { startedBy: number; room?: string; startedAt?: number };
    oauthState?: string;
  }
}

const oauth = () => new OAuth2Client(config.google.clientId, config.google.clientSecret,
  `${config.appUrl}/auth/google/callback`);

/** Signs a person in after Google confirms who they are. New users start as teachers. */
export async function signIn(req: Request, email: string, name: string, picture: string) {
  const role = config.adminEmails.includes(email.toLowerCase()) ? 'admin' : undefined;
  let user = await one('SELECT * FROM users WHERE email=?', [email]);
  if (!user) {
    const r = await exec('INSERT INTO users (name, email, picture, role) VALUES (?, ?, ?, ?)',
      [name, email, picture, role ?? 'teacher']);
    user = { user_id: r.insertId, role: role ?? 'teacher' };
  } else {
    await exec('UPDATE users SET name=?, picture=?' + (role ? ', role=?' : '') + ' WHERE user_id=?',
      role ? [name, picture, role, user.user_id] : [name, picture, user.user_id]);
    if (role) user.role = role;
  }
  await startSession(req, { ...user, name, email, picture } as any);
}

/** Passwords are stored as scrypt hashes: "scrypt:salt:hash" (hex). */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function checkPassword(password: string, stored: string | null) {
  const [kind, salt, hash] = (stored ?? '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

// Wrong passwords per email: a few tries, then a pause.
const failures = new Map<string, { count: number; until: number }>();

/** Starts a fresh staff session for a users row (sign-in, or leaving kiosk mode). */
export async function startSession(req: Request, user: { user_id: number; name: string; email: string; picture: string; role: SessionUser['role'] }) {
  const teacher = await one('SELECT teacher_id FROM teachers WHERE email=?', [user.email]);
  await new Promise<void>((ok, fail) => req.session.regenerate(e => (e ? fail(e) : ok())));
  req.session.user = {
    user_id: user.user_id, name: user.name, email: user.email, picture: user.picture, role: user.role,
    teacher_id: teacher?.teacher_id ?? null,
  };
}

export function authRoutes(): Router {
  const r = express.Router();

  r.get('/google', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(oauth().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
  });

  r.get('/google/callback', async (req, res) => {
    try {
      if (!req.query.code || req.query.state !== req.session.oauthState) return res.redirect('/login?error=state');
      const client = oauth();
      const { tokens } = await client.getToken(String(req.query.code));
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token!, audience: config.google.clientId });
      const p = ticket.getPayload();
      if (!p?.email || !p.email_verified) return res.redirect('/login?error=email');
      await signIn(req, p.email, p.name ?? p.email, p.picture ?? '');
      res.redirect('/');
    } catch (e) {
      console.error('Google sign-in failed:', (e as Error).message);
      res.redirect('/login?error=google');
    }
  });

  r.post('/login', h(async (req, res) => {
    const email = text(req.body?.email, 150).toLowerCase();
    const password = String(req.body?.password ?? '');
    const f = failures.get(email);
    if (f && f.until > Date.now()) throw new HttpError(429, 'Too many wrong tries. Wait a few minutes and try again.');
    const user = email ? await one('SELECT * FROM users WHERE email=?', [email]) : null;
    if (!user || user.role === 'student' || !checkPassword(password, user.password_hash)) {
      const count = (f?.until && f.until <= Date.now() ? 0 : f?.count ?? 0) + 1;
      failures.set(email, { count, until: count >= 5 ? Date.now() + 5 * 60 * 1000 : 0 });
      throw new HttpError(401, 'Wrong email or password.');
    }
    failures.delete(email);
    await startSession(req, user as any);
    res.json({ ok: true });
  }));

  r.post('/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
  return r;
}

export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

export function requireKiosk(req: Request, res: Response, next: NextFunction) {
  if (!req.session.kiosk) return res.status(401).json({ error: 'Kiosk session expired. Ask a teacher to restart the kiosk.' });
  next();
}

/** Teachers linked to a teachers row (same email) only see their own classes. */
export function teacherFilter(user: SessionUser): { sql: string; params: unknown[] } {
  if (user.role !== 'admin' && user.teacher_id) return { sql: ' AND c.teacher_id = ?', params: [user.teacher_id] };
  return { sql: '', params: [] };
}
