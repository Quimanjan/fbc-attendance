// Marks students Absent when they haven't checked in by the end of the grace period,
// and emails parents the same way Record Attendance does.
// The server runs this every school day at AUTO_ABSENT_TIME. To run it by hand:
//   npm run auto-absent -- --dry-run
//   npm run auto-absent -- --date=2026-10-15
import { config } from '../config.js';
import { exec, isDate, one, pool, query, today, weekday } from '../db.js';
import { lateDeadline, toMinutes } from '../face.js';
import { notifyParents } from '../mailer.js';

export async function runAutoAbsent(date = today(), dryRun = false, log = console.log): Promise<number> {
  const day = weekday(date);
  const now = new Date();
  const isToday = date === today(now);
  const nowMin = toMinutes(`${now.getHours()}:${now.getMinutes()}:00`);

  const enrolledOnly = config.face.autoAbsentOnlyEnrolled
    ? 'AND s.face_consent_at IS NOT NULL AND EXISTS (SELECT 1 FROM student_faces f WHERE f.student_id = s.student_id)'
    : '';
  const students = await query(`SELECT s.* FROM students s
    WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = s.student_id AND a.date = ?) ${enrolledOnly}`, [date]);

  let marked = 0;
  for (const stu of students) {
    // School day? Sections with a timetable use it; others default to Monday-Friday.
    const hasTimetable = await one('SELECT 1 AS x FROM schedules WHERE section_id = ? LIMIT 1', [stu.section_id ?? 0]);
    if (hasTimetable) {
      if (!await one('SELECT 1 AS x FROM schedules WHERE section_id = ? AND day_of_week = ? LIMIT 1', [stu.section_id, day])) continue;
    } else if (day === 'Saturday' || day === 'Sunday') continue;

    // Don't mark anyone before their grace period is over.
    if (isToday && nowMin < await lateDeadline(stu.section_id, date)) continue;

    log(`${dryRun ? '[dry run] ' : ''}Absent: ${stu.student_no} ${stu.first_name} ${stu.last_name}`);
    marked++;
    if (dryRun) continue;
    const r = await exec("INSERT IGNORE INTO attendance (student_id, date, status, method) VALUES (?, ?, 'Absent', 'auto')", [stu.student_id, date]);
    if (r.affectedRows === 1) await notifyParents(stu.student_id, 'Absent', date);
  }
  log(`${marked} student(s) ${dryRun ? 'would be ' : ''}marked absent for ${date}.`);
  return marked;
}

if (process.argv[1]?.match(/autoAbsent\.(js|ts)$/)) {
  const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}`));
  const date = arg('date')?.split('=')[1] ?? today();
  if (!isDate(date)) { console.error('Invalid --date, use YYYY-MM-DD.'); process.exit(1); }
  runAutoAbsent(date, !!arg('dry-run'))
    .then(() => pool.end())
    .catch(e => { console.error(e); process.exit(1); });
}
