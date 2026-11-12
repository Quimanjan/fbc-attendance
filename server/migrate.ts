// Creates or upgrades the database. Safe to run any number of times:
//   npm run migrate
// Works on a fresh install and on the database from the old PHP version (data is kept).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { pgPool } from './db.js';

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');   // from dist/server/

const TABLES: Record<string, string> = {
  users: `CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    picture VARCHAR(255),
    role ENUM('admin','teacher','student') DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  teachers: `CREATE TABLE IF NOT EXISTS teachers (
    teacher_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
  classes: `CREATE TABLE IF NOT EXISTS classes (
    class_id INT AUTO_INCREMENT PRIMARY KEY,
    class_name VARCHAR(100) NOT NULL,
    subject VARCHAR(100),
    teacher_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL)`,
  sections: `CREATE TABLE IF NOT EXISTS sections (
    section_id INT AUTO_INCREMENT PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL,
    class_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE SET NULL)`,
  students: `CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    student_no VARCHAR(30) NOT NULL UNIQUE,
    first_name VARCHAR(80) NOT NULL,
    middle_name VARCHAR(80),
    last_name VARCHAR(80) NOT NULL,
    course VARCHAR(100),
    gender ENUM('Male','Female','Other'),
    section_id INT,
    parent_email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE SET NULL)`,
  schedules: `CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT,
    section_id INT,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    time_start TIME NOT NULL,
    time_end TIME NOT NULL,
    room VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE CASCADE)`,
  attendance: `CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('Present','Absent','Late','Excused') NOT NULL DEFAULT 'Present',
    recorded_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (student_id, date),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(user_id) ON DELETE SET NULL)`,
  notifications: `CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    recipient_email VARCHAR(150) NOT NULL,
    subject VARCHAR(255),
    message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE)`,
  student_faces: `CREATE TABLE IF NOT EXISTS student_faces (
    face_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    embedding BLOB NOT NULL,
    model VARCHAR(50) NOT NULL,
    enrolled_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (enrolled_by) REFERENCES users(user_id) ON DELETE SET NULL)`,
  // Who is in the room for one class period. A new period starts empty.
  class_checkins: `CREATE TABLE IF NOT EXISTS class_checkins (
    checkin_id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    date DATE NOT NULL,
    person_type ENUM('student','teacher') NOT NULL,
    person_id INT NOT NULL,
    time_in TIME NOT NULL,
    status ENUM('Present','Late') NOT NULL,
    method ENUM('face','qr','manual','demo') NOT NULL,
    confidence DECIMAL(4,3) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_checkin (schedule_id, date, person_type, person_id),
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE)`,
};

// Columns added for face check-in.
const COLUMNS: [string, string, string][] = [
  ['students', 'year_level', 'VARCHAR(30) NULL'],
  // Email and password sign-in for teachers (set by an admin).
  ['users', 'password_hash', 'VARCHAR(200) NULL'],
  // Classroom view.
  ['sections', 'course', 'VARCHAR(100) NULL'],
  ['sections', 'year_level', 'VARCHAR(30) NULL'],
  ['teachers', 'gender', "ENUM('Male','Female','Other') NULL"],
  ['students', 'face_consent_at', 'TIMESTAMP NULL'],
  ['students', 'face_consent_by', 'VARCHAR(150) NULL'],
  ['attendance', 'time_in', 'TIME NULL'],
  ['attendance', 'method', "ENUM('manual','face','auto') NOT NULL DEFAULT 'manual'"],
  ['attendance', 'confidence', 'DECIMAL(4,3) NULL'],
  // QR code sign-in: a random code per student, printed on their card.
  ['students', 'qr_token', 'VARCHAR(40) NULL UNIQUE'],
  // Student sign-in to their own profile (password set by staff on Edit Student).
  ['students', 'password_hash', 'VARCHAR(200) NULL'],
];

// Choice lists that gained a value: [table, column, new definition, value that must be allowed].
const ENUMS: [string, string, string, string][] = [
  ['attendance', 'method', "ENUM('manual','face','qr','auto') NOT NULL DEFAULT 'manual'", 'qr'],
  ['class_checkins', 'method', "ENUM('face','qr','manual','demo') NOT NULL", 'qr'],
];

export async function migrate(log = console.log) {
  if (pgPool) {
    // Postgres (Supabase): one schema file, written for the current version.
    if (config.db.schema) await pgPool.query(`CREATE SCHEMA IF NOT EXISTS "${config.db.schema.replace(/[^a-z0-9_]/gi, '')}"`);
    await pgPool.query(fs.readFileSync(path.join(sqlDir, 'postgres-schema.sql'), 'utf8'));
    log('Postgres database is ready.');
    return;
  }
  const { database, url: _url, ...conn } = config.db;
  const c = await mysql.createConnection(conn);
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await c.query(`USE \`${database}\``);
  for (const [name, sql] of Object.entries(TABLES)) await c.query(sql);
  for (const [table, column, type] of COLUMNS) {
    const [rows] = await c.query(
      'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
      [database, table, column]);
    if ((rows as unknown[]).length === 0) {
      await c.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
      log(`Added ${table}.${column}`);
    }
  }
  for (const [table, column, type, value] of ENUMS) {
    const [rows] = await c.query(
      'SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
      [database, table, column]);
    const current = (rows as { t: string }[])[0]?.t;
    if (current && !current.includes(`'${value}'`)) {
      await c.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` ${type}`);
      log(`Updated ${table}.${column}`);
    }
  }
  await c.end();
  log(`Database "${database}" is ready.`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  migrate().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
}
