// Vercel entry point: every /api and /auth request runs the same Express app as start.bat.
// The React pages and face models are served as static files from dist/client (see vercel.json).
// On the first request the database is set up, and the sample data (sql/attendance_db.sql) is loaded
// if the database has no students yet.
import { createApp } from '../dist/server/index.js';
import { importDb } from '../dist/server/importDb.js';
import { migrate } from '../dist/server/migrate.js';

const app = createApp();
let ready;

export default async function handler(req, res) {
  try {
    ready ??= importDb().then(() => migrate(() => {}));
    await ready;
  } catch (e) {
    ready = undefined;   // try again on the next request
    console.error('Database setup failed:', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Could not reach the database. Check the DB_ settings in Vercel.' }));
  }
  req.url = originalUrl(req.url);
  return app(req, res);
}

// The rewrite in vercel.json passes the address the browser asked for as ?__url=, in case the function
// sees /api/index instead. Put it back and drop the helper parameters before Express routes it.
function originalUrl(url) {
  const u = new URL(url, 'http://x');
  const wanted = u.searchParams.get('__url');
  u.searchParams.delete('__url');
  u.searchParams.delete('path');
  const path = u.pathname === '/api/index' && wanted ? wanted : u.pathname;
  const q = u.searchParams.toString();
  return path + (q ? '?' + q : '');
}
