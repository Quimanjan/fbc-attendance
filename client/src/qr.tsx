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

const loadImage = (src: string) => new Promise<HTMLImageElement | null>(ok => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = src;
});

/** Saves the student's card as a PNG picture (for their phone, or to print). */
export async function downloadQrCard(s: QrCardData) {
  const W = 600, H = 820;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  // Maroon band with the school name.
  g.fillStyle = '#7a1016'; g.fillRect(0, 0, W, 110);
  const logo = await loadImage('/fbc_logo.png');
  if (logo) g.drawImage(logo, 34, 23, 64, 64);
  g.fillStyle = '#f2c14e'; g.font = 'bold 26px system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText('FBC ATTENDANCE', logo ? 118 : 34, 46);
  g.fillStyle = '#fff4ec'; g.font = '18px system-ui, sans-serif';
  g.fillText('Student check-in QR code', logo ? 118 : 34, 76);
  // The code itself.
  const qr = await loadImage(await QRCode.toDataURL(s.qr_token, { width: 440, margin: 1, errorCorrectionLevel: 'M' }));
  if (qr) g.drawImage(qr, (W - 440) / 2, 140, 440, 440);
  g.fillStyle = '#18181b'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = 'bold 32px system-ui, sans-serif'; g.fillText(`${s.first_name} ${s.last_name}`, W / 2, 640, W - 40);
  g.fillStyle = '#52525b'; g.font = '22px system-ui, sans-serif';
  g.fillText(s.student_no, W / 2, 680, W - 40);
  g.fillText([s.course, s.year_level, s.section_name].filter(Boolean).join(' \u00b7 '), W / 2, 716, W - 40);
  g.fillStyle = '#a1a1aa'; g.font = '16px system-ui, sans-serif';
  g.fillText('Show this to the check-in camera if your face is not recognized.', W / 2, 780, W - 40);
  const blob = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/png'));
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `FBC-QR-${s.student_no.replace(/[^\w-]+/g, '_')}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
