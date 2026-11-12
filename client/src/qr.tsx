// Student QR cards: a backup for check-in when the camera doesn't recognize the face.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Draws a QR code for `value` as an image. */
export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''));
  }, [value, size]);
  return src ? <img className="qr-img" src={src} width={size} height={size} alt="QR code" /> : <div className="qr-img" style={{ width: size, height: size }} />;
}

export interface QrCardData {
  student_id: number; student_no: string; first_name: string; last_name: string;
  course: string | null; year_level: string | null; section_name: string | null; qr_token: string;
}

/** One printable card: school, name, section and the code. */
export function QrCard({ s }: { s: QrCardData }) {
  return (
    <div className="qr-card">
      <div className="qr-card-head"><img src="/fbc_logo.png" alt="" /><span>FBC Attendance</span></div>
      <QrImage value={s.qr_token} size={150} />
      <div className="qr-card-name">{s.first_name} {s.last_name}</div>
      <div className="qr-card-sub">{s.student_no}</div>
      <div className="qr-card-sub">{[s.course, s.year_level, s.section_name].filter(Boolean).join(' · ')}</div>
    </div>
  );
}
