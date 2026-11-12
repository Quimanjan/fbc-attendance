import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { authRoutes, requireStaff } from './auth.js';
import { migrate } from './migrate.js';
import records from './routes/records.js';
import attendance from './routes/attendance.js';
import { faceRoutes, kioskRoutes } from './routes/face.js';
import classroom from './routes/classroom.js';
import { runAutoAbsent } from './jobs/autoAbsent.js';
import { HttpError } from './util.js';

export function createApp(extra?: (app: express.Express) => void) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  const MySQLStore = MySQLStoreFactory(session as any);
  app.use(session({
    name: 'fbc.sid',
    secret: config.sessionSecret,
    store: new MySQLStore({ createDatabaseTable: true }, pool as any),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000 },
  }));

  extra?.(app);

  app.get('/api/me', (req, res) => {
    res.json({ user: req.session.user ?? null, kiosk: !!req.session.kiosk });
  });
  app.use('/auth', authRoutes());
  app.use('/api/kiosk', kioskRoutes);
  app.use('/api', faceRoutes);
  app.use('/api', requireStaff, records);
  app.use('/api', requireStaff, attendance);
  app.use('/api', requireStaff, classroom);
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

  // The built React app.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, '../client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
  return app;
}

function scheduleAutoAbsent() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(config.face.autoAbsentTime);
  if (!m) { console.log('Auto-absent is off (AUTO_ABSENT_TIME is empty).'); return; }
  // Every day; runAutoAbsent itself skips non-school days per section.
  cron.schedule(`${Number(m[2])} ${Number(m[1])} * * *`, () => {
    runAutoAbsent().catch(e => console.error('Auto-absent failed:', e));
  }, { timezone: config.tz });
  console.log(`Auto-absent runs daily at ${config.face.autoAbsentTime} (${config.tz}).`);
}

if (process.argv[1]?.match(/index\.(js|ts)$/)) {
  await migrate(() => {});
  createApp().listen(config.port, () => {
    console.log(`FBC Attendance is running at ${config.appUrl}`);
    scheduleAutoAbsent();
  });
}
