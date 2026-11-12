import { useState } from 'react';
import { api, BADGE, longDate, time12 } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { IconLabel } from '../ui';

interface DateRow { date: string; present_count: number; absent_count: number; late_count: number; excused_count: number; total: number }
interface Day {
  date: string; day: string;
  sections: { section_name: string; schedules: { schedule_id: number; subject: string | null; time_start: string; time_end: string }[];
              rows: { attendance_id: number; student_no: string; student_name: string; status: string; time_in: string | null; method: string }[] }[];
}

const PILL: Record<string, [string, string]> = {
  Present: ['#dcfce7', '#166534'], Absent: ['#fee2e2', '#991b1b'], Late: ['#fef3c7', '#92400e'], Excused: ['#dbeafe', '#1e40af'],
};
const METHOD: Record<string, string> = { face: '· Face', auto: '· Auto', manual: '' };

export default function ViewRecords() {
  const { data: dates, reload: reloadDates } = useApi<DateRow[]>('/attendance/dates');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: day, reload } = useApi<Day>(selected ? `/attendance/day/${selected}` : null);
  const { msg, run } = useMessage();

  const remove = (id: number) => {
    if (confirm('Remove this attendance entry? To change a status instead, use Take Attendance > Mark by hand.')) run(async () => { await api(`/attendance/${id}`, { method: 'DELETE' }); reload(); reloadDates(); });
  };

  if (selected && day) return (
    <>
      <Alert msg={msg} />
      <div style={{ marginBottom: 16 }}><button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}><IconLabel icon="back">All days</IconLabel></button></div>
      <div className="sec-title">{longDate(day.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      {day.sections.length === 0 && <div className="alert alert-info">No records for this date.</div>}
      {day.sections.map(sec => {
        const counts: Record<string, number> = {};
        sec.rows.forEach(r => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
        return (
          <div className="card" key={sec.section_name} style={{ padding: 0 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{sec.section_name}</div>
              {sec.schedules.length > 0 && <div className="muted" style={{ marginBottom: 8 }}>
                {sec.schedules.map(s => `${s.subject ?? ''} ${time12(s.time_start)}-${time12(s.time_end)}`).join(' · ')}</div>}
              <div className="pills">
                {Object.entries(counts).map(([st, n]) => <span key={st} className="sum-pill" style={{ background: PILL[st][0], color: PILL[st][1] }}>{n} {st}</span>)}
                <span className="sum-pill" style={{ background: '#f4f4f5', color: '#52525b' }}>Total: {sec.rows.length}</span>
              </div>
            </div>
            <table>
              <thead><tr><th>#</th><th>Student No</th><th>Name</th><th>Status</th><th>Time In</th><th>Action</th></tr></thead>
              <tbody>{sec.rows.map((r, i) => (
                <tr key={r.attendance_id}>
                  <td>{i + 1}</td><td>{r.student_no}</td><td>{r.student_name}</td>
                  <td><span className={`badge ${BADGE[r.status]}`}>{r.status}</span></td>
                  <td className="muted">{r.time_in ? time12(r.time_in) : '—'} {METHOD[r.method] ?? ''}</td>
                  <td><button className="btn btn-ghost-danger btn-sm" onClick={() => remove(r.attendance_id)} title="Delete this attendance entry"><IconLabel icon="trash">Remove</IconLabel></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
    </>
  );

  return (
    <>
      <Alert msg={msg} />
            <div className="card" style={{ padding: 0 }}>
        {dates?.length ? dates.map(d => (
          <a key={d.date} className="date-row" href="#" onClick={e => { e.preventDefault(); setSelected(d.date); }}>
            <div>
              <div style={{ fontWeight: 600 }}>{longDate(d.date, { weekday: 'long' })}</div>
              <div className="muted">{longDate(d.date)}</div>
            </div>
            <div className="pills">
              <span className="sum-pill" style={{ background: '#dcfce7', color: '#166534' }}>✓ {d.present_count} Present</span>
              <span className="sum-pill" style={{ background: '#fee2e2', color: '#991b1b' }}>{d.absent_count} Absent</span>
              <span className="sum-pill" style={{ background: '#fef3c7', color: '#92400e' }}>{d.late_count} Late</span>
              <span className="sum-pill" style={{ background: '#dbeafe', color: '#1e40af' }}>{d.excused_count} Excused</span>
            </div>
          </a>
        )) : <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>{dates ? 'No attendance records yet.' : 'Loading…'}</div>}
      </div>
    </>
  );
}
