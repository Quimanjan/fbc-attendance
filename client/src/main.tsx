import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './style.css';
import './app.css';
import './login.css';
import './neu.css';
import './landing.css';
import './workflow.css';
import './maroon.css';
import { api, type User } from './api';
import { Layout, NAV } from './Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentEdit from './pages/StudentEdit';
import FaceEnroll from './pages/FaceEnroll';
import TeacherEdit from './pages/TeacherEdit';
import TakeAttendance from './pages/TakeAttendance';
import Records from './pages/Records';
import Setup from './pages/Setup';
import Kiosk from './pages/Kiosk';
// The 3D classroom is large, so it loads only when opened.
const Classroom = lazy(() => import('./pages/Classroom'));
const QrCards = lazy(() => import('./pages/QrCards'));
const StudentProfile = lazy(() => import('./pages/Profile'));
import './profile.css';
import './classroom.css';

type Me = { user: User | null; kiosk: boolean; student?: { student_id: number; name: string } | null };

function App() {
  const [me, setMe] = useState<Me | null>(null);
  const location = useLocation();
  useEffect(() => { api<Me>('/me').then(setMe).catch(() => setMe({ user: null, kiosk: false })); }, [location.pathname]);
  if (!me) return null;

  // A kiosk device can only show the check-in screen.
  if (me.kiosk) return <Kiosk />;
  // A signed-in student only has their own profile.
  if (me.student) return location.pathname === '/' ? <Suspense fallback={null}><StudentProfile /></Suspense> : <Navigate to="/" replace />;
  if (location.pathname === '/login') return me.user ? <Navigate to="/" replace /> : <Login />;
  // Signed-out visitors see the landing page; every other path sends them there.
  if (!me.user) return location.pathname === '/' ? <Landing signedIn={false} /> : <Navigate to="/" replace />;

  const user = me.user;
  const hint = (to: string) => NAV.find(n => n.to === to)?.hint;
  const page = (title: string, el: React.ReactNode, to?: string) => <Layout user={user} title={title} hint={to && hint(to)}>{el}</Layout>;
  const startKiosk = () => setMe({ user: null, kiosk: true });
  return (
    <Routes>
      <Route path="/" element={page('Home', <Dashboard />, '/')} />
      <Route path="/welcome" element={<Landing signedIn />} />
      <Route path="/attendance" element={page('Take Attendance', <TakeAttendance onKioskStarted={startKiosk} />, '/attendance')} />
      <Route path="/classroom" element={page('Classroom', <Suspense fallback={null}><Classroom user={user} /></Suspense>, '/classroom')} />
      <Route path="/students" element={page('Students', <Students />, '/students')} />
      <Route path="/students/qr-cards" element={page('QR Cards', <Suspense fallback={null}><QrCards /></Suspense>)} />
      <Route path="/students/:id/edit" element={page('Edit Student', <StudentEdit />)} />
      <Route path="/students/:id/face" element={page('Register Face', <FaceEnroll />)} />
      <Route path="/records" element={page('Records', <Records />, '/records')} />
      <Route path="/setup" element={page('School Setup', <Setup />, '/setup')} />
      <Route path="/teachers/:id/edit" element={page('Edit Teacher', <TeacherEdit />)} />
      {/* Old addresses from before the menu was simplified. */}
      <Route path="/kiosk" element={<Navigate to="/attendance?tab=kiosk" replace />} />
      <Route path="/teachers" element={<Navigate to="/setup?tab=teachers" replace />} />
      <Route path="/classes" element={<Navigate to="/setup?tab=classes" replace />} />
      <Route path="/reports" element={<Navigate to="/records?tab=monthly" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
