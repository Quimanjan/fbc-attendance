import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { AddPanel, Empty, IconLabel } from '../ui';

export interface Teacher { teacher_id: number; first_name: string; last_name: string; email: string; department: string | null; has_account?: number }
const EMPTY = { first_name: '', last_name: '', email: '', department: '' };

export function TeacherForm({ initial, submitLabel, onSubmit }: {
  initial?: typeof EMPTY; submitLabel: string; onSubmit: (t: typeof EMPTY) => Promise<boolean>;
}) {
  const [f, setF] = useState(initial ?? EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); if (await onSubmit(f) && !initial) setF(EMPTY); };
  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="form-group"><label>First Name</label><input required value={f.first_name} onChange={set('first_name')} /></div>
        <div className="form-group"><label>Last Name</label><input required value={f.last_name} onChange={set('last_name')} /></div>
        <div className="form-group"><label>School email (used to sign in)</label><input type="email" required value={f.email} onChange={set('email')} /></div>
        <div className="form-group"><label>Department</label><input value={f.department ?? ''} onChange={set('department')} /></div>
      </div>
      <button type="submit" className="btn btn-primary"><IconLabel icon="save">{submitLabel}</IconLabel></button>
    </form>
  );
}

export default function Teachers() {
  const { data: teachers, reload } = useApi<Teacher[]>('/teachers');
  const { msg, run } = useMessage();
  const add = (t: object) => run(async () => { await api('/teachers', { body: t }); reload(); }, 'Teacher added.');
  const remove = (t: Teacher) => {
    if (confirm(`Remove ${t.first_name} ${t.last_name}? Their classes will have no teacher.`))
      run(async () => { await api(`/teachers/${t.teacher_id}`, { method: 'DELETE' }); reload(); }, 'Teacher removed.');
  };
  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar">
        <AddPanel label="Add teacher">{close => <TeacherForm submitLabel="Save teacher" onSubmit={async f => { const ok = await add(f); if (ok) close(); return ok; }} />}</AddPanel>
      </div>
      {teachers && teachers.length === 0 ? <Empty><p>No teachers yet. Press <strong>Add teacher</strong> to add one.</p></Empty> : (
        <div className="card" style={{ padding: '8px 16px' }}>
          <table>
            <thead><tr><th>Teacher</th><th>Email</th><th>Department</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {teachers?.map(t => (
                <tr key={t.teacher_id}>
                  <td><strong>{`${t.last_name}, ${t.first_name}`}</strong></td><td>{t.email}</td><td>{t.department || <span className="muted">None</span>}</td>
                  <td><div className="row-actions">
                    <Link to={`/teachers/${t.teacher_id}/edit`} className="btn btn-outline btn-sm"><IconLabel icon="edit">Edit</IconLabel></Link>
                    <button className="btn btn-ghost-danger btn-sm" onClick={() => remove(t)}><IconLabel icon="trash">Remove</IconLabel></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
