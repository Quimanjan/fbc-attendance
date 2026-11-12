// Students, teachers, classes, sections, schedules.
import express from 'express';
import { exec, one, query } from '../db.js';
import { hashPassword } from '../auth.js';
import { DAYS, h, HttpError, int, nullableId, required, text } from '../util.js';

const r = express.Router();

function dupMessage(e: any, what: string): never {
  if (e?.code === 'ER_DUP_ENTRY') throw new HttpError(409, what);
  throw e;
}

// ---- Students ----
r.get('/students', h(async (_req, res) => {
  res.json(await query(`
    SELECT s.student_id, s.student_no, s.first_name, s.middle_name, s.last_name, s.course, s.year_level, s.gender,
           s.section_id, s.parent_email, s.face_consent_at, s.face_consent_by, sec.section_name,
           (SELECT COUNT(*) FROM student_faces f WHERE f.student_id = s.student_id) AS face_samples
    FROM students s LEFT JOIN sections sec ON s.section_id = sec.section_id
    ORDER BY s.last_name, s.first_name`));
}));

r.get('/students/:id', h(async (req, res) => {
  const s = await one(`
    SELECT s.student_id, s.student_no, s.first_name, s.middle_name, s.last_name, s.course, s.year_level, s.gender,
           s.section_id, s.parent_email, s.face_consent_at, s.face_consent_by, sec.section_name,
           (SELECT COUNT(*) FROM student_faces f WHERE f.student_id = s.student_id) AS face_samples
    FROM students s LEFT JOIN sections sec ON s.section_id = sec.section_id WHERE s.student_id = ?`, [int(req.params.id)]);
  if (!s) throw new HttpError(404, 'Student not found.');
  res.json(s);
}));

function studentFields(b: any) {
  required(b, ['student_no', 'first_name', 'last_name']);
  const gender = ['Male', 'Female', 'Other'].includes(b.gender) ? b.gender : null;
  return [text(b.student_no, 30), text(b.first_name, 80), text(b.middle_name, 80), text(b.last_name, 80),
          text(b.course, 100), text(b.year_level, 30) || null, gender, nullableId(b.section_id), text(b.parent_email, 150) || null];
}

r.post('/students', h(async (req, res) => {
  const f = studentFields(req.body);
  const r2 = await exec(`INSERT INTO students (student_no, first_name, middle_name, last_name, course, year_level, gender, section_id, parent_email)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, f)
    .catch(e => dupMessage(e, `Student ID "${f[0]}" is already taken. Please use a different ID.`));
  res.json({ ok: true, id: r2.insertId });
}));

r.put('/students/:id', h(async (req, res) => {
  const f = studentFields(req.body);
  await exec(`UPDATE students SET student_no=?, first_name=?, middle_name=?, last_name=?, course=?, year_level=?, gender=?, section_id=?, parent_email=?
              WHERE student_id=?`, [...f, int(req.params.id)])
    .catch(e => dupMessage(e, `Student ID "${f[0]}" is already taken.`));
  res.json({ ok: true });
}));

r.delete('/students/:id', h(async (req, res) => {
  await exec('DELETE FROM students WHERE student_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));

// ---- Teachers ----
// has_account: the teacher can sign in with their email and a password.
const TEACHER_SQL = `SELECT t.*, (u.password_hash IS NOT NULL) AS has_account
  FROM teachers t LEFT JOIN users u ON u.email = t.email`;
r.get('/teachers', h(async (_req, res) => {
  res.json(await query(`${TEACHER_SQL} ORDER BY t.last_name, t.first_name`));
}));
r.get('/teachers/:id', h(async (req, res) => {
  const t = await one(`${TEACHER_SQL} WHERE t.teacher_id=?`, [int(req.params.id)]);
  if (!t) throw new HttpError(404, 'Teacher not found.');
  res.json(t);
}));
function teacherFields(b: any) {
  required(b, ['first_name', 'last_name', 'email']);
  return [text(b.first_name, 80), text(b.last_name, 80), text(b.email, 150), text(b.department, 100)];
}
r.post('/teachers', h(async (req, res) => {
  const f = teacherFields(req.body);
  await exec('INSERT INTO teachers (first_name, last_name, email, department) VALUES (?, ?, ?, ?)', f)
    .catch(e => dupMessage(e, `A teacher with email ${f[2]} already exists.`));
  res.json({ ok: true });
}));
r.put('/teachers/:id', h(async (req, res) => {
  const f = teacherFields(req.body);
  await exec('UPDATE teachers SET first_name=?, last_name=?, email=?, department=? WHERE teacher_id=?', [...f, int(req.params.id)])
    .catch(e => dupMessage(e, `A teacher with email ${f[2]} already exists.`));
  res.json({ ok: true });
}));
// Admins give a teacher a sign-in: their email plus a password set here.
r.put('/teachers/:id/account', h(async (req, res) => {
  if (req.session.user!.role !== 'admin') throw new HttpError(403, 'Only admins can set teacher passwords.');
  const t = await one('SELECT * FROM teachers WHERE teacher_id=?', [int(req.params.id)]);
  if (!t) throw new HttpError(404, 'Teacher not found.');
  const password = String(req.body?.password ?? '');
  if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for the password.');
  const hash = hashPassword(password);
  const r = await exec('UPDATE users SET password_hash=? WHERE email=?', [hash, t.email]);
  if (!r.affectedRows) await exec(`INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'teacher', ?)`,
    [`${t.first_name} ${t.last_name}`, t.email, hash]);
  res.json({ ok: true });
}));
r.delete('/teachers/:id/account', h(async (req, res) => {
  if (req.session.user!.role !== 'admin') throw new HttpError(403, 'Only admins can remove teacher passwords.');
  const t = await one('SELECT email FROM teachers WHERE teacher_id=?', [int(req.params.id)]);
  if (t) await exec('UPDATE users SET password_hash=NULL WHERE email=?', [t.email]);
  res.json({ ok: true });
}));
r.delete('/teachers/:id', h(async (req, res) => {
  await exec('DELETE FROM teachers WHERE teacher_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));

// ---- Classes, sections, schedules ----
r.get('/classes', h(async (_req, res) => {
  const [classes, sections, schedules] = await Promise.all([
    query(`SELECT c.*, CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
           FROM classes c LEFT JOIN teachers t ON c.teacher_id = t.teacher_id ORDER BY c.class_name`),
    query(`SELECT s.*, c.class_name FROM sections s LEFT JOIN classes c ON s.class_id = c.class_id ORDER BY s.section_name`),
    query(`SELECT sc.*, c.class_name, c.subject, s.section_name
           FROM schedules sc JOIN classes c ON sc.class_id = c.class_id
           LEFT JOIN sections s ON sc.section_id = s.section_id
           ORDER BY CASE sc.day_of_week ${DAYS.map((_, i) => `WHEN ? THEN ${i}`).join(' ')} END, sc.time_start`, DAYS),
  ]);
  res.json({ classes, sections, schedules });
}));

r.post('/classes', h(async (req, res) => {
  const b = req.body;
  required(b, ['class_name']);
  const withSchedule = b.day_of_week && b.time_start && b.time_end;
  if (withSchedule) checkSchedule(b);
  const c = await exec('INSERT INTO classes (class_name, subject, teacher_id) VALUES (?, ?, ?)',
    [text(b.class_name, 100), text(b.subject, 100), nullableId(b.teacher_id)]);
  if (withSchedule) await addSchedule({ ...b, class_id: c.insertId });
  res.json({ ok: true });
}));
r.delete('/classes/:id', h(async (req, res) => {
  await exec('DELETE FROM classes WHERE class_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));

r.post('/sections', h(async (req, res) => {
  required(req.body, ['section_name']);
  await exec('INSERT INTO sections (section_name, class_id) VALUES (?, ?)', [text(req.body.section_name, 100), nullableId(req.body.class_id)]);
  res.json({ ok: true });
}));
r.delete('/sections/:id', h(async (req, res) => {
  await exec('DELETE FROM sections WHERE section_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));

function checkSchedule(b: any) {
  if (!DAYS.includes(b.day_of_week)) throw new HttpError(400, 'Pick a day of the week.');
  const time = /^\d{2}:\d{2}(:\d{2})?$/;
  if (!time.test(b.time_start) || !time.test(b.time_end)) throw new HttpError(400, 'Enter start and end times.');
  if (b.time_end <= b.time_start) throw new HttpError(400, 'End time must be after start time.');
}
async function addSchedule(b: any) {
  checkSchedule(b);
  await exec('INSERT INTO schedules (class_id, section_id, day_of_week, time_start, time_end, room) VALUES (?, ?, ?, ?, ?, ?)',
    [int(b.class_id), nullableId(b.section_id ?? b.sched_section_id), b.day_of_week, b.time_start, b.time_end, text(b.room, 50)]);
}
r.post('/schedules', h(async (req, res) => {
  required(req.body, ['class_id']);
  await addSchedule(req.body);
  res.json({ ok: true });
}));
r.delete('/schedules/:id', h(async (req, res) => {
  await exec('DELETE FROM schedules WHERE schedule_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));

export default r;
