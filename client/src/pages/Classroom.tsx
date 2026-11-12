import { useEffect, useRef, useState } from 'react';
import { api, time12, type User } from '../api';
import { useMessage } from '../hooks';
import { Alert } from '../Layout';
import { Empty, IconLabel } from '../ui';
import { Room3D, webglAvailable, type Person } from '../room3d';

interface Period {
  schedule_id: number; time_start: string; time_end: string; room: string;
  class_name: string; subject: string | null; section_name: string | null; course: string | null; year_level: string | null;
  teacher_id: number | null; teacher_name: string | null;
}
interface Entry { type: 'student' | 'teacher'; id: number; name: string; gender: string | null; status: 'Present' | 'Late' | null; time_in: string | null; method: string | null }
interface Summary { schedule_id: number; time_start: string; time_end: string; subject: string; section_name: string | null; teacher_name: string | null;
  expected: number; present: number; late: number; absent: number | null; teacher_in: boolean; ended: boolean }
interface Data { room: string | null; rooms: string[]; date: string; time: string; current: Period | null; next: Period | null; roster: Entry[]; periods: Summary[];
  canMark: boolean; preview: Period | null; previewRoster: Entry[] }

const mins = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 60 + m + (s || 0) / 60; };
const subjectOf = (p: Period) => p.subject || p.class_name;
const sectionOf = (p: { section_name: string | null; year_level?: string | null }) =>
  [p.section_name, p.year_level].filter(Boolean).join(' · ');

/** One classroom: the class on now, who should be there, and the ones who are, walking around in 3D. */
export default function Classroom({ user }: { user: User }) {
  const [room, setRoom] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [, tick] = useState(0);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [previewId, setPreviewId] = useState(0);
  const [walkedIn, setWalkedIn] = useState<string[]>([]);
  const { msg, run } = useMessage();
  const admin = user.role === 'admin';

  const qs = new URLSearchParams();
  if (room) qs.set('room', room);
  if (previewId) qs.set('preview', String(previewId));
  const load = () => api<Data>('/classroom?' + qs)
    .then(d => { setData(d); setFetchedAt(Date.now()); setError(''); })
    .catch(e => setError(e instanceof Error ? e.message : 'Could not load the classroom.'));

  // Refresh every few seconds, so new check-ins walk in and the room resets when a class ends.
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    const c = setInterval(() => tick(n => n + 1), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [room, previewId]);

  // Preview: the class's people walk in one by one (teacher first). Only shown here, nothing is saved.
  const pv = data?.preview ?? null;
  useEffect(() => {
    setWalkedIn([]);
    if (!pv) return;
    const t = setInterval(() => setWalkedIn(w => {
      const left = (data?.previewRoster ?? []).filter(e => !e.status && !w.includes(`${e.type}:${e.id}`));
      if (!left.length) return w;
      const next = left.find(e => e.type === 'teacher') ?? left[Math.floor(Math.random() * left.length)];
      return [...w, `${next.type}:${next.id}`];
    }), 1200);
    return () => clearInterval(t);
  }, [pv?.schedule_id, data?.previewRoster.length]);

  useEffect(() => {
    if (!demo || !data?.room) return;
    const go = () => api('/classroom/demo', { body: { room: data.room } }).then(load).catch(() => setDemo(false));
    go();
    const t = setInterval(go, 4000);
    return () => clearInterval(t);
  }, [demo, data?.room, data?.current?.schedule_id]);

  // No data yet (loading, or the server couldn't answer): still show the empty room.
  if (!data || !data.room) return <NoRooms admin={admin} onSeeded={load} loading={!data && !error} error={error} />;

  // In a preview, the room shows the chosen class instead of the one on now.
  const cur = pv ?? data.current;
  const list = pv
    ? data.previewRoster.map(e => e.status || !walkedIn.includes(`${e.type}:${e.id}`) ? e : { ...e, status: 'Present' as const, method: 'preview' })
    : data.roster;
  const present = list.filter(e => e.status);
  const students = list.filter(e => e.type === 'student');
  const here = students.filter(e => e.status).length;
  const teacher = list.find(e => e.type === 'teacher');
  const canMark = !pv && data.canMark;

  // Time left in the current class, counted down locally between refreshes.
  const nowMin = mins(data.time) + (Date.now() - fetchedAt) / 60000;
  const left = cur && !pv ? Math.max(0, mins(cur.time_end) - nowMin) : 0;
  const done = cur && !pv ? Math.min(1, (nowMin - mins(cur.time_start)) / (mins(cur.time_end) - mins(cur.time_start))) : 0;
  const leftText = left >= 60 ? `${Math.floor(left / 60)} h ${Math.round(left % 60)} min left` : `${Math.ceil(left)} min left`;

  const mark = (e: Entry) => run(async () => {
    await api('/classroom/checkin', { body: { room: data.room, type: e.type, id: e.id } });
    await load();
  });

  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar cr-toolbar">
        {data.rooms.length > 1 && (
          <label className="cr-room">Room
            <select value={data.room} onChange={e => setRoom(e.target.value)}>
              {data.rooms.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
        )}
        <div className="cr-now">
          {pv ? (
            <>
              <div className="cr-subject">Preview: {subjectOf(pv)}</div>
              <div className="muted">{data.room} · {sectionOf(pv)} · {pv.teacher_name ?? 'No teacher'} · {time12(pv.time_start)} to {time12(pv.time_end)}</div>
              <div className="muted" style={{ margin: '8px 0' }}>This shows the class walking in. Nothing is saved.</div>
              <button className="btn btn-outline btn-sm" onClick={() => setPreviewId(0)}>Back to the class on now</button>
            </>
          ) : cur ? (
            <>
              <div className="cr-subject">{subjectOf(cur)}</div>
              <div className="muted">{data.room} · {sectionOf(cur)} · {cur.teacher_name ?? 'No teacher'} · {time12(cur.time_start)} to {time12(cur.time_end)}</div>
              <div className="cr-progress"><span style={{ width: `${done * 100}%` }} /></div>
              <div className="muted">{leftText}. The room empties when this class ends.</div>
            </>
          ) : (
            <>
              <div className="cr-subject">No class right now</div>
              <div className="muted">{data.room} · {data.next ? `Next: ${subjectOf(data.next)} (${data.next.section_name}) at ${time12(data.next.time_start)}` : 'No more classes today.'}</div>
              {data.periods.length > 0 && <div className="muted" style={{ marginTop: 6 }}>Pick a class under "Today in {data.room}" to see it in the room.</div>}
            </>
          )}
        </div>
        {cur && (
          <div className="cr-count">
            <div className="cr-count-num">{here}<small>/{students.length}</small></div>
            <div className="muted">students here</div>
          </div>
        )}
      </div>

      <div className="cr-grid">
        <div className="card cr-stage">
          <Scene current={cur} people={present.map(e => ({ key: `${e.type}:${e.id}`, name: e.name, kind: e.type, gender: e.gender }))} />
          <div className="cr-legend">
            <span><i className="dot dot-teacher" />Teacher</span><span><i className="dot dot-student" />Student</span>
            <span className="muted">Drag to turn the room, scroll to zoom.</span>
          </div>
        </div>

        <div className="card cr-roster">
          <div className="cr-roster-head">
            <strong>Should be in class</strong>
            {admin && cur && !pv && (
              <button className={'btn btn-sm ' + (demo ? 'btn-primary' : 'btn-outline')} onClick={() => setDemo(!demo)}
                      title="Makes students of this class check in a few at a time, to try the room without the camera.">
                <IconLabel icon="play">{demo ? 'Stop demo' : 'Demo arrivals'}</IconLabel>
              </button>
            )}
          </div>
          {!cur ? <p className="muted">The list appears when a class starts.</p> : (<>
            {!canMark && !pv && <p className="muted" style={{ margin: '0 0 8px' }}>Only {cur.teacher_name ?? 'the teacher of this class'} can mark people in by hand.</p>}
            <ul>
              {teacher && <Row e={teacher} onMark={canMark ? mark : undefined} />}
              {students.map(e => <Row key={e.id} e={e} onMark={canMark ? mark : undefined} />)}
            </ul>
          </>)}
        </div>
      </div>

      <div className="sec-title">Today in {data.room}</div>
      <div className="cr-day">
        {data.periods.map(p => {
          const isNow = p.schedule_id === data.current?.schedule_id;
          const open = () => setPreviewId(isNow || p.schedule_id === pv?.schedule_id ? 0 : p.schedule_id);
          return (
            <div key={p.schedule_id} role="button" tabIndex={0} onClick={open} onKeyDown={e => e.key === 'Enter' && open()}
                 title={isNow ? 'On now' : 'Show this class in the room'}
                 className={'cr-period' + (isNow ? ' now' : p.ended ? ' ended' : '') + (p.schedule_id === pv?.schedule_id ? ' previewing' : '')}>
              <div className="cr-time">{time12(p.time_start)} to {time12(p.time_end)}</div>
              <div className="cr-psub">{p.subject}</div>
              <div className="muted">{p.section_name} · {p.teacher_name}</div>
              <div className="cr-pcount">
                {p.ended ? <>
                  <span className="badge badge-present">{p.present} present</span>
                  {p.late > 0 && <span className="badge badge-late">{p.late} late</span>}
                  <span className="badge badge-absent">{p.absent} absent</span>
                </> : isNow ? <span className="badge badge-present">{p.present + p.late} of {p.expected} in</span>
                  : <span className="badge badge-muted">{p.expected} students</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Row({ e, onMark }: { e: Entry; onMark?: (e: Entry) => void }) {
  return (
    <li className={e.status ? 'in' : ''}>
      <span className={'dot ' + (e.type === 'teacher' ? 'dot-teacher' : 'dot-student')} />
      <span className="cr-name">{e.name}{e.type === 'teacher' && <span className="muted"> · Teacher</span>}</span>
      {e.status
        ? <span className={'badge ' + (e.status === 'Late' ? 'badge-late' : 'badge-present')} title={e.method === 'demo' ? 'Demo check-in' : ''}>{e.method === 'preview' ? 'In the room' : `${e.status} ${time12(e.time_in)}`}</span>
        : !onMark ? <span className="badge badge-muted">Not in yet</span>
        : <button className="btn btn-outline btn-sm" onClick={() => onMark(e)} title="Mark as here, if the camera missed them">Mark here</button>}
    </li>
  );
}

/** The 3D room. People in `people` walk in; it empties when the class changes. */
function Scene({ current, people }: { current: Period | null; people: Person[] }) {
  const host = useRef<HTMLDivElement>(null);
  const room = useRef<Room3D | null>(null);
  const [ok, setOk] = useState(webglAvailable);
  const sched = current?.schedule_id ?? 0;

  useEffect(() => {
    if (!ok || !host.current) return;
    try {
      room.current = new Room3D(host.current);
    } catch (e) {
      console.error(e);
      setOk(false);
      return;
    }
    return () => { room.current?.dispose(); room.current = null; };
  }, [ok]);

  // A new class: empty the room and write the class on the board.
  useEffect(() => {
    const r = room.current;
    if (!r) return;
    r.clear();
    r.setBoard(current
      ? [current.subject || current.class_name, [current.section_name, current.year_level].filter(Boolean).join(' · '),
         `${time12(current.time_start)} to ${time12(current.time_end)}`]
      : ['No class right now']);
  }, [sched, ok]);

  const keys = people.map(p => p.key).join(',');
  useEffect(() => { room.current?.setPeople(people); }, [keys, sched, ok]);

  if (!ok) return <Empty><p>This browser can't show 3D. Try Chrome or Edge with hardware acceleration turned on.</p></Empty>;
  return <div ref={host} className="cr-canvas" />;
}

function NoRooms({ admin, onSeeded, loading, error }: { admin: boolean; onSeeded: () => void; loading: boolean; error: string }) {
  const { msg, run } = useMessage();
  return (
    <>
      <Alert msg={msg} />
      <div className="toolbar cr-toolbar">
        <div className="cr-now">
          <div className="cr-subject">No class right now</div>
          <div className="muted">
            {loading ? 'Loading the classroom…'
              : error ? `Couldn't load the timetable (${error}). If the server was just updated, restart it.`
              : 'No classroom has a timetable yet. Give class times a room in School Setup, or add the sample Room 101 with 10 classes from 7:30 AM to 8:30 PM.'}
          </div>
        </div>
        {admin && !loading && !error && (
          <button className="btn btn-primary" onClick={() => run(async () => { await api('/classroom/seed', { method: 'POST' }); onSeeded(); }, 'Room 101 added.')}>
            <IconLabel icon="plus">Add sample Room 101</IconLabel></button>
        )}
      </div>
      <div className="card cr-stage">
        <Scene current={null} people={[]} />
        <div className="cr-legend">
          <span><i className="dot dot-teacher" />Teacher</span><span><i className="dot dot-student" />Student</span>
          <span className="muted">Drag to turn the room, scroll to zoom.</span>
        </div>
      </div>
    </>
  );
}
