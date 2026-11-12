import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  // Return DATE/TIME/TIMESTAMP columns as plain strings ("2026-10-15", "07:42:00").
  dateStrings: true,
  multipleStatements: false,
});

export type Row = Record<string, any>;

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}

export async function exec(sql: string, params: unknown[] = []) {
  const [res] = await pool.query(sql, params);
  return res as mysql.ResultSetHeader;
}

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
