import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { longDate } from '../api';
import { useApi } from '../hooks';
import { Icon } from '../icons';

interface Stats {
  date: string; students: number; teachers: number; classes: number; sections: number; faces: number;
  present: number; absent: number; late: number; excused: number;
}

/** Counts up from 0 to the value so the numbers animate in. */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

function Ring({ pct, empty }: { pct: number; empty: boolean }) {
  const r = 46, c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = setTimeout(() => setShown(pct), 80); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="ring">
      <svg viewBox="0 0 112 112">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff1c9" /><stop offset="100%" stopColor="#f2c14e" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="56" cy="56" r={r} />
        <circle className="ring-bar" cx="56" cy="56" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="ring-inner">
        <div><div className="ring-num">{empty ? "–" : `${pct}%`}</div><div className="ring-label">on time</div></div>
      </div>
    </div>
  );
}

/** The order a new school sets things up in. Each step links straight to where it's done. */
function setupSteps(s: Stats): [boolean, string, string, string][] {
  return [
    [s.teachers > 0, 'Add your teachers', '/setup?tab=teachers', `${s.teachers} added`],
    [s.classes > 0 && s.sections > 0, 'Create classes and sections', '/setup?tab=classes', `${s.classes} classes, ${s.sections} sections`],
    [s.students > 0, 'Add students to their sections', '/students', `${s.students} added`],
    [s.faces > 0, 'Register student faces for check-in', '/students', `${s.faces} of ${s.students} registered`],
  ];
}

export default function Dashboard() {
  const { data: s } = useApi<Stats>('/dashboard');
  if (!s) return null;
  const marked = s.present + s.absent + s.late + s.excused;
  const onTime = marked ? Math.round((s.present / marked) * 100) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = longDate(s.date, { month: 'long', day: 'numeric' });
  const steps = setupSteps(s);
  const nextStep = steps.findIndex(([done]) => !done);

  let i = 0;
  const stat = (n: number, label: string, icon: string, color: string) => (
    <div className="stat-card" style={{ animationDelay: `${i++ * 60}ms`, ['--accent' as string]: color }}>
      <div className="stat-icon"><Icon name={icon} /></div>
      <div><div className="stat-num"><CountUp value={n} /></div><div className="stat-label">{label}</div></div>
    </div>
  );
  return (
    <>
      <div className="dash-hero">
        <div>
          <h2>{greeting}!</h2>
          <p>{marked
            ? `${marked} of ${s.students} students have attendance for today, ${today}.`
            : `No attendance yet for today, ${today}. Pick one of the options below to start.`}</p>
        </div>
        <Ring pct={onTime} empty={!marked} />
      </div>

      <div className="action-grid">
        <Link to="/attendance?tab=kiosk" className="action-card primary">
          <div className="action-ico"><Icon name="face" /></div>
          <div><div className="action-title">Start face check-in</div><div className="action-sub">Students check themselves in at the entrance camera.</div></div>
          <Icon name="arrow" />
        </Link>
        <Link to="/attendance?tab=manual" className="action-card">
          <div className="action-ico"><Icon name="edit" /></div>
          <div><div className="action-title">Mark attendance by hand</div><div className="action-sub">Pick a section and tap Present, Late, Absent or Excused.</div></div>
          <Icon name="arrow" />
        </Link>
      </div>

      <div className="sec-title" style={{ marginTop: 26 }}>Today</div>
      <div className="stats-grid">
        {stat(s.present, 'Present', 'check', '#86efac')}{stat(s.late, 'Late', 'clock', '#fcd34d')}
        {stat(s.absent, 'Absent', 'x', '#fca5a5')}{stat(s.excused, 'Excused', 'shield', '#93c5fd')}
      </div>

      {nextStep >= 0 && <>
        <div className="sec-title" style={{ marginTop: 26 }}>Finish setting up</div>
        <div className="card checklist">
          {steps.map(([done, label, to, detail], k) => (
            <Link key={label} to={to} className={'check-row' + (done ? ' done' : '') + (k === nextStep ? ' next' : '')}>
              <span className="check-mark">{done ? <Icon name="check" /> : k + 1}</span>
              <span className="check-label">{label}<small>{detail}</small></span>
              {k === nextStep && <span className="btn btn-primary btn-sm">Do this next</span>}
            </Link>
          ))}
        </div>
      </>}
    </>
  );
}
