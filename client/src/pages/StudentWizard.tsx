import { useCallback, useEffect, useState } from 'react';
import { api, type Student } from '../api';
import { useMessage } from '../hooks';
import { Alert } from '../Layout';
import { Icon } from '../icons';
import { IconLabel, Modal, Stepper } from '../ui';
import { Capture, ConsentForm } from './FaceEnroll';
import { StudentForm } from './StudentForm';

const STEPS = ['Student details', 'Parent consent', 'Register face'];

/**
 * Pop-up that registers a student from start to finish: details, then consent, then the face capture.
 * Pass studentId to pick up an existing student at the consent/face step.
 */
export function StudentWizard({ studentId, onClose, onChanged }: { studentId?: number; onClose: () => void; onChanged: () => void }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [step, setStep] = useState(studentId ? -1 : 0);   // -1 while an existing student loads; 3 = finished
  const [skipped, setSkipped] = useState(false);
  const { msg, run } = useMessage();

  const load = useCallback(async (id: number) => {
    const s = await api<Student>(`/students/${id}`);
    setStudent(s);
    return s;
  }, []);

  useEffect(() => {
    if (!studentId) return;
    load(studentId).then(s => setStep(s.face_consent_at ? 2 : 1)).catch(() => onClose());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, load]);

  const saveDetails = (f: object) => run(async () => {
    const res = await api<{ id: number }>('/students', { body: f });
    onChanged();
    await load(res.id);
    setStep(1);
  });
  const consentDone = async () => { await load(student!.student_id); setStep(2); };
  const faceDone = () => { onChanged(); setTimeout(() => setStep(3), 1200); };
  const skip = () => { setSkipped(true); setStep(3); };

  const name = student ? `${student.first_name} ${student.last_name}` : '';
  const skipBtn = <button type="button" className="btn btn-outline" onClick={skip} title="The student is marked by hand until their face is registered">Skip for now</button>;

  return (
    <Modal title={studentId ? 'Register face' : 'Add a student'} subtitle={name && `${name} · ${student!.student_no}`} onClose={onClose}>
      {step >= 0 && step < 3 && <Stepper steps={STEPS} current={step} />}
      <Alert msg={msg} />

      {step === 0 && <>
        <p className="step-hint">Fill in the student's details. Next you'll record parent consent and register their face.</p>
        <StudentForm submitLabel="Save and continue" onSubmit={saveDetails} onCancel={onClose} />
      </>}

      {step === 1 && student && <>
        <p className="step-hint">Before the camera opens, record who signed the consent form for {name}.</p>
        <ConsentForm student={student} onDone={consentDone} footer={skipBtn} />
      </>}

      {step === 2 && student && <>
        <p className="step-hint">Have {name} sit in front of the camera and follow the arrow: straight, left, right, up, down, then straight again. It takes about 15 seconds.</p>
        <Capture student={student} onSaved={faceDone} footer={skipBtn} />
      </>}

      {step === 3 && (
        <div className="wizard-done">
          <div className={'done-ico' + (skipped ? ' skipped' : '')}><Icon name={skipped ? 'edit' : 'check'} /></div>
          <h3>{skipped ? `${name} is saved` : `${name} is all set`}</h3>
          <p className="muted">{skipped
            ? 'Their face isn\'t registered yet, so mark them by hand for now. Press "Register face" on their row any time to finish.'
            : 'They can now check in at the kiosk by looking at the camera and blinking, or staying still for 5 seconds.'}</p>
          <div className="form-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-outline" onClick={onClose}>Close</button>
            {!studentId && <button className="btn btn-primary" onClick={() => { setStudent(null); setSkipped(false); setStep(0); }}>
              <IconLabel icon="plus">Add another student</IconLabel></button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
