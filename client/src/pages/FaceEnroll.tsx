import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, longDate, type Student } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { IconLabel } from '../ui';
import { averageDescriptor, headPose, noFaceHint, quality, startCamera, type Detection } from '../faceKit';

type Pose = { yaw: number; pitch: number };
type Step = { prompt: string; arrow: string; kind: 'center' | 'turn' | 'tilt'; second?: boolean };

// Six views of the face. Each pose is checked from the landmarks before it is captured.
const STEPS: Step[] = [
  { prompt: 'Look straight at the camera', arrow: '', kind: 'center' },
  { prompt: 'Slowly turn your head to the left', arrow: 'left', kind: 'turn' },
  { prompt: 'Now turn your head to the right', arrow: 'right', kind: 'turn', second: true },
  { prompt: 'Tilt your chin up', arrow: 'up', kind: 'tilt' },
  { prompt: 'Now tilt your chin down', arrow: 'down', kind: 'tilt', second: true },
  { prompt: 'Look straight at the camera again', arrow: '', kind: 'center' },
];
const TURN = 0.18;        // how far the nose must move sideways, in eye-distances
const TILT = 0.06;        // how much the nose position between eyes and mouth must change
const GIVE_UP_MS = 8000;  // after this long in one step, take the best view we have

/** Full page for a student's face: consent first, then capture. The pop-up on Students uses the same parts. */
export default function FaceEnroll() {
  const { id } = useParams();
  const { data: s, reload } = useApi<Student>(`/students/${id}`);
  const { msg, run } = useMessage();

  if (!s) return null;
  const back = <Link to="/students" className="btn btn-outline"><IconLabel icon="back">Back to students</IconLabel></Link>;
  const removeFace = async () => {
    if (!confirm('Delete all face data for this student and withdraw consent?')) return;
    if (await run(() => api(`/students/${id}/face`, { method: 'DELETE' }),
                  'Face data deleted and consent withdrawn. This student is back on manual attendance.')) reload();
  };

  return (
    <>
      <Alert msg={msg} />
      <div className="sec-title">{s.first_name} {s.last_name}
        <small className="muted" style={{ fontWeight: 400, marginLeft: 6 }}>{s.student_no} · {s.section_name ?? 'No section'}</small>
      </div>
      {!s.face_consent_at ? (
        <div className="card" style={{ maxWidth: 640 }}><ConsentForm student={s} onDone={reload} footer={back} /></div>
      ) : (
        <>
          <div className="card" style={{ maxWidth: 640 }}><Capture student={s} onSaved={reload} footer={back} /></div>
          <div className="card" style={{ maxWidth: 640 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', marginRight: 10 }}>Consent withdrawn or student leaving?</span>
            <button className="btn btn-ghost-danger btn-sm" onClick={removeFace}><IconLabel icon="trash">Delete face data</IconLabel></button>
          </div>
        </>
      )}
    </>
  );
}

/** Records who signed the parent/guardian consent. Face data can only be saved after this. */
export function ConsentForm({ student, onDone, footer }: { student: Student; onDone: () => void; footer?: ReactNode }) {
  const { msg, run } = useMessage();
  const [consentBy, setConsentBy] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const name = `${student.first_name} ${student.last_name}`;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api(`/students/${student.student_id}/consent`, { body: { consent_by: consentBy, confirm: confirmed } }))) onDone();
  };
  return (
    <>
      <Alert msg={msg} />
      <div className="notice">
        Face data is sensitive. Make sure the parent/guardian has <strong>signed the consent form</strong> after reading the
        privacy notice. Only face measurements are stored, never photos, and they're deleted when consent is withdrawn.
      </div>
      <form onSubmit={submit}>
        <div className="form-group" style={{ maxWidth: 380 }}>
          <label>Parent/guardian who signed the consent</label>
          <input required value={consentBy} onChange={e => setConsentBy(e.target.value)} placeholder="Full name" />
        </div>
        <label className="check-line">
          <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          I confirm we have signed consent on file for {name}.
        </label>
        <div className="form-actions">
          {footer}
          <button type="submit" className="btn btn-primary"><IconLabel icon="arrow">Save consent and continue</IconLabel></button>
        </div>
      </form>
    </>
  );
}

/** Opens the camera and captures six views of the student's face: straight, left, right, up, down, straight. */
export function Capture({ student, onSaved, footer }: { student: Student; onSaved: () => void; footer?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const fresh = () => ({ capturing: false, samples: [] as number[][], stepStarted: 0, saving: false, holdUntil: 0,
                        base: null as Pose | null, turnSign: 0, tiltSign: 0, held: 0 });
  const state = useRef(fresh());
  const [prompt, setPrompt] = useState('Have the student face the camera, then press "Start capture".');
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(student.face_samples);
  const [failed, setFailed] = useState(false);
  const [arrow, setArrow] = useState('');

  useEffect(() => {
    let stop: (() => void) | undefined;
    let alive = true;
    const save = async () => {
      const st = state.current;
      st.capturing = false; st.saving = true;
      setPrompt('Saving…');
      try {
        const res = await api<{ count: number }>(`/students/${student.student_id}/face`, { body: { samples: st.samples } });
        setPrompt('✓ Face registered. The student can now use the check-in kiosk.');
        setRegistered(res.count); setFailed(false); onSaved();
      } catch (e) {
        setPrompt((e as Error).message); setFailed(true);
      }
      setArrow('');
      st.saving = false; st.holdUntil = Date.now() + 6000; setBusy(false);   // keep the result message on screen
    };
    const onFrame = async (dets: Detection[]) => {
      const st = state.current;
      if (st.saving || Date.now() < st.holdUntil) return;
      const v = video.current!;
      const issue = dets.length !== 1 ? (dets.length ? 'Only the student should be in view' : noFaceHint()) : quality(dets[0], v);
      // Before capture starts, show live feedback so staff know the camera can see the face.
      if (!st.capturing) { setPrompt(issue ?? '✓ Face found. Press "Start capture".'); return; }
      if (issue) { setPrompt(issue); return; }
      const step = STEPS[st.samples.length];
      const pose = headPose(dets[0].landmarks.positions);
      const late = Date.now() - st.stepStarted > GIVE_UP_MS;
      if (!poseReached(step, pose, st)) {
        st.held = 0;
        setPrompt(late ? step.prompt + ' (a little more)' : step.prompt);
        if (!late) return;
      } else if (++st.held < 2 && !late) { setPrompt('Hold still…'); return; }   // the pose must hold for 2 frames
      const d = await averageDescriptor(v, 1);
      if (!d) return;
      if (step.kind === 'center' && !st.base) st.base = pose;
      st.held = 0;
      st.samples.push(d); setCount(st.samples.length); st.stepStarted = Date.now();
      setArrow(STEPS[st.samples.length]?.arrow ?? '');
      if (st.samples.length === STEPS.length) await save();
    };
    startCamera(video.current!, overlay.current, onFrame)
      .then(s => { if (alive) { stop = s; setReady(true); } else s(); })
      .catch(err => setPrompt('Camera unavailable: ' + (err.message || err)));
    return () => { alive = false; stop?.(); };
  }, [student.student_id]);

  const start = () => {
    state.current = { ...fresh(), capturing: true, stepStarted: Date.now() };
    setCount(0); setBusy(true); setArrow('');
  };

  return (
    <>
      <p className="muted" style={{ marginBottom: 10 }}>
        {student.face_consent_at && <>Consent from <strong>{student.face_consent_by}</strong>, {longDate(student.face_consent_at.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}. </>}
        Status: <strong>{registered ? 'Face registered' : 'Not registered yet'}</strong>
      </p>
      <div className="cam"><video ref={video} autoPlay muted playsInline /><canvas ref={overlay} />
        {busy && arrow && <div className={`pose-arrow ${arrow}`} aria-hidden="true">➜</div>}</div>
      <div className="cam-prompt">{prompt}</div>
      <div className="dots">{STEPS.map((_, i) => <span key={i} className={i < count ? 'on' : ''} />)}</div>
      <div className="form-actions">
        {footer}
        <button className="btn btn-primary" disabled={!ready || busy} onClick={start}>
          <IconLabel icon="face">{!ready ? 'Loading camera…' : busy ? 'Capturing…' : failed ? 'Try again' : registered ? 'Capture again' : 'Start capture'}</IconLabel>
        </button>
      </div>
    </>
  );
}

/**
 * Whether the head is in the pose this step asks for, compared with the first straight-on view.
 * Left/right and up/down are learned from whichever way the person moves first, so the
 * second of each pair just has to go the opposite way.
 */
function poseReached(step: Step, pose: Pose, st: { base: Pose | null; turnSign: number; tiltSign: number }): boolean {
  if (step.kind === 'center') {
    if (!st.base) return Math.abs(pose.yaw) < 0.12;
    return Math.abs(pose.yaw - st.base.yaw) < 0.1 && Math.abs(pose.pitch - st.base.pitch) < 0.05;
  }
  const base = st.base ?? { yaw: 0, pitch: pose.pitch };
  const dYaw = pose.yaw - base.yaw, dPitch = pose.pitch - base.pitch;
  if (step.kind === 'turn') {
    if (!step.second) { if (Math.abs(dYaw) < TURN) return false; st.turnSign = Math.sign(dYaw); return true; }
    return dYaw * (st.turnSign || 1) < -TURN;
  }
  if (Math.abs(dYaw) > 0.15) return false;   // tilting, not turning
  if (!step.second) { if (Math.abs(dPitch) < TILT) return false; st.tiltSign = Math.sign(dPitch); return true; }
  return dPitch * (st.tiltSign || 1) < -TILT;
}
