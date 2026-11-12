import { useState } from 'react';
import { todayStr } from '../api';
import { useApi } from '../hooks';

interface Report {
  month: string;
  rows: { student_id: number; student_no: string; student_name: string; section_name: string | null;
          present_count: number; absent_count: number; late_count: number; excused_count: number; total: number }[];
  totals: { present_count: number | null; absent_count: number | null; late_count: number | null; excused_count: number | null };
}

export default function Reports() {
  const { data: sections } = useApi<{ section_id: number; section_name: string }[]>('/sections');
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [sectionId, setSectionId] = useState(0);
  const { data } = useApi<Report>(month ? `/reports?month=${month}&section_id=${sectionId}` : null);
  const t = data?.totals;
  return (
    <>
            <div className="card">
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group"><label>Month</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} /></div>
          <div className="form-group"><label>Section</label>
            <select value={sectionId} onChange={e => setSectionId(Number(e.target.value))}>
              <option value={0}>All Sections</option>
              {sections?.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
            </select></div>
        </div>
      </div>
      {t && <div className="stats-grid">
        {([['Present', t.present_count, '#86efac'], ['Absent', t.absent_count, '#fca5a5'], ['Late', t.late_count, '#fcd34d'], ['Excused', t.excused_count, '#93c5fd']] as const)
          .map(([label, n, color]) => <div className="stat-card" key={label}><div className="stat-num" style={{ color }}>{Number(n ?? 0)}</div><div className="stat-label">{label}</div></div>)}
      </div>}
      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <table>
          <thead><tr><th>#</th><th>Student No</th><th>Name</th><th>Section</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Days recorded</th></tr></thead>
          <tbody>{data?.rows.length ? data.rows.map((r, i) => (
            <tr key={r.student_id}><td>{i + 1}</td><td>{r.student_no}</td><td>{r.student_name}</td><td>{r.section_name}</td>
              <td>{r.present_count}</td><td>{r.absent_count}</td><td>{r.late_count}</td><td>{r.excused_count}</td><td>{r.total}</td></tr>
          )) : <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No records for this month.</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
