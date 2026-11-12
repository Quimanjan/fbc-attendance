export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/kiosk')) { window.location.href = '/login'; }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed.');
  return data as T;
}

export interface User {
  user_id: number; name: string; email: string; picture: string; role: string; teacher_id: number | null;
}

export interface Student {
  student_id: number; student_no: string; first_name: string; middle_name: string | null; last_name: string;
  course: string | null; year_level: string | null; gender: string | null; section_id: number | null; section_name: string | null;
  parent_email: string | null; face_consent_at: string | null; face_consent_by: string | null; face_samples: number;
}

export const STATUSES = ['Present', 'Absent', 'Late', 'Excused'] as const;
export type Status = typeof STATUSES[number];
export const BADGE: Record<string, string> = {
  Present: 'badge-present', Absent: 'badge-absent', Late: 'badge-late', Excused: 'badge-excused',
};

const pad = (n: number) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const longDate = (date: string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', opts);
export const time12 = (t: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
