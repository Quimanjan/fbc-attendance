import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons';
import { useReveal, useSpotlight, useTilt } from '../effects';

const WORDS = ['a glance', 'a blink', 'one second'];

const FEATURES: [string, string, string][] = [
  ['face', 'Face check-in kiosk', 'Students look at the camera at the entrance and are marked Present or Late on the spot.'],
  ['eye', 'Blink liveness check', 'A quick blink proves a real person is there, so a printed photo can’t check someone in.'],
  ['clock', 'Automatic late & absent', 'Status follows each section’s schedule with a grace period, and no-shows are marked absent for you.'],
  ['mail', 'Parent notifications', 'Parents get an email when their child is late or absent, plus a warning after repeated absences.'],
  ['chart', 'Records & reports', 'Filter any day, correct entries by hand, and pull a monthly summary per section.'],
  ['lock', 'Private by design', 'Only face measurements are kept, never photos, and matching stays on the school’s own server.'],
];

const STEPS: [string, string][] = [
  ['Register', 'Record parent consent, then capture six quick views of each student’s face.'],
  ['Check in', 'Students blink at the kiosk and see Present or Late in about a second.'],
  ['Review', 'Teachers see who’s in, fix anything by hand, and parents are kept informed.'],
];

const NUMBERS: [number, string, string][] = [
  [6, '', 'views to register a face'],
  [1, 's', 'to check in at the kiosk'],
  [15, 'm', 'grace period before Late'],
  [0, '', 'photos ever stored'],
];

const DEMO: [string, string, string][] = [
  ['Present', '7:18 AM', 'ok'], ['Present', '7:24 AM', 'ok'], ['Late', '7:52 AM', 'late'], ['Present', '7:29 AM', 'ok'],
];

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % WORDS.length), 2400); return () => clearInterval(t); }, []);
  return <span className="rot-word" key={i}>{WORDS[i]}</span>;
}

function CountOnView({ to, suffix }: { to: number; suffix: string }) {
  const [n, setN] = useState(0);
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { setN(to); return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1100);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [el, to]);
  return <span ref={setEl}>{n}{suffix}</span>;
}

function Scanner() {
  const tilt = useTilt<HTMLDivElement>(10);
  const [k, setK] = useState(0);
  useEffect(() => { const t = setInterval(() => setK(n => (n + 1) % DEMO.length), 2600); return () => clearInterval(t); }, []);
  const [status, time, tone] = DEMO[k];
  return (
    <div className="scanner" ref={tilt}>
      <div className="scanner-top"><span className="led" /><span className="led" /><span className="led" /><span className="scanner-title">Kiosk</span></div>
      <div className="scanner-screen">
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        <div className="scan-face"><Icon name="face" /></div>
        <div className="scan-line" />
        <div className="scan-grid" />
      </div>
      <div className={`scan-toast ${tone}`} key={k}>
        <span className="toast-dot"><Icon name={tone === 'ok' ? 'check' : 'clock'} /></span>
        <div><b>{status}</b><small>Checked in at {time}</small></div>
      </div>
      <div className="orbit o1" /><div className="orbit o2" />
    </div>
  );
}

export default function Landing({ signedIn }: { signedIn: boolean }) {
  const root = useReveal<HTMLDivElement>();
  const glow = useSpotlight<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const cta = signedIn ? { to: '/', label: 'Open dashboard' } : { to: '/login', label: 'Sign in' };

  return (
    <div className="landing" ref={root}>
      <div className="spotlight" ref={glow} />
      <div className="particles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i} style={{ ['--i' as string]: i }} />)}</div>

      <header className={'l-nav' + (scrolled ? ' scrolled' : '')}>
        <a href="#top" className="l-brand"><span className="l-logo"><img src="/fbc_logo.png" alt="" /></span>FBC <em>Attendance</em></a>
        <nav className="l-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link to={cta.to} className="l-btn l-btn-sm">{cta.label}</Link>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow" data-reveal><span className="pulse" />Fellowship Baptist College</div>
          <h1 data-reveal>Attendance that takes <br /><RotatingWord /></h1>
          <p className="hero-sub" data-reveal>
            Students check in with their face at the entrance. Late and absent are worked out for you,
            parents are notified, and teachers get the full picture before first period.
          </p>
          <div className="hero-ctas" data-reveal>
            <Link to={cta.to} className="l-btn">{cta.label} <Icon name="arrow" /></Link>
            <a href="#how" className="l-btn l-btn-ghost">See how it works</a>
          </div>
        </div>
        <div className="hero-art" data-reveal><Scanner /></div>
        <a href="#features" className="scroll-cue" aria-label="Scroll down"><span /></a>
      </section>

      <section className="l-section" id="features">
        <div className="l-head" data-reveal>
          <span className="kicker">Features</span>
          <h2>Everything attendance needs, nothing it doesn't</h2>
        </div>
        <div className="feat-grid">
          {FEATURES.map(([icon, title, text], i) => <FeatureCard key={title} icon={icon} title={title} text={text} delay={i * 70} />)}
        </div>
      </section>

      <section className="numbers" data-reveal>
        {NUMBERS.map(([n, suf, label]) => (
          <div className="num" key={label}><div className="num-val"><CountOnView to={n} suffix={suf} /></div><div className="num-label">{label}</div></div>
        ))}
      </section>

      <section className="l-section" id="how">
        <div className="l-head" data-reveal>
          <span className="kicker">How it works</span>
          <h2>Three steps from gate to report</h2>
        </div>
        <div className="steps">
          {STEPS.map(([title, text], i) => (
            <div className="step" key={title} data-reveal style={{ transitionDelay: `${i * 120}ms` }}>
              <div className="step-num">{i + 1}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-band" data-reveal>
        <h2>Ready for tomorrow morning?</h2>
        <p>Sign in with your school Google account to get started.</p>
        <Link to={cta.to} className="l-btn l-btn-light">{cta.label} <Icon name="arrow" /></Link>
      </section>

      <footer className="l-foot">&copy; {new Date().getFullYear()} Fellowship Baptist College &middot; Attendance Monitoring System</footer>
    </div>
  );
}

function FeatureCard({ icon, title, text, delay }: { icon: string; title: string; text: string; delay: number }) {
  const tilt = useTilt<HTMLDivElement>(8);
  return (
    <div className="feat" data-reveal style={{ transitionDelay: `${delay}ms` }}>
      <div className="feat-inner" ref={tilt}>
        <div className="feat-icon"><Icon name={icon} /></div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}
