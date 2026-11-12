// Face registration (staff) and kiosk check-in.
import express from 'express';
import crypto from 'node:crypto';
import { requireKiosk, requireStaff, startSession } from '../auth.js';
import { config } from '../config.js';
import { exec, nowTime, one, query, today, transaction } from '../db.js';
import { FACE_MODEL, faceDistance, formatTime, matchFace, packEmbedding, parseEmbedding, statusForCheckin } from '../face.js';
import { notifyParents } from '../mailer.js';
import { checkIn } from '../classroom.js';
import { h, HttpError, int, text } from '../util.js';

export const faceRoutes = express.Router();
faceRoutes.use(requireStaff);

faceRoutes.post('/students/:id/consent', h(async (req, res) => {
  const by = text(req.body.consent_by, 150);
  if (!by || !req.body.confirm) throw new HttpError(400, 'Enter the parent/guardian name and tick the confirmation box.');
  await exec('UPDATE students SET face_consent_at=NOW(), face_consent_by=? WHERE student_id=?', [by, int(req.params.id)]);
  res.json({ ok: true });
}));

// Deletes all face data and withdraws consent; the student goes back to manual attendance.
faceRoutes.delete('/students/:id/face', h(async (req, res) => {
  const id = int(req.params.id);
  await exec('DELETE FROM student_faces WHERE student_id=?', [id]);
  await exec('UPDATE students SET face_consent_at=NULL, face_consent_by=NULL WHERE student_id=?', [id]);
  res.json({ ok: true });
}));

faceRoutes.post('/students/:id/face', h(async (req, res) => {
  const id = int(req.params.id);
  const stu = await one('SELECT face_consent_at FROM students WHERE student_id=?', [id]);
  if (!stu) throw new HttpError(404, 'Student not found.');
  if (!stu.face_consent_at) throw new HttpError(400, 'Record consent first.');

  const samples = (Array.isArray(req.body.samples) ? req.body.samples : []).map(parseEmbedding).filter(Boolean) as number[][];
  if (samples.length < 3 || samples.length > 10) throw new HttpError(400, 'Need 3 to 10 good samples.');

  for (let i = 0; i < samples.length; i++)
    for (let j = i + 1; j < samples.length; j++)
      if (faceDistance(samples[i], samples[j]) > 0.65)   // turned and tilted views of one face differ more than straight-on ones
        throw new HttpError(400, 'The samples look like different people. Make sure only this student is in view and try again.');

  // One face can't be registered to two students.
  for (const s of samples) {
    const m = await matchFace(s);
    if (m.student && m.student.student_id !== id) {
      const other = `${m.student.first_name} ${m.student.last_name}`;
      throw new HttpError(409, `This face is very similar to ${other}, who is already registered. If that is a mistake, remove ${other}'s face data first.`);
    }
  }

  await transaction(async run => {
    await run('DELETE FROM student_faces WHERE student_id=?', [id]);
    for (const s of samples) {
      await run('INSERT INTO student_faces (student_id, embedding, model, enrolled_by) VALUES (?, ?, ?, ?)',
        [id, packEmbedding(s), FACE_MODEL, req.session.user!.user_id]);
    }
  });
  res.json({ ok: true, count: samples.length });
}));

// ---- QR codes ----
// A random code per student (not the student number, so a card can't be made up from a class list).
const QR_PREFIX = 'FBC1-';
const newToken = () => QR_PREFIX + crypto.randomBytes(18).toString('base64url');

async function qrFor(studentId: number, renew = false) {
  const s = await one('SELECT qr_token FROM students WHERE student_id=?', [studentId]);
  if (!s) throw new HttpError(404, 'Student not found.');
  if (s.qr_token && !renew) return s.qr_token as string;
  const token = newToken();
  await exec('UPDATE students SET qr_token=? WHERE student_id=?', [token, studentId]);
  return token;
}

faceRoutes.get('/students/:id/qr', h(async (req, res) => { res.json({ token: await qrFor(int(req.params.id)) }); }));
// A lost card: the old code stops working.
faceRoutes.post('/students/:id/qr', h(async (req, res) => { res.json({ token: await qrFor(int(req.params.id), true) }); }));

// Cards for printing: everyone, or one section.
faceRoutes.get('/qr-cards', h(async (req, res) => {
  const sectionId = int(req.query.section_id);
  const where = sectionId ? 'WHERE s.section_id = ?' : '';
  const params = sectionId ? [sectionId] : [];
  const missing = await query(`SELECT student_id FROM students s ${where ? where + ' AND' : 'WHERE'} qr_token IS NULL`, params);
  for (const m of missing) await qrFor(m.student_id);
  res.json(await query(`
    SELECT s.student_id, s.student_no, s.first_name, s.last_name, s.course, s.year_level, s.qr_token, sec.section_name
    FROM students s LEFT JOIN sections sec ON s.section_id = sec.section_id ${where}
    ORDER BY sec.section_name, s.last_name, s.first_name`, params));
}));

// ---- Kiosk ----
export const kioskRoutes = express.Router();

// Turns this browser into a kiosk: the staff login on this device ends,
// and the kiosk session can only use the check-in endpoints.
// With a room, it is that classroom's door camera and also records who entered for the class on now.
kioskRoutes.post('/start', requireStaff, h(async (req, res) => {
  const startedBy = req.session.user!.user_id;
  const room = text(req.body?.room, 50) || undefined;
  await new Promise<void>((ok, fail) => req.session.regenerate(e => (e ? fail(e) : ok())));
  req.session.kiosk = { startedBy, room, startedAt: Date.now() };
  res.json({ ok: true });
}));

// Leaving the kiosk signs the staff member who started it back in on this device,
// for up to a school day; after that it goes back to the login page.
kioskRoutes.post('/exit', requireKiosk, h(async (req, res) => {
  const { startedBy, startedAt } = req.session.kiosk!;
  const user = startedAt && Date.now() - startedAt < 16 * 3600 * 1000
    ? await one('SELECT user_id, name, email, picture, role FROM users WHERE user_id=?', [startedBy]) : null;
  if (!user || user.role === 'student') {
    await new Promise<void>(ok => req.session.destroy(() => ok()));
    return res.json({ signedIn: false });
  }
  await startSession(req, user as any);
  res.json({ signedIn: true });
}));

kioskRoutes.post('/ping', requireKiosk, (_req, res) => { res.json({ ok: true }); });
kioskRoutes.get('/settings', requireKiosk, (req, res) => {
  res.json({ requireBlink: config.face.requireBlink, room: req.session.kiosk!.room ?? null, cooldownSeconds: config.face.scanCooldownSeconds });
});

kioskRoutes.post('/checkin', requireKiosk, h(async (req, res) => {
  const embedding = parseEmbedding(req.body.embedding);
  if (!embedding || (config.face.requireBlink && req.body.live !== true)) throw new HttpError(400, 'Invalid face data.');

  const match = await matchFace(embedding);
  if (!match.student) return res.json({ result: 'unknown', reason: match.reason });

  res.json(await scanOnce(match.student, () => recordCheckin(req, match.student!, 'face', Math.max(0, 1 - match.distance).toFixed(3))));
}));

// The student's QR card, for when the face isn't recognized.
kioskRoutes.post('/checkin-qr', requireKiosk, h(async (req, res) => {
  const token = text(req.body.token, 40);
  const stu = token.startsWith(QR_PREFIX) ? await one('SELECT * FROM students WHERE qr_token=?', [token]) : undefined;
  if (!stu) return res.json({ result: 'unknown_qr' });
  res.json(await scanOnce(stu, () => recordCheckin(req, stu, 'qr', null)));
}));

// ---- Scan cooldown ----
// After a student is scanned, by face or by QR card, more scans of that same student are ignored
// for SCAN_COOLDOWN_SECONDS (20 s), on every kiosk, so one person standing at the camera or holding
// up a card is recorded once. The clock starts at the scan that was recorded and isn't extended by ignored scans.
const lastScan = new Map<number, number>();

async function scanOnce(stu: Record<string, any>, record: () => Promise<Record<string, unknown>>) {
  const id: number = stu.student_id;
  const cooldownMs = config.face.scanCooldownSeconds * 1000;
  const now = Date.now();
  const last = lastScan.get(id);
  if (cooldownMs > 0 && last !== undefined && now - last < cooldownMs) {
    return { result: 'cooldown', name: `${stu.first_name} ${stu.last_name}`, wait: Math.ceil((cooldownMs - (now - last)) / 1000) };
  }
  lastScan.set(id, now);   // set before recording, so two kiosks scanning at the same moment record once
  // Forget old entries now and then so the map stays small.
  if (lastScan.size > 500) for (const [k, t] of lastScan) if (now - t >= cooldownMs) lastScan.delete(k);
  try { return await record(); }
  catch (e) { lastScan.delete(id); throw e; }   // nothing was recorded, so let the next scan try again
}

/** Records a recognized student: the whole-day attendance, and at a classroom door the class on now. */
async function recordCheckin(req: express.Request, stu: Record<string, any>, method: 'face' | 'qr', confidence: string | null) {
  const studentId: number = stu.student_id;
  const name = `${stu.first_name} ${stu.last_name}`;
  const date = today();
  const time = nowTime();
  const daily = await recordDaily(stu, date, time, method, confidence, req.session.kiosk!.startedBy);
  const room = req.session.kiosk!.room;
  if (!room) return { result: daily.already ? 'already' : 'ok', name, status: daily.status, time: formatTime(daily.time) };

  // Classroom door: the check-in counts for the class running in this room now.
  const c = await checkIn(room, 'student', studentId, method, confidence, date, time);
  if (c.result === 'no_class') return { result: 'no_class', name };
  const subject = c.period.subject || c.period.class_name;
  if (c.result === 'not_in_class') return { result: 'wrong_class', name, subject, section: c.period.section_name };
  return { result: c.result, name, status: c.status, time: formatTime(c.time), subject };
}

/** The whole-day attendance row: the first check-in of the day sets Present or Late. */
async function recordDaily(stu: Record<string, any>, date: string, time: string, method: 'face' | 'qr', confidence: string | null, by: number) {
  const studentId: number = stu.student_id;
  const existing = await one('SELECT * FROM attendance WHERE student_id=? AND date=?', [studentId, date]);
  if (existing?.time_in) return { already: true, status: existing.status as string, time: existing.time_in as string };

  let status = await statusForCheckin(stu.section_id, date, time);
  if (!existing) {
    await exec(`INSERT INTO attendance (student_id, date, status, recorded_by, time_in, method, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)`, [studentId, date, status, by, time, method, confidence]);
  } else if (existing.status === 'Absent') {
    // Marked absent (by a teacher or the auto-absent job) but showed up: they are late.
    status = 'Late';
    await exec('UPDATE attendance SET status=?, time_in=?, method=?, confidence=? WHERE attendance_id=?',
      [status, time, method, confidence, existing.attendance_id]);
  } else {
    // A teacher already set Present/Late/Excused: keep it, just record the arrival time.
    status = existing.status;
    await exec('UPDATE attendance SET time_in=?, confidence=? WHERE attendance_id=?', [time, confidence, existing.attendance_id]);
  }
  if (status === 'Late' && existing?.status !== 'Late') notifyParents(studentId, 'Late', date, formatTime(time)).catch(() => {});
  return { already: false, status, time };
}
