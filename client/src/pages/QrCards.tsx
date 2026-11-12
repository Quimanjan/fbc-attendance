import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks';
import { QrCard, type QrCardData } from '../qr';
import { Empty, IconLabel } from '../ui';

/** Every student's QR card, ready to print and cut out. */
export default function QrCards() {
  const { data: sections } = useApi<{ section_id: number; section_name: string }[]>('/sections');
  const [section, setSection] = useState('');
  const { data: cards } = useApi<QrCardData[]>('/qr-cards' + (section ? `?section_id=${section}` : ''));
  return (
    <>
      <div className="toolbar no-print">
        <Link to="/students" className="btn btn-outline"><IconLabel icon="back">Students</IconLabel></Link>
        <select value={section} onChange={e => setSection(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All sections</option>
          {sections?.map(s => <option key={s.section_id} value={s.section_id}>{s.section_name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!cards?.length}><IconLabel icon="save">Print cards</IconLabel></button>
      </div>
      <p className="page-hint no-print">Students show their card to the check-in camera when their face isn't recognized.
        Anyone holding a card can use it, so keep the camera where staff can see it. Lost a card? Make a new code from the student's QR button.</p>
      {cards && cards.length === 0 ? <Empty><p>No students in this section.</p></Empty> : (
        <div className="qr-sheet">{cards?.map(s => <QrCard key={s.student_id} s={s} />)}</div>
      )}
    </>
  );
}
