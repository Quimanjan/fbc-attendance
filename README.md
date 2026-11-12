# FBC Attendance System (TypeScript)

Attendance for Fellowship Baptist College with face registration and a kiosk check-in.
Rewritten from the PHP version: **Node.js + Express** server and **React** pages, all in **TypeScript**.
It uses the same MySQL database (`attendance_db`), so your existing students, teachers, classes and records carry over.

## What you need

- **Node.js 20 or newer** (https://nodejs.org, LTS installer). Check with `node -v`.
- **XAMPP MySQL** running (start "MySQL" in the XAMPP Control Panel). Apache is not needed for this version.
- A webcam on the device used for registering faces and for the kiosk.

## Quick start (downloaded from GitHub)

1. Install **Node.js 20+** and **XAMPP**, and start **MySQL** in the XAMPP Control Panel.
2. Download this repo (Code > Download ZIP) and unzip it, or `git clone` it.
3. Double-click **`setup.bat`**. It creates `.env`, installs packages, builds, and loads the sample data
   from `sql/attendance_db.sql` into a new `attendance_db` database (150 students, 13 sections, 12 classes with schedules).
4. Double-click **`start.bat`** and open **http://localhost:3000**. If port 3000 is in use, set `PORT=` in `.env`.
5. Sign in with **admin@fbc.local** / **fbcdemo2026**.

Face data isn't included, so register your own faces under Students > Face before trying the kiosk.
QR cards work right away (Students > Print QR cards). Google sign-in and parent emails only work after
you fill in the Google and Gmail settings in `.env`; set `MAIL_ENABLED=false` to keep emails off.
If an `attendance_db` with students already exists, setup keeps it; `npm run import-db -- --force` replaces it with the sample data.
To share your own data the same way, run `npm run build` then `npm run export-db` (it leaves out face data, sessions and real emails).

## Put it online (Supabase + Vercel)

The app runs on Vercel with its data in a Supabase (Postgres) database. The sample data loads by itself on the first visit.

1. **Supabase:** at https://supabase.com/dashboard create a **New project** (any name, pick a database password, region Singapore).
   When it's ready, press **Connect** at the top, choose **Session pooler**, and copy the connection string.
   Replace `[YOUR-PASSWORD]` in it with the database password.
2. **Vercel:** at https://vercel.com/new import this GitHub repo. Leave the build settings as they are.
3. Before pressing Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Supabase connection string from step 1 |
   | `SESSION_SECRET` | any long random text |
   | `MAIL_ENABLED` | `false` |

4. Press **Deploy**, open the site, and sign in with **admin@fbc.local** / **fbcdemo2026**.
   The first page load takes a few seconds while the tables are created and the sample data is loaded.

The camera works on the Vercel address because it is HTTPS, so the kiosk can be opened on any phone or laptop.
Auto-absent doesn't run on Vercel (there is no always-on server); mark absences in Take Attendance instead.
Any hosted MySQL works too: leave `DATABASE_URL` out and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` and `DB_SSL=true`.
`npm run export-db` writes the sample data for both databases (`sql/attendance_db.sql` and `sql/postgres-data.sql`).

## First-time setup (Windows)

1. Open this folder in a terminal (`C:\xampp\htdocs\attendance_system`): in File Explorer type `cmd` in the address bar and press Enter.
2. Copy `.env.example` to `.env` and fill it in (database, Google sign-in, Gmail).
   - Google Cloud Console → Credentials → your OAuth client → add the redirect URI `http://localhost:3000/auth/google/callback`.
     Create a **new client secret**: the old one was in the PHP code and should be considered exposed.
   - Gmail: create a **new App Password** for the same reason.
   - Put your own email in `ADMIN_EMAILS` so you get the admin role.
3. Run **`setup.bat`** (or `npm install`, `npm run build`, `npm run migrate`).
   The migrate step adds the new tables and columns to `attendance_db` and keeps all existing data. It is safe to run again.
4. Run **`start.bat`** (or `npm start`) and open **http://localhost:3000**.

Keep the terminal window open while the system is in use. To start it automatically, put a shortcut to `start.bat` in the Windows Startup folder (`Win+R` → `shell:startup`).

## Using it

- **Register a face:** Students → **Face** → record the parent/guardian consent → **Start** and follow the 5 poses.
  **Delete face data** on the same page removes it when consent is withdrawn or the student leaves.
- **Kiosk:** on the entrance laptop, sign in → **Face Check-in Kiosk** → **Start kiosk**. This signs you out on that device so students can't open other pages.
  Students look at the camera and blink; the screen shows *Present* or *Late*. **Exit kiosk** (bottom right) returns to sign-in.
- **Record Attendance** still works for manual marking and corrections. It shows each student's check-in time.
  Saving no longer re-sends emails for students whose status didn't change.
- The camera only works at `http://localhost:3000` on the same PC, or over **HTTPS** from another device.

## Classroom (3D)

**Classroom** in the menu shows one room through the day: the class on now (subject, course, year and section, teacher),
who should be there, and the people who have checked in, walking around a 3D model of the room.
When a class period ends the room empties and the next class's list takes over.

- To try it, open Classroom and press **Add sample Room 101** (admins), or run `npm run seed:classroom`.
  It adds 10 mock classes from 7:30 AM to 8:30 PM every day, each with its own teacher and 12 to 18 students
  (mock emails end in `@mock.fbc.local`, student numbers start with `MOCK-`, and none have a parent email).
  `npm run seed:classroom -- --reset` rebuilds it.
- **Demo arrivals** (admins) makes students of the current class walk in a few at a time, without the camera.
- For real check-ins, start the kiosk with **Where is this camera?** set to the room. A student of the class on now
  is checked in for that class (Present within 15 minutes of the start, then Late) and walks into the 3D room.
  Students of another section are told to go to their own class. The whole-day attendance is recorded as before.
- Teachers, and anyone the camera missed, can be marked in with **Mark here** on the Classroom page.
- Your own rooms work too: give class times a room in School Setup > Class times.

## QR cards

Every student has a private QR code (a random code, not their student number). When the camera doesn't recognize
a face, the student holds their card up to the kiosk camera and is checked in the same way, at the entrance or a classroom door.
- **Students > QR** shows one code; **Print QR cards** prints a sheet per section to cut out. A photo of the code on a phone works too.
- **Lost card: make a new code** replaces a student's code, and the old card stops working.
- A card held up to the camera counts once; the same student can't be scanned again (by card or face) for 20 seconds.
- Anyone holding a card can use it, so keep the camera where staff can see it. QR check-ins are marked "with QR code" in Take Attendance.

## How status is decided

| Situation | Result |
|---|---|
| Check-in before the first class + 15 min grace | Present |
| Check-in after that | Late (parent gets the late email) |
| No check-in by `AUTO_ABSENT_TIME` (default 9:00) | Absent (absence email; 3+ absences sends the warning) |
| Marked Absent, then checks in | Changed to Late |
| Teacher already set Present/Late/Excused | Kept; only the arrival time is added |

"First class" comes from the section's schedule for that day (Classes & Sections). With no schedule, `DEFAULT_START_TIME` is used.
Auto-absent runs inside the server every day at `AUTO_ABSENT_TIME`, skips days the section has no classes (or weekends when it has no timetable),
and by default only marks students with a registered face. On holidays, set `AUTO_ABSENT_TIME=` (empty) and restart, or change records to Excused.
Run it by hand with `npm run auto-absent -- --dry-run`.

## Settings (.env)

- `FACE_MATCH_THRESHOLD` (0.45): lower is stricter. If students are often "Not recognized", re-register them in good light first, then try 0.5.
- `LATE_GRACE_MINUTES` (15), `DEFAULT_START_TIME` (07:30), `AUTO_ABSENT_TIME` (09:00).
- `SCAN_COOLDOWN_SECONDS` (20): after a student is scanned by face or QR card, more scans of that same student (by either method, on any kiosk) are ignored for this long. The kiosk shows *Already scanned* instead of recording again.
- `KIOSK_REQUIRE_BLINK` (true): the blink check stops printed photos. Turn off only if your camera can't see blinks.
- `MAIL_ENABLED` (true): set to false while testing so parents aren't emailed.

## Privacy

Only face measurements (128 numbers per sample) are stored, never photos, and matching happens only on this server.
Keep signed consent forms on file, give parents the privacy notice, and delete face data when a student leaves.
The blink check stops photos, not a video played on a phone, so keep the kiosk where staff can see it.

## For developers

- `npm run dev`: server with auto-reload on :3000 and the React dev server on :5173 (open :5173).
- `npm run typecheck`
- `server/`: Express API (`routes/`), Google sign-in (`auth.ts`), emails (`mailer.ts`), face matching (`face.ts`), auto-absent (`jobs/`), database setup (`migrate.ts`).
- `client/`: React pages (`src/pages/`), camera and face-api helpers (`src/faceKit.ts`). Face models are in `client/public/models`.
