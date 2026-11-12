// Writes a shareable copy of the database to sql/attendance_db.sql, for giving the system to someone else
// (setup.bat loads it with npm run import-db). Run: npm run build, then npm run export-db
// Private data is left out: face registrations and login sessions (table structure only), parent emails
// and teacher emails that aren't mock addresses, and every account's own email and password. The first admin account becomes
// a demo login: admin@fbc.local with the password below (change it after signing in).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { hashPassword } from './auth.js';

export const DEMO_EMAIL = 'admin@fbc.local';
export const DEMO_PASSWORD = 'fbcdemo2026';
const STRUCTURE_ONLY = new Set(['sessions', 'student_faces']);

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '..', '..', 'sql', 'attendance_db.sql');   // from dist/server/
const PG_OUT = path.resolve(here, '..', '..', 'sql', 'postgres-data.sql');

/** A value written as a Postgres literal. */
function pgValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'::bytea`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

type Row = Record<string, any>;

function clean(table: string, row: Row, demoAdminId: number | undefined): Row {
  if (table === 'students' && row.parent_email && !/@mock\.fbc\.local$/i.test(row.parent_email)) row.parent_email = null;
  if (table === 'students' && 'password_hash' in row) row.password_hash = null;   // student passwords stay private
  if (table === 'teachers' && row.email && !/@mock\.fbc\.local$/i.test(row.email)) row.email = `teacher${row.teacher_id}@fbc.local`;
  if (table === 'users') {
    const demo = row.user_id === demoAdminId;
    row.name = demo ? 'Demo Admin' : `User ${row.user_id}`;
    row.email = demo ? DEMO_EMAIL : `user${row.user_id}@fbc.local`;
    row.picture = null;
    if ('password_hash' in row) row.password_hash = demo ? hashPassword(DEMO_PASSWORD) : null;
  }
  return row;
}

export async function exportDb() {
  const { url: _url, ...db0 } = config.db;
  const c = await mysql.createConnection({ ...db0, dateStrings: true });
  try {
    const db = config.db.database;
    const [tables] = await c.query('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']) as any;
    const names: string[] = tables.map((t: Row) => Object.values(t)[0]);
    const [[admin]] = await c.query("SELECT user_id FROM users WHERE role='admin' ORDER BY user_id LIMIT 1") as any;
    const out: string[] = [
      `-- FBC Attendance: shareable copy of "${db}", made ${new Date().toISOString()} by npm run export-db.`,
      `-- Load it with: npm run import-db   (setup.bat does this). Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
      'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';", '',
    ];
    const counts: string[] = [];
    // The same rows for Postgres (Supabase); the tables come from sql/postgres-schema.sql.
    const pgOut: string[] = [`-- FBC Attendance sample data for Postgres, made by npm run export-db. Loaded by npm run import-db.`];
    const pgSeq: string[] = [];
    for (const t of names) {
      const [[create]] = await c.query(`SHOW CREATE TABLE \`${t}\``) as any;
      out.push(`DROP TABLE IF EXISTS \`${t}\`;`, (create['Create Table'] as string).replace(/ AUTO_INCREMENT=\d+/, '') + ';');
      if (STRUCTURE_ONLY.has(t)) { counts.push(`${t}: structure only`); out.push(''); continue; }
      const [rows] = await c.query(`SELECT * FROM \`${t}\``) as any;
      counts.push(`${t}: ${rows.length}`);
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200).map((r: Row) => clean(t, r, admin?.user_id));
        const cols = Object.keys(batch[0]).map(k => `\`${k}\``).join(', ');
        const vals = batch.map((r: Row) => '(' + Object.values(r).map(v => c.escape(v)).join(', ') + ')').join(',\n');
        out.push(`INSERT INTO \`${t}\` (${cols}) VALUES\n${vals};`);
        const pgCols = Object.keys(batch[0]).map(k => `"${k}"`).join(', ');
        pgOut.push(`INSERT INTO "${t}" (${pgCols}) VALUES\n${batch.map((r: Row) => '(' + Object.values(r).map(pgValue).join(', ') + ')').join(',\n')};`);
      }
      if (rows.length) {
        const pk = Object.keys(rows[0])[0];
        pgSeq.push(`SELECT setval(pg_get_serial_sequence('"${t}"', '${pk}'), (SELECT MAX("${pk}") FROM "${t}"));`);
      }
      out.push('');
    }
    out.push('SET FOREIGN_KEY_CHECKS=1;', '');
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, out.join('\n'));
    // Parents before children, so foreign keys are satisfied.
    fs.writeFileSync(PG_OUT, pgOrder(pgOut).concat(pgSeq, ['']).join('\n'));
    console.log(`Wrote ${OUT} and ${PG_OUT}\n  ${counts.join('\n  ')}\nDemo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally { await c.end(); }
}

const PG_ORDER = ['users', 'teachers', 'classes', 'sections', 'students', 'schedules', 'attendance', 'class_checkins', 'notifications'];
function pgOrder(lines: string[]) {
  const rank = (l: string) => { const m = /^INSERT INTO "(\w+)"/.exec(l); return m ? PG_ORDER.indexOf(m[1]) + 1 || 99 : 0; };
  return lines.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i).map(x => x.l);
}

if (process.argv[1]?.endsWith('exportDb.js') || process.argv[1]?.endsWith('exportDb.ts')) {
  exportDb().catch(e => { console.error('Export failed:', e.message); process.exit(1); });
}
