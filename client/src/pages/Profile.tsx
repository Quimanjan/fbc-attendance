import { useState } from 'react';
import { api, BADGE, longDate, time12 } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { Icon } from '../icons';
import { downloadQrCard, QrImage, type QrCardData } from '../qr';
import { IconLabel } from '../ui';

interface Profile extends QrCardData {
  middle_name: string | null; gender: string | null; face_samples: number;
  totals: Record<string, number>;
  recent: { date: string; status: string; time_in: string | null; method: string }[];
}

const METHOD: Record<string, string> = { face: 'face scan', qr: 'QR code', manual: 'marked by teacher', auto: 'no check-in' };

/** What a signed-in student sees: their details, attendance, and their own QR card to download. */
export default function StudentProfile() {
  const { data: p, error } = useApi<Profile>('/student/profile');
  const [saving, setSaving] = useState(false);
  const logout = async () => { await fetch('/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/login'; };
  const download = async () => { if (!p) return; setSaving(true); await downloadQrCard(p).catch(() => {}); setSaving(false); };

  return (
    <div className="profile-page">
      <header className="profile-top">
        <div className="profile-brand"><img src="/fbc_logo.png" alt="FBC" /><span>FBC <small>Attendance</small></span></div>
        <button className="btn btn-outline btn-sm" onClick={logout}><IconLabel icon="logout">Sign out</IconLabel></button>
      </header>
      <main className="profile-main">
        {error && <div className="alert alert-error">{error}</div>}
        {p && <>
          <section className="card profile-id">
            <div className="profile-avatar"><Icon name="user" /></div>
            <div>
              <h1>{[p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')}</h1>
              <div className="muted">Student ID {p.student_no}</div>
              <dl className="profile-facts">
                <div><dt>Course</dt><dd>{p.course || '—'}</dd></div>
                <div><dt>Year level</dt><dd>{p.year_level || '—'}</dd></div>
                <div><dt>Section</dt><dd>{p.section_name || '—'}</dd></div>
                <div><dt>Face check-in</dt><dd>{p.face_samples > 0 ? 'Registered' : 'Not yet registered'}</dd></div>
              </dl>
            </div>
          </section>

          <div className="profile-grid">
            <section className="card profile-qr">
              <div className="sec-title" style={{ marginTop: 0 }}>My QR code</div>
              <div className="qr-card"><QrImage value={p.qr_token} size={200} />
                <div className="qr-card-name">{p.first_name} {p.last_name}</div>
                <div className="qr-card-sub">{p.student_no}</div>
              </div>
              <button className="btn btn-primary" onClick={download} disabled={saving}>
                <IconLabel icon="download">{saving ? 'Preparing…' : 'Download QR code'}</IconLabel></button>
              <p className="muted">Show it to the check-in camera when your face isn't recognized. It works only for you,
                so don't share it. Lost your phone or card? Ask your teacher for a new code.</p>
            </section>

            <section className="card">
              <div className="sec-title" style={{ marginTop: 0 }}>My attendance</div>
              <div className="profile-totals">
                {(['Present', 'Late', 'Absent', 'Excused'] as const).map(st => (
                  <div key={st} className={`profile-total ${BADGE[st]}`}><strong>{p.totals[st] ?? 0}</strong><span>{st}</span></div>
                ))}
              </div>
              {p.recent.length === 0 ? <p className="muted">No attendance recorded yet.</p> : (
                <table className="profile-table">
                  <thead><tr><th>Date</th><th>Status</th><th>Time in</th></tr></thead>
                  <tbody>{p.recent.map(r => (
                    <tr key={r.date}>
                      <td>{longDate(r.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td><span className={`badge ${BADGE[r.status]}`}>{r.status}</span></td>
                      <td className="muted">{r.time_in ? time12(r.time_in) : '—'} {METHOD[r.method] ? `(${METHOD[r.method]})` : ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </section>
          </div>

          <ChangePassword />
        </>}
      </main>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const { msg, run } = useMessage();
  const save = () => run(async () => {
    await api('/student/password', { method: 'PUT', body: { current, password } });
    setCurrent(''); setPassword('');
  }, 'Password changed.');
  return (
    <section className="card">
      <div className="sec-title" style={{ marginTop: 0 }}>Change password</div>
      <Alert msg={msg} />
      <form className="toolbar" onSubmit={e => { e.preventDefault(); save(); }}>
        <input type="password" autoComplete="current-password" required placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} />
        <input type="password" autoComplete="new-password" minLength={8} required placeholder="New password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} />
        <button className="btn btn-primary"><IconLabel icon="lock">Change password</IconLabel></button>
      </form>
    </section>
  );
}
