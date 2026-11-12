import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, longDate, STATUSES, time12, todayStr } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { Empty, IconLabel } from '../ui';

interface Sheet {
  date: string; day: string;
  students: { student_id: number; student_no: string; first_name: string; last_name: string;
              status: string | null; time_in: string | null; method: string | null; absences: number }[];
  schedules: { schedule_id: number; subject: string | null; class_name: string; time_start: string; time_end: string; room: string | null }[];
}

/** Mark a whole section by hand. Picking a section shows its students straight away. */
export default function RecordAttendance() {
  const { data: sections } = useApi<{ section_id: number; section_name: string; class_name: string | null }[]>('/sections');
  const [sectionId, setSectionId] = useState(0);
  const [date, setDate] = useState(todayStr());
  const { data: sheet, reload } = useApi<Sheet>(sectionId && date ? `/attendance/sheet?section_id=${sectionId}&date=${date}` : null);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const { msg, setMsg, run } = useMessage();

  useEffect(() => {
    if (sheet) { setStatuses(Object.fromEntries(sheet.students.map(s => [s.student_id, s.status ?? 'Present']))); setDirty(false); }
  }, [sheet]);
  useEffect(() => { setMsg(null); }, [sectionId, date]);

  const setOne = (id: number, st: string) => { setStatuses({ ...statuses, [id]: st }); setDirty(true); };
  const setAll = (st: string) => { setStatuses(Object.fromEntries(Object.keys(statuses).map(id => [id, st]))); setDirty(true); };
  const save = async () => {
    if (await run(() => api('/attendance/sheet', { body: { date: sheet!.date, statuses } }),
                  `Saved. Attendance for ${longDate(sheet!.date)} is recorded.`)) reload();
  };

  if (sections && sections.length === 0) return (
    <Empty>
      <p>There are no sections yet. Create a class and a section first, then add students to it.</p>
      <Link to="/setup?tab=classes" className="btn btn-primary"><IconLabel icon="arrow">Go to School Setup</IconLabel></Link>
    </Empty>
  );

  return (
    <>
      <Alert msg={msg} />
      <div className="card">
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group"><label>1. Choose a section</label>
            <select value={sectionId} onChange={e => setSectionId(Number(e.target.value))}>
              <option value={0}>Select a section…</option>
              {sections?.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}{s.class_name ? ` (${s.class_name})` : ''}</option>)}
            </select></div>
          <div className="form-group"><label>2. Date</label><input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} required /></div>
        </div>
      </div>

      {!sectionId && <p className="page-hint">Pick a section above and its students will appear here.</p>}

      {sheet && (sheet.students.length === 0 ? (
        <Empty>
          <p>No students are in this section yet.</p>
          <Link to="/students" className="btn btn-primary"><IconLabel icon="plus">Add students</IconLabel></Link>
        </Empty>
      ) : (
        <div className="card">
          <div className="sheet-head">
            <div>
              <strong>3. Mark each student</strong>
              <div className="muted">
                {longDate(sheet.date, { weekday: 'long', month: 'long', day: 'numeric' })}
                {sheet.schedules.length > 0 && <> · First class {time12(sheet.schedules[0].time_start)}</>}
                {' '}· Everyone starts as Present. Students who used face check-in show their time.
              </div>
            </div>
            <div className="sheet-tools">
              <button className="btn btn-outline btn-sm" onClick={() => setAll('Present')}><IconLabel icon="check">Everyone present</IconLabel></button>
            </div>
          </div>
          <table>
            <thead><tr><th>Student</th><th>Absences so far</th><th>Status today</th></tr></thead>
            <tbody>{sheet.students.map(s => (
              <tr key={s.student_id}>
                <td><strong>{`${s.last_name}, ${s.first_name}`}</strong><div className="muted">{s.student_no}</div></td>
                <td>{s.absences >= 3 ? <span className="badge badge-absent" title="Parents get a warning email at 3 absences">{s.absences} absences</span>
                     : s.absences > 0 ? <span className="badge badge-absent">{s.absences}</span> : <span className="muted">0</span>}</td>
                <td>
                  <div className="status-group">
                    {STATUSES.map(st => {
                      const uid = `st_${s.student_id}_${st}`;
                      return <span key={st}>
                        <input type="radio" id={uid} name={`status_${s.student_id}`} value={st}
                               checked={statuses[s.student_id] === st} onChange={() => setOne(s.student_id, st)} />
                        <label className={`status-btn ${st.toLowerCase()}-btn`} htmlFor={uid}>{st}</label>
                      </span>;
                    })}
                  </div>
                  {(s.time_in || (s.method && s.method !== 'manual')) &&
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {s.method === 'auto' ? 'Marked absent automatically (no check-in)' : `Checked in at ${time12(s.time_in)}${s.method === 'qr' ? ' with QR code' : ''}`}
                    </div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div className="save-bar">
            <span className="muted">{dirty || sheet.students.some(s => !s.status) ? 'Not saved yet. Press Save when you are done.' : 'Saved. Change a status and save again to update it.'}</span>
            <button className="btn btn-primary" onClick={save}><IconLabel icon="save">4. Save attendance</IconLabel></button>
          </div>
        </div>
      ))}
    </>
  );
}
