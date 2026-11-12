// Mock data for one classroom: 10 classes from 7:30 AM to 8:30 PM, each with its own
// course, year level and section, teacher and students. Runs every day of the week.
//   npm run seed:classroom              add the mock classroom (skipped if it already exists)
//   npm run seed:classroom -- --reset   remove the mock data and add it again
// Mock people use @mock.fbc.local emails and MOCK- student numbers and have no parent email, so no one is emailed.
import { exec, one, pool, query } from '../db.js';
import { migrate } from '../migrate.js';
import { DAYS } from '../util.js';

export const MOCK_ROOM = 'Room 101';

// [start, end, subject, course, year, section, teacher first, last, gender, department]
const PERIODS: [string, string, string, string, string, string, string, string, 'Male' | 'Female', string][] = [
  ['07:30', '09:00', 'Introduction to Programming', 'BSIT', '1st Year', 'A', 'Ramon', 'Dela Cruz', 'Male', 'Computer Studies'],
  ['09:00', '10:00', 'Purposive Communication', 'BSEd English', '1st Year', 'B', 'Liza', 'Manalo', 'Female', 'Education'],
  ['10:00', '11:30', 'Data Structures and Algorithms', 'BSCS', '2nd Year', 'A', 'Paolo', 'Reyes', 'Male', 'Computer Studies'],
  ['11:30', '12:30', 'Old Testament Survey', 'BTh', '1st Year', 'A', 'Samuel', 'Villanueva', 'Male', 'Theology'],
  ['12:30', '14:00', 'Financial Accounting', 'BSA', '2nd Year', 'B', 'Grace', 'Bautista', 'Female', 'Business'],
  ['14:00', '15:00', 'Physical Education 3', 'BPEd', '2nd Year', 'A', 'Mark', 'Santiago', 'Male', 'Education'],
  ['15:00', '16:30', 'Database Systems', 'BSIT', '3rd Year', 'A', 'Andrea', 'Garcia', 'Female', 'Computer Studies'],
  ['16:30', '18:00', 'Principles of Marketing', 'BSBA', '3rd Year', 'B', 'Carlo', 'Mendoza', 'Male', 'Business'],
  ['18:00', '19:30', 'Computer Networks 2', 'BSIT', '4th Year', 'A', 'Joy', 'Navarro', 'Female', 'Computer Studies'],
  ['19:30', '20:30', 'Ethics', 'BSCS', '4th Year', 'B', 'Daniel', 'Aquino', 'Male', 'General Education'],
];

const MALE = ['Juan', 'Miguel', 'Joshua', 'Gabriel', 'Paolo', 'Rafael', 'Nathan', 'Christian', 'Adrian', 'Kyle', 'Bryan', 'Elijah', 'Marco', 'Jericho', 'Ivan'];
const FEMALE = ['Maria', 'Angel', 'Princess', 'Nicole', 'Bea', 'Andrea', 'Hannah', 'Sofia', 'Kristine', 'Jasmine', 'Faith', 'Ella', 'Camille', 'Trisha', 'Joanna'];
const LAST = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Tomas', 'Andrada', 'Castillo', 'Flores', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado'];

const yearNo = (y: string) => y[0];

async function removeMock() {
  // Their schedules and check-ins go with the classes.
  await exec("DELETE FROM students WHERE student_no LIKE 'MOCK-%'");
  const mock = "JOIN classes c ON s.class_id = c.class_id JOIN teachers t ON c.teacher_id = t.teacher_id WHERE t.email LIKE '%@mock.fbc.local'";
  await exec(`DELETE s FROM sections s ${mock}`);
  await exec("DELETE c FROM classes c JOIN teachers t ON c.teacher_id = t.teacher_id WHERE t.email LIKE '%@mock.fbc.local'");
  await exec("DELETE FROM teachers WHERE email LIKE '%@mock.fbc.local'");
}

export async function seedClassroom(reset = false, log = console.log) {
  await migrate(() => {});
  const existing = await one("SELECT COUNT(*) AS n FROM teachers WHERE email LIKE '%@mock.fbc.local'");
  if (Number(existing?.n) > 0 && !reset) { log(`The mock ${MOCK_ROOM} is already there. Use --reset to rebuild it.`); return; }
  await removeMock();

  // A fixed seed, so the same mock names come back after a reset.
  let seed = 7;
  const rand = (n: number) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };

  let students = 0;
  for (const [i, [start, end, subject, course, year, sec, tFirst, tLast, tGender, dept]] of PERIODS.entries()) {
    const t = await exec('INSERT INTO teachers (first_name, last_name, email, department, gender) VALUES (?, ?, ?, ?, ?)',
      [tFirst, tLast, `${tFirst}.${tLast.replace(/\s/g, '')}@mock.fbc.local`.toLowerCase(), dept, tGender]);
    const c = await exec('INSERT INTO classes (class_name, subject, teacher_id) VALUES (?, ?, ?)',
      [subject, subject, t.insertId]);
    const sectionName = `${course} ${yearNo(year)}-${sec}`;
    const s = await exec('INSERT INTO sections (section_name, class_id, course, year_level) VALUES (?, ?, ?, ?)',
      [sectionName, c.insertId, course, year]);
    for (const day of DAYS) {
      await exec('INSERT INTO schedules (class_id, section_id, day_of_week, time_start, time_end, room) VALUES (?, ?, ?, ?, ?, ?)',
        [c.insertId, s.insertId, day, start, end, MOCK_ROOM]);
    }
    const size = 12 + rand(7);   // 12 to 18 students
    for (let n = 1; n <= size; n++) {
      const male = rand(2) === 0;
      const first = (male ? MALE : FEMALE)[rand(15)];
      await exec(`INSERT INTO students (student_no, first_name, last_name, course, year_level, gender, section_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [`MOCK-${String(i + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`, first, LAST[rand(LAST.length)],
         course, year, male ? 'Male' : 'Female', s.insertId]);
      students++;
    }
  }
  const count = await query('SELECT COUNT(*) AS n FROM schedules WHERE room=?', [MOCK_ROOM]);
  log(`${MOCK_ROOM} is ready: 10 classes a day (${count[0].n} schedule rows), 10 teachers, ${students} students.`);
}

if (process.argv[1]?.match(/seedClassroom\.(js|ts)$/)) {
  seedClassroom(process.argv.includes('--reset'))
    .catch(e => { console.error('Seeding failed:', e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
