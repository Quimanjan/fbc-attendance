import 'dotenv/config';

function str(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : /^(1|true|yes)$/i.test(v);
}

export const config = {
  port: num('PORT', 3000),
  appUrl: str('APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: str('SESSION_SECRET', 'change-me'),
  tz: str('TZ', 'Asia/Manila'),
  db: {
    // Postgres connection string (Supabase). When set, it is used instead of the MySQL settings below.
    // POSTGRES_URL is what the Supabase integration on Vercel adds by itself.
    url: str('DATABASE_URL') || str('POSTGRES_URL'),
    // Optional: keep the app's tables in their own schema (e.g. when sharing a Supabase project).
    schema: str('DB_SCHEMA'),
    host: str('DB_HOST', 'localhost'),
    port: num('DB_PORT', 3306),
    user: str('DB_USER', 'root'),
    password: str('DB_PASS', ''),
    database: str('DB_NAME', 'attendance_db'),
    // Hosted MySQL (TiDB Cloud, Aiven, PlanetScale...) needs an encrypted connection: DB_SSL=true.
    ssl: bool('DB_SSL', false) ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } as { minVersion?: 'TLSv1.2'; rejectUnauthorized: boolean } : undefined,
  },
  google: {
    clientId: str('GOOGLE_CLIENT_ID'),
    clientSecret: str('GOOGLE_CLIENT_SECRET'),
  },
  adminEmails: str('ADMIN_EMAILS').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
  mail: {
    username: str('MAIL_USERNAME'),
    password: str('MAIL_PASSWORD'),
    fromName: str('MAIL_FROM_NAME', 'FBC Attendance System'),
    enabled: bool('MAIL_ENABLED', true),
  },
  face: {
    threshold: num('FACE_MATCH_THRESHOLD', 0.45),
    margin: num('FACE_MATCH_MARGIN', 0.05),
    lateGraceMinutes: num('LATE_GRACE_MINUTES', 15),
    defaultStartTime: str('DEFAULT_START_TIME', '07:30'),
    autoAbsentTime: str('AUTO_ABSENT_TIME', '09:00'),
    autoAbsentOnlyEnrolled: bool('AUTO_ABSENT_ONLY_FACE_ENROLLED', true),
    requireBlink: bool('KIOSK_REQUIRE_BLINK', true),
    // After a student is scanned (face or QR), more scans of that student are ignored for this long.
    scanCooldownSeconds: num('SCAN_COOLDOWN_SECONDS', 20),
  },
};

// All dates and times in the app use the school's time zone.
process.env.TZ = config.tz;
