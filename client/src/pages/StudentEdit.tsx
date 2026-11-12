import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Student } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { IconLabel } from '../ui';
import { StudentForm } from './StudentForm';

export default function StudentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: s, error } = useApi<Student>(`/students/${id}`);
  const { msg, run } = useMessage();
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!s) return null;
  const save = (f: object) => run(async () => { await api(`/students/${id}`, { method: 'PUT', body: f }); navigate('/students'); });
  return (
    <>
      <Alert msg={msg} />
      <div className="sec-title">Edit Student</div>
      <div className="card">
        <StudentForm initial={s} submitLabel="Save changes" onSubmit={save} />
        <div style={{ marginTop: 12 }}><Link to="/students" className="btn btn-outline btn-sm"><IconLabel icon="back">Back to students</IconLabel></Link></div>
      </div>
      <StudentAccount s={s} />
    </>
  );
}

/** The student's own sign-in (student ID + a password set here), for their profile page and QR code download. */
function StudentAccount({ s }: { s: Student }) {
  const { data, reload } = useApi<{ has_account: boolean }>(`/students/${s.student_id}/account`);
  const [password, setPassword] = useState('');
  const { msg, run } = useMessage();
  const save = () => run(async () => {
    await api(`/students/${s.student_id}/account`, { method: 'PUT', body: { password } });
    setPassword(''); reload();
  }, `${s.first_name} can now sign in as a student with ID ${s.student_no} and this password.`);
  const remove = () => run(async () => {
    await api(`/students/${s.student_id}/account`, { method: 'DELETE' }); reload();
  }, 'Password removed. The student can no longer sign in.');
  const has = !!data?.has_account;
  return (
    <>
      <div className="sec-title">Student sign-in</div>
      <div className="card">
        <Alert msg={msg} />
        <p className="muted" style={{ marginTop: 0 }}>
          {has ? <>This student signs in with ID <strong>{s.student_no}</strong> and their password. </> : <>This student has no password yet. </>}
          Signed in (Sign in &rarr; Student), they see their own attendance and can download their QR code. They can change the password themselves.
        </p>
        <form className="toolbar" onSubmit={e => { e.preventDefault(); save(); }}>
          <input type="password" autoComplete="new-password" minLength={8} required placeholder={has ? 'New password (8+ characters)' : 'Password (8+ characters)'}
                 value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-primary">{has ? 'Change password' : 'Give sign-in'}</button>
          {has && <button type="button" className="btn btn-outline" onClick={remove}>Remove password</button>}
        </form>
      </div>
    </>
  );
}
