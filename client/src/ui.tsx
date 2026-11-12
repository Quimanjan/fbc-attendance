import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from './icons';

/** A button with an icon in front of its label, so its action is clear at a glance. */
export function IconLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return <><span className="btn-ico"><Icon name={icon} /></span>{children}</>;
}

/** Tabs whose current tab is kept in the URL (?tab=...), so links and the Back button work. */
export function Tabs({ tabs, numbered = false }: { numbered?: boolean; tabs: { id: string; label: string; icon: string; hint: string; render: () => ReactNode }[] }) {
  const [params, setParams] = useSearchParams();
  const current = tabs.find(t => t.id === params.get('tab')) ?? tabs[0];
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.id} role="tab" aria-selected={t === current} className={'tab' + (t === current ? ' active' : '')}
                  onClick={() => setParams({ tab: t.id }, { replace: true })}>
            {numbered && <span className="tab-step">{i + 1}</span>}<Icon name={t.icon} />{t.label}
          </button>
        ))}
      </div>
      <p className="page-hint">{current.hint}</p>
      {current.render()}
    </>
  );
}

/** A "+ Add …" button that opens its form underneath, keeping the page uncluttered until it's needed. */
export function AddPanel({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="card add-panel">
      <div className="add-panel-head">
        <strong>{label}</strong>
        <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}><IconLabel icon="x">Cancel</IconLabel></button>
      </div>
      {children(() => setOpen(false))}
    </div>
  ) : (
    <button className="btn btn-primary add-btn" onClick={() => setOpen(true)}><IconLabel icon="plus">{label}</IconLabel></button>
  );
}

/** A pop-up window over the page. Esc or the × closes it. */
export function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <div className="muted">{subtitle}</div>}</div>
          <button className="modal-close" onClick={onClose} title="Close (Esc)" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Numbered progress dots for a multi-step pop-up. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'current' : ''}>
          <span className="stepper-dot">{i < current ? <Icon name="check" /> : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
