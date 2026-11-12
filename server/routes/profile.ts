// Student profiles: a student signs in to see their details and attendance and to download their own QR card.
import express from 'express';
import { checkPassword, hashPassword } from '../auth.js';
import { exec, one, query } from '../db.js';
import { qrFor } from './face.js';
import { h, HttpError, int } from '../util.js';

// ---- For the signed-in student (/api/student/...) ----
export const studentRoutes = express.Router();

studentRoutes.get('/profile', h(async (req, res) => {
  const id = req.session.student!.student_id;
  const s = await one(`
    SELECT s.student_id, s.student_no, s.first_name, s.middle_name, s.last_name, s.course, s.year_level, s.gender,
           sec.section_name,
           (SELECT COUNT(*) FROM student_faces f WHERE f.student_id = s.student_id) AS face_samples
    FROM students s LEFT JOIN sections sec ON s.section_id = sec.section_id WHERE s.student_id = ?`, [id]);
  if (!s) {   // removed by staff while signed in
    req.session.destroy(() => {});
    throw new HttpError(401, 'Please sign in.');
  }
  const qr_token = await qrFor(id);
  const totals = await query<{ status: string; n: number }>(
    'SELECT status, COUNT(*) AS n FROM attendance WHERE student_id=? GROUP BY status', [id]);
  const recent = await query(
    'SELECT date, status, time_in, method FROM attendance WHERE student_id=? ORDER BY date DESC LIMIT 20', [id]);
  res.json({
    ...s, face_samples: Number(s.face_samples), qr_token,
    totals: Object.fromEntries(totals.map(t => [t.status, Number(t.n)])),
    recent,
  });
}));

studentRoutes.put('/password', h(async (req, res) => {
  const id = req.session.student!.student_id;
  const current = String(req.body?.current ?? '');
  const next = String(req.body?.password ?? '');
  if (next.length < 8) throw new HttpError(400, 'The new password needs at least 8 characters.');
  const s = await one('SELECT password_hash FROM students WHERE student_id=?', [id]);
  if (!s || !checkPassword(current, s.password_hash)) throw new HttpError(400, 'Your current password is wrong.');
  await exec('UPDATE students SET password_hash=? WHERE student_id=?', [hashPassword(next), id]);
  res.json({ ok: true });
}));

// ---- For staff: give a student a sign-in password (Edit Student) ----
export const studentAccountRoutes = express.Router();

studentAccountRoutes.get('/students/:id/account', h(async (req, res) => {
  const s = await one('SELECT password_hash FROM students WHERE student_id=?', [int(req.params.id)]);
  if (!s) throw new HttpError(404, 'Student not found.');
  res.json({ has_account: !!s.password_hash });
}));

studentAccountRoutes.put('/students/:id/account', h(async (req, res) => {
  const password = String(req.body?.password ?? '');
  if (password.length < 8) throw new HttpError(400, 'The password needs at least 8 characters.');
  const r = await exec('UPDATE students SET password_hash=? WHERE student_id=?', [hashPassword(password), int(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'Student not found.');
  res.json({ ok: true });
}));

studentAccountRoutes.delete('/students/:id/account', h(async (req, res) => {
  await exec('UPDATE students SET password_hash=NULL WHERE student_id=?', [int(req.params.id)]);
  res.json({ ok: true });
}));
