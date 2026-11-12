// Loads the bundled database (sql/attendance_db.sql) into MySQL, so a fresh install starts with the same
// students, teachers, classes and attendance records. Run by setup.bat, or: npm run import-db
// It skips a database that already has students, so running setup again never overwrites your data.
// npm run import-db -- --force replaces the database with the bundled copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DUMP = path.resolve(here, '..', '..', 'sql', 'attendance_db.sql');   // from dist/server/

export async function importDb(force = false) {
  if (!fs.existsSync(DUMP)) { console.log(`No bundled database at ${DUMP}; skipping.`); return; }
  const { database, ...conn } = config.db;
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

if (process.argv[1]?.endsWith('importDb.js') || process.argv[1]?.endsWith('importDb.ts')) {
  importDb(process.argv.includes('--force')).catch(e => { console.error('Loading the database failed:', e.message); process.exit(1); });
}
