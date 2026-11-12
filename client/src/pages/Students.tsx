import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Student } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { Icon } from '../icons';
import { Empty, IconLabel, Modal } from '../ui';
import { QrImage } from '../qr';
import { StudentWizard } from './StudentWizard';

export default function Students() {
  const { data: students, reload } = useApi<Student[]>('/students');
  const { msg, run } = useMessage();
  const [q, setQ] = useState('');

  // Pop-up state: 'new' to add a student, or a student id to finish their face registration.
  const [wizard, setWizard] = useState<'new' | number | null>(null);
  const [qrFor, setQrFor] = useState<Student | null>(null);
  const closeQr = useCallback(() => setQrFor(null), []);
  const closeWizard = useCallback(() => setWizard(null), []);
  const remove = (s: Student) => {
    if (confirm(`Remove ${s.first_name} ${s.last_name}? Their attendance history and face data are deleted too.`))
      run(async () => { await api(`/students/${s.student_id}`, { method: 'DELETE' }); reload(); }, 'Student removed.');
  };

  const needle = q.trim().toLowerCase();
  const shown = students?.filter(s => !needle ||
    `${s.first_name} ${s.last_name} ${s.student_no} ${s.year_level ?? ''} ${s.section_name ?? ''}`.toLowerCase().includes(needle));
  const registered = students?.filter(s => s.face_samples > 0).length ?? 0;

  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar">
        <button className="btn btn-primary add-btn" onClick={() => setWizard('new')}><IconLabel icon="plus">Add student</IconLabel></button>
        <label className="search">
          <Icon name="search" />
          <input placeholder="Search by name, ID, year or section" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <Link to="/students/qr-cards" className="btn btn-outline" title="Print a QR card for every student, for when the camera doesn't recognize a face">
          <IconLabel icon="list">Print QR cards</IconLabel></Link>
      </div>

      {students && students.length > 0 &&
        <p className="page-hint">{registered} of {students.length} students can use face check-in. The rest are marked by hand.</p>}

      {students && students.length === 0 ? (
        <Empty><p>No students yet. Press <strong>Add student</strong> to add the first one.</p></Empty>
      ) : (
        <div className="card" style={{ padding: '8px 16px' }}>
          <table>
            <thead><tr><th>Student</th><th>Year &amp; section</th><th>Parent email</th><th>Face check-in</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {shown?.length ? shown.map(s => (
                <tr key={s.student_id}>
                  <td><strong>{`${s.last_name}, ${s.first_name}`}</strong><div className="muted">{s.student_no}{s.course ? ` · ${s.course}` : ''}</div></td>
                  <td>{s.year_level ?? <span className="muted">No year level</span>}<div className="muted">{s.section_name ?? 'No section'}</div></td>
                  <td>{s.parent_email || <span className="muted">None</span>}</td>
                  <td>
                    {s.face_samples > 0 ? <span className="badge badge-present">Ready</span>
                      : s.face_consent_at ? <span className="badge badge-late">Consent only</span>
                      : <span className="badge badge-muted">Not set up</span>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {s.face_samples > 0
                        ? <Link to={`/students/${s.student_id}/face`} className="btn btn-outline btn-sm" title="Capture again or delete face data">
                            <IconLabel icon="face">Face</IconLabel></Link>
                        : <button className="btn btn-primary btn-sm" onClick={() => setWizard(s.student_id)} title="Record consent and capture the student's face for check-in">
                            <IconLabel icon="face">Register face</IconLabel></button>}
                      <button className="btn btn-outline btn-sm" onClick={() => setQrFor(s)} title="Show this student's QR code for check-in">QR</button>
                      <Link to={`/students/${s.student_id}/edit`} className="btn btn-outline btn-sm" title="Change name, section or parent email">
                        <IconLabel icon="edit">Edit</IconLabel>
                      </Link>
                      <button className="btn btn-ghost-danger btn-sm" onClick={() => remove(s)} title="Remove this student">
                        <IconLabel icon="trash">Remove</IconLabel>
                      </button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>{students ? 'No students match your search.' : 'Loading…'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {qrFor && <QrModal student={qrFor} onClose={closeQr} />}
      {wizard !== null && <StudentWizard key={String(wizard)} studentId={wizard === 'new' ? undefined : wizard} onClose={closeWizard} onChanged={reload} />}
    </>
  );
}

/** A student's QR code, with a way to replace it when the card is lost. */
function QrModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const [token, setToken] = useState('');
  const { msg, run } = useMessage();
  useEffect(() => { api<{ token: string }>(`/students/${student.student_id}/qr`).then(r => setToken(r.token)).catch(() => {}); }, [student.student_id]);
  const renew = () => {
    if (confirm('Make a new QR code? The old card stops working.'))
      run(async () => setToken((await api<{ token: string }>(`/students/${student.student_id}/qr`, { method: 'POST' })).token), 'New code made. Print a new card.');
  };
  return (
    <Modal title={`${student.first_name} ${student.last_name}`} subtitle={`${student.student_no} · QR code for check-in`} onClose={onClose}>
      <Alert msg={msg} />
      <div className="qr-modal">
        {token ? <QrImage value={token} size={240} /> : <div className="qr-img" style={{ width: 240, height: 240 }} />}
        <p className="muted">If the camera doesn't recognize {student.first_name}'s face, they hold this code up to it to check in.
          Print it from <Link to="/students/qr-cards">Print QR cards</Link>, or let them keep a photo of it on their phone.</p>
        <button className="btn btn-outline btn-sm" onClick={renew}><IconLabel icon="x">Lost card: make a new code</IconLabel></button>
      </div>
    </Modal>
  );
}
