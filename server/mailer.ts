import nodemailer from 'nodemailer';
import { config } from './config.js';
import { one } from './db.js';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: config.mail.username, pass: config.mail.password },
  connectionTimeout: 15000,
});

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const longDate = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });

interface Template {
  banner: string;          // HTML for the colored strip under the header
  bannerStyle: string;
  intro: string;           // HTML paragraph
  rows: [string, string][];
  after: string;           // HTML after the details box
}

function render(t: Template): string {
  const row = ([label, value]: [string, string]) => `
                <tr>
                  <td style="font-size:12px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.8px;width:40%;">${label}</td>
                  <td style="font-size:14px;color:#18181b;font-weight:500;">${value}</td>
                </tr>`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr><td style="background:#7B0000;padding:28px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">FBC Attendance System</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Fellowship Baptist College</p>
        </td></tr>
        <tr><td style="${t.bannerStyle}">${t.banner}</td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 18px;color:#18181b;font-size:14px;line-height:1.6;">Dear Parent / Guardian,</p>
          <p style="margin:0 0 24px;color:#18181b;font-size:14px;line-height:1.6;">${t.intro}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:8px;border:1px solid #e4e4e7;margin-bottom:24px;">
            <tr><td style="padding:18px 20px;">
              <table width="100%" cellpadding="6" cellspacing="0">${t.rows.map(row).join('')}
              </table>
            </td></tr>
          </table>
          ${t.after}
        </td></tr>
        <tr><td style="background:#f4f4f5;padding:18px 32px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;color:#71717a;font-size:12px;text-align:center;line-height:1.6;">
            This is an automated message from the <strong>FBC Attendance Monitoring System</strong>.<br>Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const pill = (bg: string, fg: string, text: string, size = 12) =>
  `<span style="display:inline-block;padding:3px 10px;background:${bg};color:${fg};border-radius:999px;font-size:${size}px;font-weight:600;">${text}</span>`;
const note = (html: string, mb = 0) =>
  `<p style="margin:0 0 ${mb}px;color:#71717a;font-size:13px;line-height:1.6;">${html}</p>`;
const para = (html: string) =>
  `<p style="margin:0 0 24px;color:#18181b;font-size:14px;line-height:1.6;">${html}</p>`;

async function send(to: string, subject: string, html: string, text: string) {
  if (!config.mail.enabled) return { success: true, message: 'Email disabled' };
  try {
    await transporter.sendMail({
      from: { name: config.mail.fromName, address: config.mail.username },
      to, subject, html, text,
    });
    return { success: true, message: `Email sent to ${to}` };
  } catch (e) {
    console.error(`Email to ${to} failed:`, (e as Error).message);
    return { success: false, message: 'Email error: ' + (e as Error).message };
  }
}

export function sendAbsenceEmail(parentEmail: string, studentName: string, date: string) {
  const html = render({
    bannerStyle: 'background:#fee2e2;padding:14px 32px;border-bottom:1px solid #fca5a5;',
    banner: '<p style="margin:0;color:#991b1b;font-size:13.5px;font-weight:600;">&#9888;&#65039; Absence Notice</p>',
    intro: 'Your child was marked <strong style="color:#991b1b;">ABSENT</strong> from class. Please see the details below:',
    rows: [['Student Name', esc(studentName)], ['Date', longDate(date)], ['Status', pill('#fee2e2', '#991b1b', 'ABSENT')]],
    after: para('If your child was absent due to a valid reason, please contact the school at your earliest convenience.') +
      note("If you believe this was an error, please reach out to your child's teacher or school administrator immediately."),
  });
  return send(parentEmail, `Absence Notice - ${studentName}`, html,
    `Dear Parent/Guardian,\n\nYour child ${studentName} was marked ABSENT on ${longDate(date)}.\n\nPlease contact the school if this is an error.\n\nFBC Attendance System`);
}

export function sendThreeAbsenceWarning(parentEmail: string, studentName: string, absenceCount: number) {
  const html = render({
    bannerStyle: 'background:#7f1d1d;padding:18px 32px;border-bottom:1px solid #991b1b;',
    banner: '<p style="margin:0;color:#fecaca;font-size:15px;font-weight:700;text-align:center;">&#128680; MULTIPLE ABSENCE WARNING</p>',
    intro: `We are writing to inform you that your child has now accumulated <strong style="color:#991b1b;">${absenceCount} ABSENCES</strong>. This is a serious concern that requires your immediate attention.`,
    rows: [['Student Name', esc(studentName)], ['Total Absences', pill('#fee2e2', '#991b1b', `${absenceCount} Absences`, 14)]],
    after: `<p style="margin:0 0 16px;color:#18181b;font-size:14px;line-height:1.6;">We strongly encourage you to:</p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#18181b;font-size:14px;line-height:2;">
            <li>Contact your child's teacher or class adviser immediately</li>
            <li>Visit the school to discuss your child's attendance</li>
            <li>Submit excuse letters for any valid absences</li>
          </ul>` + note("Continued absences may affect your child's academic standing. Please act promptly."),
  });
  return send(parentEmail, `Absence Warning - ${studentName} has ${absenceCount} absences`, html,
    `Dear Parent/Guardian,\n\nWARNING: Your child ${studentName} has accumulated ${absenceCount} absences.\n\nPlease contact the school immediately.\n\nFBC Attendance System`);
}

export function sendLateEmail(parentEmail: string, studentName: string, date: string, time?: string) {
  const rows: [string, string][] = [['Student Name', esc(studentName)], ['Date', longDate(date)]];
  if (time) rows.push(['Time In', esc(time)]);
  rows.push(['Status', pill('#fef3c7', '#92400e', 'LATE')]);
  const html = render({
    bannerStyle: 'background:#fef3c7;padding:14px 32px;border-bottom:1px solid #fcd34d;',
    banner: '<p style="margin:0;color:#92400e;font-size:13.5px;font-weight:600;">&#9200; Late Attendance Notice</p>',
    intro: 'Your child arrived <strong style="color:#92400e;">LATE</strong> to class. Please see the details below:',
    rows,
    after: note('Please remind your child to arrive on time. If you believe this was an error, contact the school.'),
  });
  return send(parentEmail, `Late Attendance Notice - ${studentName}`, html,
    `Dear Parent/Guardian,\n\nYour child ${studentName} arrived LATE on ${longDate(date)}.\n\nFBC Attendance System`);
}

export async function absenceCount(studentId: number): Promise<number> {
  const r = await one<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM attendance WHERE student_id=? AND status='Absent'", [studentId]);
  return Number(r?.cnt ?? 0);
}

/** Emails parents after a status change, same rules as Record Attendance. */
export async function notifyParents(studentId: number, status: string, date: string, time?: string) {
  if (status !== 'Absent' && status !== 'Late') return;
  const stu = await one('SELECT first_name, last_name, parent_email FROM students WHERE student_id=?', [studentId]);
  if (!stu?.parent_email) return;
  const name = `${stu.first_name} ${stu.last_name}`;
  if (status === 'Late') { await sendLateEmail(stu.parent_email, name, date, time); return; }
  await sendAbsenceEmail(stu.parent_email, name, date);
  const count = await absenceCount(studentId);
  if (count >= 3) await sendThreeAbsenceWarning(stu.parent_email, name, count);
}
