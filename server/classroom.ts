// One classroom through the day: which class is on now, who should be there, and who has checked in.
// Check-ins belong to one class period (schedule + date), so every period starts with an empty room.
import { config } from './config.js';
import { exec, nowTime, one, query, today, weekday } from './db.js';
import { toMinutes } from './face.js';

export interface Period {
  schedule_id: number; time_start: string; time_end: string; room: string;
  class_id: number; class_name: string; subject: string | null;
  section_id: number | null; section_name: string | null; course: string | null; year_level: string | null;
  teacher_id: number | null; teacher_name: string | null; teacher_gender: string | null;
}

const PERIOD_SQL = `
  SELECT sc.schedule_id, sc.time_start, sc.time_end, sc.room,
         c.class_id, c.class_name, c.subject,
         s.section_id, s.section_name, s.course, s.year_level,
         t.teacher_id, CONCAT(t.first_name, ' ', t.last_name) AS teacher_name, t.gender AS teacher_gender
  FROM schedules sc JOIN classes c ON sc.class_id = c.class_id
  LEFT JOIN sections s ON sc.section_id = s.section_id
  LEFT JOIN teachers t ON c.teacher_id = t.teacher_id`;

export async function rooms(): Promise<string[]> {
  const rows = await query<{ room: string }>(
    "SELECT DISTINCT room FROM schedules WHERE room IS NOT NULL AND room <> '' ORDER BY room");
  return rows.map(r => r.room);
}

/** All periods in the room on that date, earliest first. */
export async function periodsFor(room: string, date: string): Promise<Period[]> {
  return query<Period>(`${PERIOD_SQL} WHERE sc.room = ? AND sc.day_of_week = ? ORDER BY sc.time_start`, [room, weekday(date)]);
}

/** The period running at `time` (start inclusive, end exclusive). */
export function periodAt(periods: Period[], time: string): Period | null {
  const t = toMinutes(time);
  return periods.find(p => toMinutes(p.time_start) <= t && t < toMinutes(p.time_end)) ?? null;
}

/** The class running in the room right now, if any. */
export async function currentPeriod(room: string, date = today(), time = nowTime()) {
  return periodAt(await periodsFor(room, date), time);
}

/** Checked in on time (start + grace) is Present, after that Late. */
export function checkinStatus(p: Period, time: string): 'Present' | 'Late' {
  return toMinutes(time) > toMinutes(p.time_start) + config.face.lateGraceMinutes ? 'Late' : 'Present';
}

export interface RosterEntry {
  type: 'student' | 'teacher'; id: number; name: string; gender: string | null;
  status: 'Present' | 'Late' | null; time_in: string | null; method: string | null;
}

/** The teacher and the students of the section who should be in the room for this period. */
export async function roster(p: Period, date: string): Promise<RosterEntry[]> {
  const checkins = await query(
    'SELECT person_type, person_id, status, time_in, method FROM class_checkins WHERE schedule_id=? AND date=?', [p.schedule_id, date]);
  const seen = new Map(checkins.map(c => [`${c.person_type}:${c.person_id}`, c]));
  const entry = (type: 'student' | 'teacher', id: number, name: string, gender: string | null): RosterEntry => {
    const c = seen.get(`${type}:${id}`);
    return { type, id, name, gender, status: c?.status ?? null, time_in: c?.time_in ?? null, method: c?.method ?? null };
  };
  const list: RosterEntry[] = [];
  if (p.teacher_id) list.push(entry('teacher', p.teacher_id, p.teacher_name ?? 'Teacher', p.teacher_gender));
  if (p.section_id) {
    const students = await query(
      `SELECT student_id, CONCAT(first_name, ' ', last_name) AS name, gender FROM students
       WHERE section_id = ? ORDER BY last_name, first_name`, [p.section_id]);
    for (const s of students) list.push(entry('student', s.student_id, s.name, s.gender));
  }
  return list;
}

export type CheckinResult =
  | { result: 'ok' | 'already'; status: 'Present' | 'Late'; time: string; period: Period }
  | { result: 'no_class' }
  | { result: 'not_in_class'; period: Period };

/** Records that a person entered the room for the current period. */
export async function checkIn(room: string, type: 'student' | 'teacher', id: number,
                              method: 'face' | 'qr' | 'manual' | 'demo', confidence: string | null = null,
                              date = today(), time = nowTime()): Promise<CheckinResult> {
  const p = await currentPeriod(room, date, time);
  if (!p) return { result: 'no_class' };
  if (type === 'teacher' && p.teacher_id !== id) return { result: 'not_in_class', period: p };
  if (type === 'student') {
    const s = await one('SELECT section_id FROM students WHERE student_id=?', [id]);
    if (!s || s.section_id !== p.section_id) return { result: 'not_in_class', period: p };
  }
  const existing = await one('SELECT status, time_in FROM class_checkins WHERE schedule_id=? AND date=? AND person_type=? AND person_id=?',
    [p.schedule_id, date, type, id]);
  if (existing) return { result: 'already', status: existing.status, time: existing.time_in, period: p };
  const status = checkinStatus(p, time);
  await exec(`INSERT INTO class_checkins (schedule_id, date, person_type, person_id, time_in, status, method, confidence)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [p.schedule_id, date, type, id, time, status, method, confidence]);
  return { result: 'ok', status, time, period: p };
}

/** Present/late/absent counts for each period of the day (absent only once the period has ended). */
export async function daySummary(periods: Period[], date: string, time: string) {
  const out = [];
  for (const p of periods) {
    const r = await roster(p, date);
    const students = r.filter(e => e.type === 'student');
    const present = students.filter(e => e.status === 'Present').length;
    const late = students.filter(e => e.status === 'Late').length;
    const ended = toMinutes(time) >= toMinutes(p.time_end);
    out.push({
      schedule_id: p.schedule_id, time_start: p.time_start, time_end: p.time_end,
      subject: p.subject || p.class_name, section_name: p.section_name, teacher_name: p.teacher_name,
      expected: students.length, present, late, absent: ended ? students.length - present - late : null,
      teacher_in: r.some(e => e.type === 'teacher' && e.status), ended,
    });
  }
  return out;
}
