CREATE DATABASE IF NOT EXISTS attendance_db;
USE attendance_db;

CREATE TABLE IF NOT EXISTS users (
    user_id   INT AUTO_INCREMENT PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    email     VARCHAR(150) NOT NULL UNIQUE,
    picture   VARCHAR(255),
    role      ENUM('admin','teacher','student') DEFAULT 'teacher',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teachers (
    teacher_id  INT AUTO_INCREMENT PRIMARY KEY,
    first_name  VARCHAR(80)  NOT NULL,
    last_name   VARCHAR(80)  NOT NULL,
    email       VARCHAR(150) NOT NULL UNIQUE,
    department  VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
    class_id   INT AUTO_INCREMENT PRIMARY KEY,
    class_name VARCHAR(100) NOT NULL,
    subject    VARCHAR(100),
    teacher_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sections (
    section_id   INT AUTO_INCREMENT PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL,
    class_id     INT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS students (
    student_id   INT AUTO_INCREMENT PRIMARY KEY,
    student_no   VARCHAR(30)  NOT NULL UNIQUE,
    first_name   VARCHAR(80)  NOT NULL,
    middle_name  VARCHAR(80),
    last_name    VARCHAR(80)  NOT NULL,
    course       VARCHAR(100),
    gender       ENUM('Male','Female','Other'),
    section_id   INT,
    parent_email VARCHAR(150),
    face_consent_at TIMESTAMP NULL,
    face_consent_by VARCHAR(150) NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    class_id    INT,
    section_id  INT,
    day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
    time_start  TIME NOT NULL,
    time_end    TIME NOT NULL,
    room        VARCHAR(50),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id)   REFERENCES classes(class_id)   ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES sections(section_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id    INT NOT NULL,
    date          DATE NOT NULL,
    status        ENUM('Present','Absent','Late','Excused') NOT NULL DEFAULT 'Present',
    recorded_by   INT,
    time_in       TIME NULL,
    method        ENUM('manual','face','auto') NOT NULL DEFAULT 'manual',
    confidence    DECIMAL(4,3) NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance (student_id, date),
    FOREIGN KEY (student_id)   REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by)  REFERENCES users(user_id) ON DELETE SET NULL
);

-- Face embeddings only (128 numbers per sample); no photos are stored.
CREATE TABLE IF NOT EXISTS student_faces (
    face_id     INT AUTO_INCREMENT PRIMARY KEY,
    student_id  INT NOT NULL,
    embedding   BLOB NOT NULL,
    model       VARCHAR(50) NOT NULL,
    enrolled_by INT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id)  REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (enrolled_by) REFERENCES users(user_id)       ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT NOT NULL,
    recipient_email VARCHAR(150) NOT NULL,
    subject         VARCHAR(255),
    message         TEXT,
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
);

INSERT INTO teachers (first_name, last_name, email, department) VALUES
('Maria', 'Santos', 'maria.santos@school.edu', 'Science'),
('Juan', 'Dela Cruz', 'juan.delacruz@school.edu', 'Mathematics');

INSERT INTO classes (class_name, subject, teacher_id) VALUES
('Grade 11 - STEM', 'General Biology', 1),
('Grade 12 - ABM',  'Business Math',   2);

INSERT INTO sections (section_name, class_id) VALUES
('Section A', 1),
('Section B', 1),
('Section C', 2);

INSERT INTO students (student_no, first_name, middle_name, last_name, course, gender, section_id, parent_email) VALUES
('2024-001', 'Ana',    'Marie',  'Reyes',  'STEM', 'Female', 1, 'parent1@example.com'),
('2024-002', 'Carlos', 'Jose',   'Garcia', 'STEM', 'Male',   1, 'parent2@example.com'),
('2024-003', 'Liza',   'Ann',    'Torres', 'ABM',  'Female', 3, 'parent3@example.com');
