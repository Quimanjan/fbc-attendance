-- FBC Attendance: database tables for Postgres (Supabase). The server runs this itself on start
-- (npm run migrate); it is safe to run again. MySQL/XAMPP installs use server/migrate.ts instead.
CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  picture VARCHAR(255),
  role VARCHAR(10) DEFAULT 'teacher' CHECK (role IN ('admin','teacher','student')),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  password_hash VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS teachers (
  teacher_id SERIAL PRIMARY KEY,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  department VARCHAR(100),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  gender VARCHAR(10) CHECK (gender IN ('Male','Female','Other'))
);
CREATE TABLE IF NOT EXISTS classes (
  class_id SERIAL PRIMARY KEY,
  class_name VARCHAR(100) NOT NULL,
  subject VARCHAR(100),
  teacher_id INT REFERENCES teachers(teacher_id) ON DELETE SET NULL,
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sections (
  section_id SERIAL PRIMARY KEY,
  section_name VARCHAR(100) NOT NULL,
  class_id INT REFERENCES classes(class_id) ON DELETE SET NULL,
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  course VARCHAR(100),
  year_level VARCHAR(30)
);
CREATE TABLE IF NOT EXISTS students (
  student_id SERIAL PRIMARY KEY,
  student_no VARCHAR(30) NOT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80),
  last_name VARCHAR(80) NOT NULL,
  course VARCHAR(100),
  gender VARCHAR(10) CHECK (gender IN ('Male','Female','Other')),
  section_id INT REFERENCES sections(section_id) ON DELETE SET NULL,
  parent_email VARCHAR(150),
  face_consent_at TIMESTAMP(0),
  face_consent_by VARCHAR(150),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  year_level VARCHAR(30),
  qr_token VARCHAR(40) UNIQUE
);
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id SERIAL PRIMARY KEY,
  class_id INT REFERENCES classes(class_id) ON DELETE CASCADE,
  section_id INT REFERENCES sections(section_id) ON DELETE CASCADE,
  day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  time_start TIME(0) NOT NULL,
  time_end TIME(0) NOT NULL,
  room VARCHAR(50),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
  attendance_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'Present' CHECK (status IN ('Present','Absent','Late','Excused')),
  recorded_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  time_in TIME(0),
  method VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','face','qr','auto')),
  confidence NUMERIC(4,3),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, date)
);
CREATE TABLE IF NOT EXISTS class_checkins (
  checkin_id SERIAL PRIMARY KEY,
  schedule_id INT NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  person_type VARCHAR(10) NOT NULL CHECK (person_type IN ('student','teacher')),
  person_id INT NOT NULL,
  time_in TIME(0) NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('Present','Late')),
  method VARCHAR(10) NOT NULL CHECK (method IN ('face','qr','manual','demo')),
  confidence NUMERIC(4,3),
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (schedule_id, date, person_type, person_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  notification_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  recipient_email VARCHAR(150) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  sent_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS student_faces (
  face_id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  embedding BYTEA NOT NULL,
  model VARCHAR(50) NOT NULL,
  enrolled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Logins (connect-pg-simple).
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expire ON sessions (expire);
-- Supabase exposes tables through its web API; this app doesn't use that, so keep them closed.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
