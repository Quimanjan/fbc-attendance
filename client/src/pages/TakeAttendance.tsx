import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Tabs, IconLabel } from '../ui';
import { Icon } from '../icons';
import RecordAttendance from './RecordAttendance';

/** One place for both ways of taking attendance. */
export default function TakeAttendance({ onKioskStarted }: { onKioskStarted: () => void }) {
  return (
    <Tabs tabs={[
      { id: 'kiosk', label: 'Face check-in', icon: 'face', hint: 'For the computer at the entrance. Students look at the camera and blink or stay still for 5 seconds, and they are marked Present or Late.',
        render: () => <KioskLaunch onStarted={onKioskStarted} /> },
      { id: 'manual', label: 'Mark by hand', icon: 'edit', hint: 'For a classroom, or to correct the check-in. Pick a section, tap a status for each student, then save.',
        render: () => <RecordAttendance /> },
    ]} />
  );
}

function KioskLaunch({ onStarted }: { onStarted: () => void }) {
  const { data: rooms } = useApi<string[]>('/rooms');
  const [room, setRoom] = useState('');
  const start = async () => {
    if (!confirm('Start the check-in camera on this computer? You will be signed out here so students can only use check-in.')) return;
    await api('/kiosk/start', { body: { room } });
    onStarted();
  };
  return (
    <div className="card kiosk-launch">
      <div className="kl-ico"><Icon name="face" /></div>
      <div className="kl-body">
        <h3>Turn this computer into the check-in kiosk</h3>
        <ol>
          <li>Place this computer at the entrance with the camera facing students.</li>
          <li>Press <strong>Start check-in</strong>. You'll be signed out here for safety.</li>
          <li>When the day is done, press <strong>Exit kiosk</strong> (top right) or <kbd>Esc</kbd>, then sign in again.</li>
        </ol>
        <p className="muted">Only students with a registered face can check in. Mark the others with "Mark by hand".</p>
        {rooms && rooms.length > 0 && (
          <div className="form-group" style={{ maxWidth: 360 }}>
            <label>Where is this camera?</label>
            <select value={room} onChange={e => setRoom(e.target.value)}>
              <option value="">School entrance (whole-day attendance)</option>
              {rooms.map(r => <option key={r} value={r}>Classroom door: {r}</option>)}
            </select>
            {room && <p className="muted">Students are also checked in to the class running in {room}, and appear in the 3D classroom.</p>}
          </div>
        )}
        <button className="btn btn-primary btn-lg" onClick={start}><IconLabel icon="play">Start check-in</IconLabel></button>
      </div>
    </div>
  );
}
