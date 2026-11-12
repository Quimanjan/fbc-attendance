import { useState, type FormEvent } from 'react';
import { api, time12 } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { AddPanel, Empty, IconLabel } from '../ui';
import type { Teacher } from './Teachers';

interface Data {
  classes: { class_id: number; class_name: string; subject: string | null; teacher_name: string | null }[];
  sections: { section_id: number; section_name: string; class_id: number | null; class_name: string | null }[];
  schedules: { schedule_id: number; class_name: string; subject: string | null; section_name: string | null;
               day_of_week: string; time_start: string; time_end: string; room: string | null }[];
}
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Classes, each with its sections underneath. Students are placed in sections. */
export function ClassesTab() {
  const { data, reload } = useApi<Data>('/classes');
  const { data: teachers } = useApi<Teacher[]>('/teachers');
  const { msg, run } = useMessage();
  const [cls, setCls] = useState({ class_name: '', subject: '', teacher_id: '' });

  const addClass = (close: () => void) => async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api('/classes', { body: cls }), 'Class added. Now add its sections.')) {
      setCls({ class_name: '', subject: '', teacher_id: '' }); reload(); close();
    }
  };
  const addSection = (classId: number | null, name: string) =>
    run(async () => { await api('/sections', { body: { section_name: name, class_id: classId ?? '' } }); reload(); }, `Section "${name}" added.`);
  const del = (what: string, label: string, path: string) => {
    if (confirm(`Remove the ${what} "${label}"?`)) run(async () => { await api(path, { method: 'DELETE' }); reload(); }, `The ${what} was removed.`);
  };

  const loose = data?.sections.filter(s => !s.class_id) ?? [];
  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar">
        <AddPanel label="Add class">{close => (
          <form onSubmit={addClass(close)}>
            <div className="form-row">
              <div className="form-group"><label>Class name (e.g. Grade 10)</label><input required value={cls.class_name} onChange={e => setCls({ ...cls, class_name: e.target.value })} /></div>
              <div className="form-group"><label>Subject (optional)</label><input value={cls.subject} onChange={e => setCls({ ...cls, subject: e.target.value })} /></div>
              <div className="form-group"><label>Teacher (optional)</label>
                <select value={cls.teacher_id} onChange={e => setCls({ ...cls, teacher_id: e.target.value })}>
                  <option value="">No teacher yet</option>
                  {teachers?.map(t => <option key={t.teacher_id} value={t.teacher_id}>{`${t.last_name}, ${t.first_name}`}</option>)}
                </select></div>
            </div>
            <button className="btn btn-primary"><IconLabel icon="save">Save class</IconLabel></button>
          </form>
        )}</AddPanel>
      </div>

      {data && data.classes.length === 0 && loose.length === 0 && <Empty><p>No classes yet. Press <strong>Add class</strong> to create the first one.</p></Empty>}

      <div className="class-grid">
        {data?.classes.map(c => (
          <div className="card class-card" key={c.class_id}>
            <div className="class-head">
              <div>
                <h3>{c.class_name}</h3>
                <div className="muted">{[c.subject, c.teacher_name && `Teacher: ${c.teacher_name}`].filter(Boolean).join(' · ') || 'No subject or teacher set'}</div>
              </div>
              <button className="btn btn-ghost-danger btn-sm" title="Remove this class" onClick={() => del('class', c.class_name, `/classes/${c.class_id}`)}><IconLabel icon="trash">Remove</IconLabel></button>
            </div>
            <SectionList sections={data.sections.filter(s => s.class_id === c.class_id)}
                         onAdd={name => addSection(c.class_id, name)}
                         onRemove={s => del('section', s.section_name, `/sections/${s.section_id}`)} />
          </div>
        ))}
        {loose.length > 0 && (
          <div className="card class-card">
            <div className="class-head"><div><h3>Sections without a class</h3></div></div>
            <SectionList sections={loose} onAdd={name => addSection(null, name)}
                         onRemove={s => del('section', s.section_name, `/sections/${s.section_id}`)} />
          </div>
        )}
      </div>
    </>
  );
}

function SectionList({ sections, onAdd, onRemove }: {
  sections: Data['sections']; onAdd: (name: string) => Promise<boolean>; onRemove: (s: Data['sections'][number]) => void;
}) {
  const [name, setName] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); if (name.trim() && await onAdd(name.trim())) setName(''); };
  return (
    <>
      <div className="section-label">Sections</div>
      <div className="chips">
        {sections.length ? sections.map(s => (
          <span className="chip" key={s.section_id}>{s.section_name}
            <button title={`Remove section ${s.section_name}`} onClick={() => onRemove(s)}>×</button></span>
        )) : <span className="muted">No sections yet. Add one below.</span>}
      </div>
      <form className="inline-add" onSubmit={submit}>
        <input placeholder="New section name, e.g. Faith" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-outline btn-sm" disabled={!name.trim()}><IconLabel icon="plus">Add section</IconLabel></button>
      </form>
    </>
  );
}

/** When each section has class. The first class of the day decides who is Late. */
export function SchedulesTab() {
  const { data, reload } = useApi<Data>('/classes');
  const { msg, run } = useMessage();
  const EMPTY = { class_id: '', section_id: '', day_of_week: '', time_start: '', time_end: '', room: '' };
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const add = (close: () => void) => async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api('/schedules', { body: f }), 'Class time added.')) { setF(EMPTY); reload(); close(); }
  };
  const del = (id: number) => {
    if (confirm('Remove this class time?')) run(async () => { await api(`/schedules/${id}`, { method: 'DELETE' }); reload(); }, 'Class time removed.');
  };

  if (data && data.classes.length === 0) return <Empty><p>Add a class and its sections first, then come back to set class times.</p></Empty>;

  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar">
        <AddPanel label="Add class time">{close => (
          <form onSubmit={add(close)}>
            <div className="form-row">
              <div className="form-group"><label>Class</label>
                <select required value={f.class_id} onChange={set('class_id')}>
                  <option value="">Select a class…</option>
                  {data?.classes.map(c => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
                </select></div>
              <div className="form-group"><label>Section</label>
                <select required value={f.section_id} onChange={set('section_id')}>
                  <option value="">Select a section…</option>
                  {data?.sections.filter(s => !f.class_id || String(s.class_id) === f.class_id || !s.class_id)
                    .map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
                </select></div>
              <div className="form-group"><label>Day</label>
                <select required value={f.day_of_week} onChange={set('day_of_week')}>
                  <option value="">Select a day…</option>{DAYS.map(d => <option key={d}>{d}</option>)}
                </select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Starts</label><input type="time" required value={f.time_start} onChange={set('time_start')} /></div>
              <div className="form-group"><label>Ends</label><input type="time" required value={f.time_end} onChange={set('time_end')} /></div>
              <div className="form-group"><label>Room (optional)</label><input value={f.room} onChange={set('room')} /></div>
            </div>
            <button className="btn btn-primary"><IconLabel icon="save">Save class time</IconLabel></button>
          </form>
        )}</AddPanel>
      </div>

      {data && data.schedules.length === 0 ? (
        <Empty><p>No class times yet. Without them, check-ins after the default start time count as Late.</p></Empty>
      ) : (
        <div className="card" style={{ padding: '8px 16px' }}>
          <table>
            <thead><tr><th>Day</th><th>Time</th><th>Class</th><th>Section</th><th>Room</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>{data?.schedules.map(s => (
              <tr key={s.schedule_id}>
                <td><strong>{s.day_of_week}</strong></td><td>{time12(s.time_start)} – {time12(s.time_end)}</td>
                <td>{s.class_name}{s.subject ? <div className="muted">{s.subject}</div> : null}</td>
                <td>{s.section_name || <span className="muted">Any</span>}</td><td>{s.room || <span className="muted">None</span>}</td>
                <td><div className="row-actions"><button className="btn btn-ghost-danger btn-sm" onClick={() => del(s.schedule_id)}><IconLabel icon="trash">Remove</IconLabel></button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
