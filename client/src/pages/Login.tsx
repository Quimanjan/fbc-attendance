import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTilt } from '../effects';

const ERRORS: Record<string, string> = {
  google: 'Google sign-in failed. Please try again.',
  state: 'Your sign-in expired. Please try again.',
  email: 'Your Google account email is not verified.',
};

export default function Login() {
  const error = ERRORS[new URLSearchParams(window.location.search).get('error') ?? ''];
  const tilt = useTilt<HTMLDivElement>(6);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  // Teachers given a password by the admin sign in here.
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setFailed('');
    const res = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      .catch(() => null);
    if (res?.ok) { window.location.href = '/'; return; }
    setFailed((await res?.json().catch(() => null))?.error ?? 'Could not sign in. Please try again.');
    setBusy(false);
  };
  return (
    <div className="login-page">
      <div className="blob blob-a" /><div className="blob blob-b" />
      <Link to="/" className="login-back">&larr; Back to home</Link>
      <div className="login-card" ref={tilt}>
        <div className="logo-wrap">
          <div className="logo-ring">
            <div className="logo-circle"><img src="/fbc_logo.png" alt="Fellowship Baptist College Logo" /></div>
          </div>
        </div>
        <div className="school-name">Fellowship Baptist College</div>
        <div className="system-label">Attendance Monitoring System</div>
        <div className="divider">
          <div className="divider-line"></div>
          <span>Sign in with your school account</span>
          <div className="divider-line"></div>
        </div>
        {error && <p className="login-error">{error}</p>}
        <a href="/auth/google" className="google-btn">
          <span className="google-icon-wrap">
            <svg className="google-icon" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
          </span>
          Sign in with Google
        </a>
        <div className="divider">
          <div className="divider-line"></div>
          <span>or with email and password</span>
          <div className="divider-line"></div>
        </div>
        <form className="login-form" onSubmit={signIn}>
          <input type="email" autoComplete="username" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          {failed && <p className="login-error">{failed}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="info-note">
          Use your <strong>school Gmail account</strong>, or the email and password<br />
          your school admin gave you.
        </p>
        <div className="card-footer">&copy; {new Date().getFullYear()} Fellowship Baptist College &mdash; All rights reserved.</div>
      </div>
    </div>
  );
}
