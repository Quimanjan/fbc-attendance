import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User } from './api';
import { Icon } from './icons';

/** The whole app in five places, in the order a school day uses them. */
export const NAV: { to: string; label: string; icon: string; hint: string }[] = [
  { to: '/', label: 'Home', icon: 'home', hint: "Today's numbers and what to do next." },
  { to: '/attendance', label: 'Take Attendance', icon: 'check', hint: 'Start the face check-in, or mark a section by hand.' },
  { to: '/classroom', label: 'Classroom', icon: 'room', hint: 'Who should be in the room for the class on now, and who is, in 3D.' },
  { to: '/students', label: 'Students', icon: 'students', hint: 'Add students and register their faces.' },
  { to: '/records', label: 'Records', icon: 'list', hint: 'See past days and monthly totals.' },
  { to: '/setup', label: 'School Setup', icon: 'settings', hint: 'Teachers, classes, sections and class times.' },
];

export function Layout({ user, title, hint, children }: { user: User; title: string; hint?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const logout = async () => { await fetch('/auth/logout', { method: 'POST' }).catch(() => {}); navigate('/login'); };
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="s-logo"><img src="/fbc_logo.png" alt="FBC" /></div>
          <div className="s-title">FBC <small>Attendance System</small></div>
        </div>
        <nav>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} title={n.hint}
                     className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <span className="nav-ico"><Icon name={n.icon} /></span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-row">
            <div className="user-pic">{user.picture && <img src={user.picture} alt="Profile" referrerPolicy="no-referrer" />}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
          <button className="logout-link link-btn" onClick={logout}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {hint && <div className="topbar-hint">{hint}</div>}
          </div>
          <div className="topbar-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div className="content">{children}</div>
        <nav className="bottom-nav">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => 'bn-link' + (isActive ? ' active' : '')}>
              <Icon name={n.icon} /><span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}

export function Alert({ msg }: { msg: { text: string; type: 'success' | 'error' } | null }) {
  if (!msg) return null;
  return <div className={'alert' + (msg.type === 'error' ? ' alert-error' : '')}>{msg.text}</div>;
}
