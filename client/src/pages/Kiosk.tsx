import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../api';
import { averageDescriptor, BlinkDetector, noFaceHint, quality, startCamera, type Detection } from '../faceKit';

/** The full-screen check-in camera shown on a kiosk device. Started from Take Attendance > Face check-in. */
// A recognized face held this long without a detected blink also checks in.
const STILL_MS = 5000;

export default function Kiosk() {
  return <KioskScreen />;
}

type Msg = { cls: string; big: string; small?: string };

function KioskScreen() {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState<Msg>({ cls: '', big: 'Starting camera…' });
  const [clock, setClock] = useState(new Date().toLocaleString());
  const [room, setRoom] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleString()), 1000);
    // Keep the kiosk session alive.
    const p = setInterval(() => api('/kiosk/ping', { method: 'POST' }).catch(() => {}), 5 * 60 * 1000);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  useEffect(() => {
    const blink = new BlinkDetector();
    let busy = false, pauseUntil = 0, lastHint = '', requireBlink = true, cooldownMs = 20000;
    // Holding still for STILL_MS also counts, for people whose blink the camera misses.
    let stillSince = 0, stillAt = { x: 0, y: 0 }, lastFaceAt = 0;
    const resetStill = () => { stillSince = 0; };
    api<{ requireBlink: boolean; room: string | null; cooldownSeconds?: number }>('/kiosk/settings')
      .then(s => { requireBlink = s.requireBlink; setRoom(s.room); if (s.cooldownSeconds != null) cooldownMs = s.cooldownSeconds * 1000; })
      .catch(() => {});
    const hint = (text: string) => { if (text !== lastHint) { lastHint = text; setMsg({ cls: '', big: text }); } };

    const onFrame = async (dets: Detection[]) => {
      if (busy || Date.now() < pauseUntil) return;
      const v = video.current!;
      // A face missed for a frame or two doesn't restart the count.
      if (dets.length === 0) { if (Date.now() - lastFaceAt > 700) { blink.reset(); resetStill(); hint(noFaceHint()); } return; }
      if (dets.length > 1) { blink.reset(); resetStill(); hint('One person at a time, please'); return; }
      const q = quality(dets[0], v);
      if (q) { blink.reset(); resetStill(); hint(q); return; }
      lastFaceAt = Date.now();
      if (requireBlink && !blink.update(dets[0].landmarks.positions)) {
        const box = dets[0].detection.box;
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (!stillSince || Math.hypot(c.x - stillAt.x, c.y - stillAt.y) > box.width * 0.15) { stillSince = Date.now(); stillAt = c; }
        const left = Math.ceil((STILL_MS - (Date.now() - stillSince)) / 1000);
        if (left > 0) { hint(`Blink, or stay still for ${left} s`); return; }
      }

      busy = true;
      setMsg({ cls: '', big: 'Checking…' });
      try {
        const embedding = await averageDescriptor(v, 2);
        if (!embedding) { setMsg({ cls: 'k-warn', big: 'Hold still and try again' }); return; }
        show(await api('/kiosk/checkin', { body: { embedding, live: requireBlink } }));
      } catch (e) {
        setMsg({ cls: 'k-warn', big: 'Something went wrong', small: (e as Error).message });
      } finally {
        blink.reset(); resetStill(); lastHint = '';
        pauseUntil = Date.now() + 3500;
        busy = false;
      }
    };

    const show = (res: any) => {
      const where = res.subject ? `${res.subject} · ` : '';
      if (res.result === 'ok') setMsg({ cls: res.status === 'Late' ? 'k-late' : 'k-ok', big: '✓ ' + res.name, small: `${where}${res.status} · ${res.time}` });
      else if (res.result === 'already') setMsg({ cls: 'k-ok', big: res.name, small: `${where}Already checked in at ${res.time} (${res.status})` });
      else if (res.result === 'wrong_class') setMsg({ cls: 'k-warn', big: res.name, small: `This room has ${res.subject} (${res.section}) now. Please go to your own class.` });
      else if (res.result === 'no_class') setMsg({ cls: 'k-warn', big: res.name, small: 'There is no class in this room right now.' });
      // Scanned again within the cooldown (20 s): nothing new was recorded.
      else if (res.result === 'cooldown') setMsg({ cls: 'k-ok', big: '✓ ' + res.name, small: `Already scanned. Next scan allowed in ${res.wait} s.` });
      else if (res.result === 'unknown_qr') setMsg({ cls: 'k-warn', big: 'QR code not valid', small: 'This card was replaced or is not from FBC. Please see your teacher.' });
      else setMsg({ cls: 'k-warn', big: 'Not recognized', small: 'Show your QR card to the camera, or see your teacher.' });
    };

    // QR cards: checked a few times a second, for students whose face isn't recognized.
    const qrCanvas = document.createElement('canvas');
    let lastCode = '', lastCodeAt = 0;
    const scanQr = async () => {
      const v = video.current;
      if (busy || Date.now() < pauseUntil || !v || v.readyState < 2 || !v.videoWidth) return;
      const w = Math.min(640, v.videoWidth), h = Math.round(w * v.videoHeight / v.videoWidth);
      qrCanvas.width = w; qrCanvas.height = h;
      const ctx = qrCanvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (!code?.data) return;
      // The same card held up, or shown again within the cooldown, counts once (the server also enforces this, for face and QR together).
      if (code.data === lastCode && Date.now() - lastCodeAt < cooldownMs) return;
      lastCode = code.data; lastCodeAt = Date.now();
      busy = true;
      setMsg({ cls: '', big: 'Checking QR code…' });
      try { show(await api('/kiosk/checkin-qr', { body: { token: code.data } })); }
      catch (e) { lastCode = ''; setMsg({ cls: 'k-warn', big: 'Something went wrong', small: (e as Error).message }); }
      finally { blink.reset(); resetStill(); lastHint = ''; pauseUntil = Date.now() + 3500; busy = false; }
    };
    const qrTimer = setInterval(() => { scanQr().catch(() => {}); }, 300);

    let stop: (() => void) | undefined;
    startCamera(video.current!, overlay.current, onFrame)
      .then(s => { stop = s; })
      .catch(err => setMsg({ cls: 'k-warn', big: 'Camera unavailable', small: String(err.message || err) }));
    return () => { stop?.(); clearInterval(qrTimer); };
  }, []);

  const exit = async () => {
    if (!confirm('Exit kiosk mode and go back to Take Attendance?')) return;
    const r = await api<{ signedIn: boolean }>('/kiosk/exit', { method: 'POST' }).catch(() => ({ signedIn: false }));
    window.location.href = r.signedIn ? '/attendance?tab=kiosk' : '/login';
  };
  // Esc also exits, for staff who can't spot the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="kiosk">
      <div className="k-head">
        <img src="/fbc_logo.png" alt="FBC" />
        <div><h1>FBC Attendance Check-in{room ? ` · ${room}` : ''}</h1><div className="k-clock">{clock}</div></div>
      </div>
      <div className="k-stage"><video ref={video} autoPlay muted playsInline /><canvas ref={overlay} /></div>
      <div className={'k-msg ' + msg.cls} id="msg">
        <div className="big">{msg.big}</div>
        {msg.small && <div className="small">{msg.small}</div>}
      </div>
      <div className="k-qr-hint">Face not recognized? Hold your QR card up to the camera.</div>
      <button className="k-exit" onClick={exit} title="Exit kiosk (Esc)">&larr; Exit kiosk</button>
    </div>
  );
}
