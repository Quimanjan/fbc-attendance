import { useState, type FormEvent } from 'react';
import { useApi } from '../hooks';
import type { Student } from '../api';
import { IconLabel } from '../ui';

export type StudentInput = Pick<Student, 'student_no' | 'first_name' | 'middle_name' | 'last_name' | 'course' | 'year_level' | 'gender' | 'section_id' | 'parent_email'>;

export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

const EMPTY: StudentInput = { student_no: '', first_name: '', middle_name: '', last_name: '', course: '', year_level: '', gender: 'Male', section_id: null, parent_email: '' };

export function StudentForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: Partial<StudentInput>; submitLabel: string; onSubmit: (s: StudentInput) => Promise<boolean>; onCancel?: () => void;
}) {
  const { data } = useApi<{ sections: { section_id: number; section_name: string }[] }>('/classes');
  const [f, setF] = useState<StudentInput>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof StudentInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onSubmit(f);
    setBusy(false);
    if (ok && !initial) setF(EMPTY);
  };
  // Keep a year level from older data visible even if it isn't one of the standard choices.
  const years = f.year_level && !YEAR_LEVELS.includes(f.year_level) ? [...YEAR_LEVELS, f.year_level] : YEAR_LEVELS;
  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="form-group"><label>Student ID</label><input required value={f.student_no} onChange={set('student_no')} /></div>
        <div className="form-group"><label>First name</label><input required value={f.first_name} onChange={set('first_name')} /></div>
        <div className="form-group"><label>Middle name</label><input value={f.middle_name ?? ''} onChange={set('middle_name')} /></div>
        <div className="form-group"><label>Last name</label><input required value={f.last_name} onChange={set('last_name')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Course</label><input required value={f.course ?? ''} onChange={set('course')} placeholder="e.g. BSIT" /></div>
        <div className="form-group"><label>Year level</label>
          <select required value={f.year_level ?? ''} onChange={set('year_level')}>
            <option value="">Select year level…</option>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Gender</label>
          <select value={f.gender ?? 'Male'} onChange={set('gender')}><option>Male</option><option>Female</option></select>
        </div>
        <div className="form-group"><label>Section</label>
          <select value={f.section_id ?? 0} onChange={e => setF({ ...f, section_id: Number(e.target.value) || null })}>
            <option value={0}>No section yet</option>
            {data?.sections.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Parent email (gets late/absent emails)</label><input type="email" value={f.parent_email ?? ''} onChange={set('parent_email')} /></div>
      </div>
      <div className="form-actions">
        {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}><IconLabel icon="save">{busy ? 'Saving…' : submitLabel}</IconLabel></button>
      </div>
    </form>
  );
}
