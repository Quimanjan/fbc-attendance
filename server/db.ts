import mysql from 'mysql2/promise';
import pg from 'pg';
import { config } from './config.js';

// Two databases are supported with the same SQL (written MySQL-style, with ? placeholders):
// MySQL/MariaDB (XAMPP, the default) and Postgres (Supabase), used when DATABASE_URL is set.
export const isPostgres = !!config.db.url;

export type Row = Record<string, any>;
export interface ExecResult { insertId: number; affectedRows: number }
type Runner = { query: (sql: string, params?: unknown[]) => Promise<any> };

// ---- MySQL ----
export const pool: mysql.Pool | null = isPostgres ? null : mysql.createPool({
  host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
  database: config.db.database, ssl: config.db.ssl,
  waitForConnections: true,
  connectionLimit: 10,
  // Return DATE/TIME/TIMESTAMP columns as plain strings ("2026-10-15", "07:42:00").
  dateStrings: true,
  multipleStatements: false,
});

// ---- Postgres ----
// Same plain strings as MySQL for dates and times, and numbers for counts.
for (const oid of [1082, 1083, 1114, 1184]) pg.types.setTypeParser(oid, v => v);   // date, time, timestamp, timestamptz
pg.types.setTypeParser(20, v => Number(v));                                        // COUNT(*) is bigint
export const pgPool: pg.Pool | null = isPostgres ? new pg.Pool({
  connectionString: config.db.url,
  ssl: config.db.ssl ?? (/localhost|127\.0\.0\.1/.test(config.db.url) ? undefined : { rejectUnauthorized: false }),
  max: process.env.VERCEL ? 3 : 10,
}) : null;

/** Rewrites the app's MySQL-style SQL for Postgres. */
export function toPostgres(sql: string): string {
  let out = '', n = 0, quote = '';
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) { out += ch; if (ch === quote) quote = ''; continue; }
    if (ch === "'") { quote = "'"; out += ch; continue; }
    if (ch === '`') { out += '"'; continue; }
    if (ch === '?') { out += '$' + ++n; continue; }
    out += ch;
  }
  out = out.replace(/\bLIKE\b/g, 'ILIKE');                           // MySQL LIKE ignores case
  if (/^\s*INSERT\s+IGNORE\b/i.test(out)) out = out.replace(/INSERT\s+IGNORE/i, 'INSERT') + ' ON CONFLICT DO NOTHING';
  if (/^\s*INSERT\b/i.test(out) && !/\bRETURNING\b/i.test(out)) out += ' RETURNING *';   // for insertId
  return out;
}

async function pgRun(runner: Runner, sql: string, params: unknown[]) {
  return runner.query(toPostgres(sql), params.map(p => (p === undefined ? null : p)));
}

// ---- Shared ----
export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (pgPool) return (await pgRun(pgPool, sql, params)).rows as T[];
  const [rows] = await pool!.query(sql, params);
  return rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}

export async function exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
  if (pgPool) return pgExec(pgPool, sql, params);
  const [res] = await pool!.query(sql, params);
  return res as mysql.ResultSetHeader;
}

async function pgExec(runner: Runner, sql: string, params: unknown[]): Promise<ExecResult> {
  const r = await pgRun(runner, sql, params);
  const first = r.rows?.[0];
  return { insertId: first ? Number(Object.values(first)[0]) : 0, affectedRows: r.rowCount ?? 0 };
}

/** Runs `fn` in a transaction: everything is saved, or nothing. */
export async function transaction<T>(fn: (exec: (sql: string, params?: unknown[]) => Promise<ExecResult>) => Promise<T>): Promise<T> {
  if (pgPool) {
    const c = await pgPool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn((sql, params = []) => pgExec(c, sql, params));
      await c.query('COMMIT');
      return out;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }
  const c = await pool!.getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(async (sql, params = []) => (await c.query(sql, params))[0] as mysql.ResultSetHeader);
    await c.commit();
    return out;
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}

export async function endPool() { await (pgPool ?? pool)!.end(); }

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the school's time zone. */
export function today(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Current time as HH:MM:SS. */
export function nowTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function weekday(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
}
export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
