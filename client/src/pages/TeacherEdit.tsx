import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { IconLabel } from '../ui';
import { TeacherForm, type Teacher } from './Teachers';

export default function TeacherEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: t, error, reload } = useApi<Teacher>(`/teachers/${id}`);
  const { msg, run } = useMessage();
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!t) return null;
  const save = (f: object) => run(async () => { await api(`/teachers/${id}`, { method: 'PUT', body: f }); navigate('/setup?tab=teachers'); });
  return (
    <>
      <Alert msg={msg} />
      <div className="sec-title">Edit Teacher</div>
      <div className="card">
        <TeacherForm initial={{ first_name: t.first_name, last_name: t.last_name, email: t.email, department: t.department ?? '' }}
                     submitLabel="Save changes" onSubmit={save} />
        <div style={{ marginTop: 12 }}><Link to="/setup?tab=teachers" className="btn btn-outline btn-sm"><IconLabel icon="back">Back to teachers</IconLabel></Link></div>
      </div>
      <Account t={t} onChange={reload} />
    </>
  );
}

/** The teacher's own sign-in: their email and a password the admin sets here. */
function Account({ t, onChange }: { t: Teacher; onChange: () => void }) {
  const [password, setPassword] = useState('');
  const { msg, run } = useMessage();
  const save = () => run(async () => {
    await api(`/teachers/${t.teacher_id}/account`, { method: 'PUT', body: { password } });
    setPassword(''); onChange();
  }, `${t.first_name} can now sign in with ${t.email} and this password.`);
  const remove = () => run(async () => {
    await api(`/teachers/${t.teacher_id}/account`, { method: 'DELETE' }); onChange();
  }, 'Password removed.');
  return (
    <>
      <div className="sec-title">Sign-in account</div>
      <div className="card">
        <Alert msg={msg} />
        <p className="muted" style={{ marginTop: 0 }}>
          {t.has_account ? <>This teacher signs in with <strong>{t.email}</strong> and their password. </> : <>This teacher has no password yet. </>}
          They can also use Google if {t.email} is a Google account. Signed in, they can mark their own classes by hand.
        </p>
        <form className="toolbar" onSubmit={e => { e.preventDefault(); save(); }}>
          <input type="password" autoComplete="new-password" minLength={8} required placeholder={t.has_account ? 'New password (8+ characters)' : 'Password (8+ characters)'}
                 value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-primary">{t.has_account ? 'Change password' : 'Give account'}</button>
          {!!t.has_account && <button type="button" className="btn btn-outline" onClick={remove}>Remove password</button>}
        </form>
      </div>
    </>
  );
}
