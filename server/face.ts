import { config } from './config.js';
import { one, query, weekday } from './db.js';

export const FACE_MODEL = 'faceapi-resnet34-v1';
export const FACE_DIMS = 128;

/** Validates an embedding from the browser: exactly 128 finite numbers. */
export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== FACE_DIMS) return null;
  for (const v of value) if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 10) return null;
  return value as number[];
}

export function packEmbedding(e: number[]): Buffer {
  const buf = Buffer.alloc(FACE_DIMS * 4);
  e.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}
export function unpackEmbedding(buf: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i < FACE_DIMS; i++) out.push(buf.readFloatLE(i * 4));
  return out;
}

export function faceDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < FACE_DIMS; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

export type MatchResult =
  | { student: Record<string, any>; distance: number; reason: 'match' }
  | { student: null; distance: number | null; reason: 'no_enrollments' | 'no_match' | 'ambiguous' };

/** Finds the enrolled student closest to `embedding`. Matching happens only on the server. */
export async function matchFace(embedding: number[]): Promise<MatchResult> {
  const rows = await query<{ student_id: number; embedding: Buffer }>(
    `SELECT f.student_id, f.embedding FROM student_faces f
     JOIN students s ON s.student_id = f.student_id
     WHERE s.face_consent_at IS NOT NULL AND f.model = ?`, [FACE_MODEL]);
  const best = new Map<number, number>();
  for (const r of rows) {
    const d = faceDistance(embedding, unpackEmbedding(r.embedding));
    if (!best.has(r.student_id) || d < best.get(r.student_id)!) best.set(r.student_id, d);
  }
  if (best.size === 0) return { student: null, distance: null, reason: 'no_enrollments' };

  const sorted = [...best.entries()].sort((a, b) => a[1] - b[1]);
  const [topId, top] = sorted[0];
  const second = sorted[1]?.[1] ?? Infinity;
  if (top > config.face.threshold) return { student: null, distance: top, reason: 'no_match' };
  if (second - top < config.face.margin) return { student: null, distance: top, reason: 'ambiguous' };

  const student = await one('SELECT * FROM students WHERE student_id=?', [topId]);
  return student ? { student, distance: top, reason: 'match' } : { student: null, distance: top, reason: 'no_match' };
}

/** First class start ("HH:MM:SS") for the section that day, or DEFAULT_START_TIME. */
export async function classStartTime(sectionId: number | null, date: string): Promise<string> {
  const r = await one<{ t: string | null }>(
    'SELECT MIN(time_start) AS t FROM schedules WHERE section_id=? AND day_of_week=?', [sectionId ?? 0, weekday(date)]);
  if (r?.t) return r.t;
  const [h, m] = config.face.defaultStartTime.split(':');
  return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:00`;
}

export function toMinutes(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 60 + m + (s || 0) / 60;
}

/** Late deadline for the section that day, in minutes after midnight. */
export async function lateDeadline(sectionId: number | null, date: string): Promise<number> {
  return toMinutes(await classStartTime(sectionId, date)) + config.face.lateGraceMinutes;
}

export async function statusForCheckin(sectionId: number | null, date: string, time: string) {
  return toMinutes(time) > await lateDeadline(sectionId, date) ? 'Late' : 'Present';
}

export const formatTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
