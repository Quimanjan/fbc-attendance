import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Student } from '../api';
import { useApi, useMessage } from '../hooks';
import { Alert } from '../Layout';
import { IconLabel } from '../ui';
import { StudentForm } from './StudentForm';

export default function StudentEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: s, error } = useApi<Student>(`/students/${id}`);
  const { msg, run } = useMessage();
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!s) return null;
  const save = (f: object) => run(async () => { await api(`/students/${id}`, { method: 'PUT', body: f }); navigate('/students'); });
  return (
    <>
      <Alert msg={msg} />
      <div className="sec-title">Edit Student</div>
      <div className="card">
        <StudentForm initial={s} submitLabel="Save changes" onSubmit={save} />
        <div style={{ marginTop: 12 }}><Link to="/students" className="btn btn-outline btn-sm"><IconLabel icon="back">Back to students</IconLabel></Link></div>
      </div>
    </>
  );
}
