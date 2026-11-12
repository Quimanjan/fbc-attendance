// Classroom view: the class on now in one room, who should be there, and who has arrived.
import express from 'express';
import type { SessionUser } from '../auth.js';
import { checkIn, currentPeriod, daySummary, periodAt, periodsFor, rooms, roster, type Period } from '../classroom.js';
import { nowTime, today } from '../db.js';
import { seedClassroom } from '../jobs/seedClassroom.js';
import { toMinutes } from '../face.js';
import { h, HttpError, int, text } from '../util.js';

const r = express.Router();

r.get('/rooms', h(async (_req, res) => { res.json(await rooms()); }));

r.get('/classroom', h(async (req, res) => {
  const room = text(req.query.room, 50) || (await rooms())[0];
  if (!room) return res.json({ room: null, rooms: [] });
  const date = today();
  const time = nowTime();
  const periods = await periodsFor(room, date);
  const current = periodAt(periods, time);
  const next = periods.find(p => toMinutes(p.time_start) > toMinutes(time)) ?? null;
  // Any class of the day can be opened to look at, even outside its hours (?preview=schedule_id).
  const previewId = int(req.query.preview);
  const preview = previewId ? periods.find(p => p.schedule_id === previewId) ?? null : null;
  res.json({
    room, rooms: await rooms(), date, time,
    current, next, preview,
    canMark: canMark(req.session.user!, current),
    roster: current ? await roster(current, date) : [],
    previewRoster: preview ? await roster(preview, date) : [],
    periods: await daySummary(periods, date, time),
  });
}));

/** Marking by hand is for the teacher of the class on now (and admins). */
function canMark(user: SessionUser, p: Period | null) {
  return !!p && (user.role === 'admin' || (!!user.teacher_id && user.teacher_id === p.teacher_id));
}

// The class's teacher marks someone in by hand (no camera, or the face wasn't recognized).
r.post('/classroom/checkin', h(async (req, res) => {
  const room = text(req.body.room, 50);
  if (!canMark(req.session.user!, await currentPeriod(room, today())))
    throw new HttpError(403, 'Only the teacher of the class on now can mark people in by hand.');
  const type = req.body.type === 'teacher' ? 'teacher' : 'student';
  const result = await checkIn(room, type, int(req.body.id), 'manual');
  if (result.result === 'no_class') throw new HttpError(400, 'No class is running in this room right now.');
  if (result.result === 'not_in_class') throw new HttpError(400, 'That person is not in the class running now.');
  res.json(result);
}));

// Demo only: a few people from the current class "walk in", so the room can be tried without real check-ins.
r.post('/classroom/demo', h(async (req, res) => {
  if (req.session.user!.role !== 'admin') throw new HttpError(403, 'Only admins can run the demo.');
  const room = text(req.body.room, 50);
  const date = today();
  const p = await currentPeriod(room, date);
  if (!p) return res.json({ added: 0 });
  const waiting = (await roster(p, date)).filter(e => !e.status);
  // The teacher usually arrives first.
  const pick = waiting.filter(e => e.type === 'teacher');
  const students = waiting.filter(e => e.type === 'student').sort(() => Math.random() - 0.5);
  pick.push(...students.slice(0, 1 + Math.floor(Math.random() * 3)));
  for (const e of pick) await checkIn(room, e.type, e.id, 'demo', null, date);
  res.json({ added: pick.length });
}));

// Adds the sample Room 101 (10 mock classes with teachers and students).
r.post('/classroom/seed', h(async (req, res) => {
  if (req.session.user!.role !== 'admin') throw new HttpError(403, 'Only admins can add the sample classroom.');
  await seedClassroom(false, () => {});
  res.json({ ok: true });
}));

export default r;
