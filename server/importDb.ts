// Loads the bundled database (sql/attendance_db.sql) into MySQL, so a fresh install starts with the same
// students, teachers, classes and attendance records. Run by setup.bat, or: npm run import-db
// It skips a database that already has students, so running setup again never overwrites your data.
// npm run import-db -- --force replaces the database with the bundled copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { pgPool } from './db.js';
import { migrate } from './migrate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DUMP = path.resolve(here, '..', '..', 'sql', 'attendance_db.sql');   // from dist/server/
const PG_DATA = path.resolve(here, '..', '..', 'sql', 'postgres-data.sql');

export async function importDb(force = false) {
  if (pgPool) return importPostgres(force);
  if (!fs.existsSync(DUMP)) { console.log(`No bundled database at ${DUMP}; skipping.`); return; }
  const { database, url: _url, ...conn } = config.db;
  const c = await mysql.createConnection({ ...conn, multipleStatements: true });
  try {
    await c.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await c.query(`USE \`${database}\``);
    const [t] = await c.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [database, 'students']);
    if ((t as unknown[]).length && !force) {
      const [[n]] = await c.query('SELECT COUNT(*) AS n FROM students') as any;
      if (n.n > 0) {
        console.log(`Database "${database}" already has ${n.n} students; keeping it. (npm run import-db -- --force replaces it.)`);
        return;
      }
    }
    console.log(`Loading the bundled data into "${database}"...`);
    await c.query(fs.readFileSync(DUMP, 'utf8'));
    const [[s]] = await c.query('SELECT COUNT(*) AS n FROM students') as any;
    console.log(`Done: ${s.n} students loaded.`);
  } finally { await c.end(); }
}

/** Postgres (Supabase): creates the tables, then loads the sample data into an empty database. */
async function importPostgres(force: boolean) {
  await migrate(() => {});
  const { rows: [n] } = await pgPool!.query('SELECT COUNT(*)::int AS n FROM students');
  if (n.n > 0 && !force) { console.log(`The database already has ${n.n} students; keeping it.`); return; }
  if (!fs.existsSync(PG_DATA)) { console.log(`No bundled data at ${PG_DATA}; skipping.`); return; }
  console.log('Loading the bundled data...');
  const c = await pgPool!.connect();
  try {
    await c.query('BEGIN');
    await c.query('TRUNCATE users, teachers, classes, sections, students, schedules, attendance, class_checkins, notifications, student_faces RESTART IDENTITY CASCADE');
    await c.query(fs.readFileSync(PG_DATA, 'utf8'));
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  const { rows: [s] } = await pgPool!.query('SELECT COUNT(*)::int AS n FROM students');
  console.log(`Done: ${s.n} students loaded.`);
}

if (process.argv[1]?.endsWith('importDb.js') || process.argv[1]?.endsWith('importDb.ts')) {
  importDb(process.argv.includes('--force')).then(() => pgPool?.end()).catch(e => { console.error('Loading the database failed:', e.message); process.exit(1); });
}
