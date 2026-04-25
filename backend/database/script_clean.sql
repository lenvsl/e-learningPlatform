-----------------------------------------------------------------------------------------------------
-- ΔΕ: Μελέτη, σχεδιασμός και υλοποίηση βάσης δεδομένων για πλατφόρμα παροχής διαδικτυακών μαθημάτων
--------------------------------- Educational Platform Database Schema ----------------------------------
-----------------------------------------------------------------------------------------------------


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- Κρυπτογραφικές λειτουργίες (bcrypt hashing)
CREATE EXTENSION IF NOT EXISTS unaccent;    -- Αναζήτηση χωρίς τόνους (ελληνικά)


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role        AS ENUM ('admin', 'lecturer', 'student', 'pending_lecturer');
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE course_status    AS ENUM ('draft', 'published', 'archived');
CREATE TYPE lesson_type      AS ENUM ('video', 'text', 'pdf', 'quiz', 'assignment');
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'cancelled', 'expired');
CREATE TYPE message_type     AS ENUM ('direct_message', 'announcement');
CREATE TYPE quiz_type        AS ENUM ('practice', 'final_exam');
CREATE TYPE question_type    AS ENUM ('multiple_choice', 'true_false', 'text_input', 'essay',
                                      'single_choice', 'text');


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id                   SERIAL PRIMARY KEY,
    email                VARCHAR(255) NOT NULL UNIQUE,
    password_hash        VARCHAR(500) NOT NULL,
    password_algorithm   VARCHAR(20) DEFAULT 'bcrypt',
    first_name           VARCHAR(100) NOT NULL,
    last_name            VARCHAR(100) NOT NULL,
    role                 user_role NOT NULL DEFAULT 'student',
    is_active            BOOLEAN DEFAULT TRUE,
    is_deleted           BOOLEAN DEFAULT FALSE,
    email_verified       BOOLEAN DEFAULT FALSE,
    google_access_token  TEXT,
    google_refresh_token TEXT,
    search_vector        tsvector,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login           TIMESTAMP WITH TIME ZONE,
    deleted_at           TIMESTAMP WITH TIME ZONE,

    CONSTRAINT email_format     CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT password_not_empty CHECK (LENGTH(password_hash) > 0),
    CONSTRAINT check_user_active_deleted CHECK (NOT (is_deleted = TRUE AND is_active = TRUE))
);

-- Index για γρήγορη αναζήτηση google tokens
CREATE INDEX idx_users_google_tokens ON users(id) WHERE google_access_token IS NOT NULL;


-- ============================================================
-- COURSES
-- ============================================================

CREATE TABLE courses (
    id                   SERIAL PRIMARY KEY,
    title                VARCHAR(255) NOT NULL,
    slug                 VARCHAR(255) NOT NULL UNIQUE,   -- URL-safe identifier, πχ: "python-beginners"
    description          TEXT NOT NULL,
    short_description    VARCHAR(500),
    price                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency             VARCHAR(3) DEFAULT 'EUR',
    lecturer_id          INT REFERENCES users(id) ON DELETE SET NULL,
    difficulty           difficulty_level DEFAULT 'beginner',
    status               course_status DEFAULT 'draft',
    duration_minutes     INTEGER DEFAULT 0,
    max_students         INTEGER,
    prerequisites        TEXT[],          -- πχ: ['Βασικές γνώσεις υπολογιστών']
    learning_objectives  TEXT[],          -- πχ: ['Κατανόηση Python syntax']
    tags                 TEXT[],          -- πχ: ['python', 'programming']
    is_deleted           BOOLEAN DEFAULT FALSE,
    published_at         TIMESTAMP WITH TIME ZONE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at           TIMESTAMP WITH TIME ZONE,
    search_vector        tsvector,

    CONSTRAINT positive_price     CHECK (price >= 0),
    CONSTRAINT valid_slug         CHECK (slug ~* '^[a-z0-9-]+$'),
    CONSTRAINT max_students_pos   CHECK (max_students IS NULL OR max_students > 0),
    CONSTRAINT valid_currency     CHECK (currency IN ('EUR'))
);


-- ============================================================
-- COURSE SECTIONS
-- ============================================================

CREATE TABLE course_sections (
    id           SERIAL PRIMARY KEY,
    course_id    INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    order_index  INTEGER NOT NULL,
    is_free      BOOLEAN DEFAULT FALSE,
    is_deleted   BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at   TIMESTAMP WITH TIME ZONE,

    UNIQUE(course_id, order_index),
    CONSTRAINT positive_order CHECK (order_index >= 0)
);


-- ============================================================
-- LESSONS
-- ============================================================

CREATE TABLE lessons (
    id                   SERIAL PRIMARY KEY,
    section_id           INT NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    title                VARCHAR(255) NOT NULL,
    description          TEXT,
    content              TEXT,           -- μόνο για text lessons
    lesson_type          lesson_type NOT NULL DEFAULT 'video',
    order_index          INTEGER NOT NULL,

    -- Video metadata
    video_path           VARCHAR(500),   -- Google Drive URL
    video_filename       VARCHAR(255),
    video_size           BIGINT,         -- bytes
    video_duration       INTEGER,        -- seconds
    video_format         VARCHAR(10),    -- πχ: mp4
    video_resolution     VARCHAR(20),    -- πχ: 1080p
    video_thumbnail_path VARCHAR(500),
    drive_file_id        VARCHAR(255),   -- Google Drive file ID

    -- PDF metadata
    pdf_path             VARCHAR(500),   -- Google Drive URL
    pdf_filename         VARCHAR(255),
    pdf_size             BIGINT,

    is_free              BOOLEAN DEFAULT FALSE,
    is_downloadable      BOOLEAN DEFAULT FALSE,
    is_deleted           BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at           TIMESTAMP WITH TIME ZONE,
    search_vector        tsvector,

    UNIQUE(section_id, order_index),
    CONSTRAINT positive_order    CHECK (order_index >= 0),
    CONSTRAINT valid_duration    CHECK (video_duration IS NULL OR video_duration > 0),
    CONSTRAINT valid_video_size  CHECK (video_size IS NULL OR video_size > 0),
    CONSTRAINT valid_pdf_size    CHECK (pdf_size IS NULL OR pdf_size > 0),
    CONSTRAINT max_video_size    CHECK (video_size IS NULL OR video_size <= 2147483648),  -- 2GB
    CONSTRAINT max_pdf_size      CHECK (pdf_size IS NULL OR pdf_size <= 52428800)         -- 50MB
);


-- ============================================================
-- ENROLLMENTS
-- ============================================================

CREATE TABLE course_enrollments (
    id                   SERIAL PRIMARY KEY,
    student_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id            INT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    status               enrollment_status DEFAULT 'active',
    progress_percentage  DECIMAL(5,2) DEFAULT 0.00,
    final_grade          DECIMAL(5,2),
    certificate_issued   BOOLEAN DEFAULT FALSE,
    certificate_path     VARCHAR(500),
    enrolled_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at         TIMESTAMP WITH TIME ZONE,
    expires_at           TIMESTAMP WITH TIME ZONE,
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_deleted           BOOLEAN DEFAULT FALSE,
    deleted_at           TIMESTAMP WITH TIME ZONE,

    UNIQUE(student_id, course_id),
    CONSTRAINT valid_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    CONSTRAINT valid_grade    CHECK (final_grade IS NULL OR (final_grade >= 0 AND final_grade <= 100))
);


-- ============================================================
-- PROGRESS TRACKING
-- ============================================================

-- Παρακολούθηση ολοκλήρωσης μαθημάτων
CREATE TABLE lesson_completions (
    id               SERIAL PRIMARY KEY,
    enrollment_id    INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id        INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_spent_seconds INTEGER DEFAULT 0,

    UNIQUE(enrollment_id, lesson_id),
    CONSTRAINT positive_time CHECK (time_spent_seconds >= 0)
);


-- ============================================================
-- QUIZZES
-- ============================================================

CREATE TABLE quizzes (
    id                   SERIAL PRIMARY KEY,
    course_id            INT REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id            INT REFERENCES lessons(id) ON DELETE CASCADE,
    title                VARCHAR(255) NOT NULL,
    description          TEXT,
    quiz_type            quiz_type DEFAULT 'practice',
    time_limit_minutes   INTEGER,
    max_attempts         INTEGER DEFAULT 1,
    passing_grade        DECIMAL(5,2) DEFAULT 70.00,
    show_correct_answers BOOLEAN DEFAULT TRUE,
    available_from       TIMESTAMP WITH TIME ZONE,
    available_until      TIMESTAMP WITH TIME ZONE,
    is_deleted           BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at           TIMESTAMP WITH TIME ZONE,

    CONSTRAINT positive_time_limit  CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    CONSTRAINT positive_attempts    CHECK (max_attempts > 0),
    CONSTRAINT valid_passing_grade  CHECK (passing_grade >= 0 AND passing_grade <= 100),
    CONSTRAINT valid_availability   CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from)
);


CREATE TABLE quiz_questions (
    id             SERIAL PRIMARY KEY,
    quiz_id        INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text  TEXT NOT NULL,
    question_type  question_type DEFAULT 'multiple_choice',
    points         DECIMAL(5,2) DEFAULT 1.00,
    order_index    INTEGER NOT NULL,
    explanation    TEXT,
    options        JSONB,   -- πχ: [{"text": "Option A", "is_correct": true}, ...]
    correct_answer TEXT,    -- για text input ερωτήσεις
    is_deleted     BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at     TIMESTAMP WITH TIME ZONE,

    UNIQUE(quiz_id, order_index),
    CONSTRAINT positive_points CHECK (points > 0),
    CONSTRAINT positive_order  CHECK (order_index >= 0)
);


CREATE TABLE quiz_attempts (
    id                 SERIAL PRIMARY KEY,
    enrollment_id      INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    quiz_id            INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_number     INTEGER NOT NULL,
    score              DECIMAL(5,2) DEFAULT 0.00,
    max_possible_score DECIMAL(5,2) NOT NULL,
    percentage         DECIMAL(5,2) DEFAULT 0.00,
    passed             BOOLEAN DEFAULT FALSE,
    needs_grading      BOOLEAN DEFAULT FALSE,
    started_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at       TIMESTAMP WITH TIME ZONE,
    time_taken_seconds INTEGER,
    answers            JSONB,        -- πχ: {"question_id": "answer", ...}
    text_grades        JSONB,        -- βαθμολογία ανοιχτών ερωτήσεων από καθηγητή

    UNIQUE(enrollment_id, quiz_id, attempt_number),
    CONSTRAINT positive_attempt    CHECK (attempt_number > 0),
    CONSTRAINT valid_score         CHECK (score >= 0),
    CONSTRAINT valid_percentage    CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT submitted_after_started CHECK (submitted_at IS NULL OR submitted_at >= started_at)
);


-- ============================================================
-- CERTIFICATES
-- ============================================================

CREATE TABLE certificates (
    id                 SERIAL PRIMARY KEY,
    enrollment_id      INT NOT NULL UNIQUE REFERENCES course_enrollments(id) ON DELETE RESTRICT,
    certificate_number VARCHAR(50) NOT NULL UNIQUE,
    final_grade        DECIMAL(5,2) NOT NULL,
    issued_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    certificate_path   VARCHAR(500),
    is_valid           BOOLEAN DEFAULT TRUE,

    CONSTRAINT valid_final_grade CHECK (final_grade >= 0 AND final_grade <= 100)
);


-- ============================================================
-- MESSAGING (Private Chat)
-- ============================================================

CREATE TABLE messages (
    id               SERIAL PRIMARY KEY,
    sender_id        INT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    recipient_id     INT REFERENCES users(id) ON DELETE SET NULL,
    course_id        INT REFERENCES courses(id) ON DELETE CASCADE,
    subject          VARCHAR(255),
    content          TEXT NOT NULL,
    message_type     message_type DEFAULT 'direct_message',
    parent_message_id INT REFERENCES messages(id) ON DELETE CASCADE,
    is_read          BOOLEAN DEFAULT FALSE,
    is_important     BOOLEAN DEFAULT FALSE,
    is_deleted       BOOLEAN DEFAULT FALSE,
    sent_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at          TIMESTAMP WITH TIME ZONE,
    deleted_at       TIMESTAMP WITH TIME ZONE,
    search_vector    tsvector
);

CREATE INDEX idx_messages_conversation
    ON messages(sender_id, recipient_id, sent_at DESC);

CREATE INDEX idx_messages_both_directions
    ON messages(LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), sent_at DESC);


-- ============================================================
-- GROUP CHAT
-- ============================================================

-- Μία ομαδική συνομιλία ανά μάθημα, δημιουργείται αυτόματα με την εγγραφή
CREATE TABLE group_chats (
    id         SERIAL PRIMARY KEY,
    course_id  INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(course_id)
);

CREATE TABLE group_chat_members (
    id          SERIAL PRIMARY KEY,
    chat_id     INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),   -- τελευταία φορά που διάβασε μηνύματα
    UNIQUE(chat_id, user_id)
);

CREATE TABLE group_chat_messages (
    id         SERIAL PRIMARY KEY,
    chat_id    INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
    sender_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    sent_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

-- Ειδοποιήσεις από καθηγητή σε εγγεγραμμένους φοιτητές μαθήματος
CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Παρακολούθηση ποιοι φοιτητές έχουν διαβάσει κάθε ειδοποίηση
CREATE TABLE notification_reads (
    notification_id INT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    student_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (notification_id, student_id)
);


-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

-- Users
CREATE INDEX CONCURRENTLY idx_users_email  ON users(email) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_users_role   ON users(role)  WHERE is_active AND NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_users_search ON users USING GIN(search_vector);

-- Courses
CREATE INDEX CONCURRENTLY idx_courses_lecturer  ON courses(lecturer_id)  WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_status    ON courses(status)        WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_published ON courses(published_at)  WHERE status = 'published';
CREATE INDEX CONCURRENTLY idx_courses_tags      ON courses USING GIN(tags);
CREATE INDEX CONCURRENTLY idx_courses_search    ON courses USING GIN(search_vector);

-- Enrollments
CREATE INDEX CONCURRENTLY idx_enrollments_student ON course_enrollments(student_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_enrollments_course  ON course_enrollments(course_id)  WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_enrollments_status  ON course_enrollments(status)     WHERE NOT is_deleted;

-- Lessons
CREATE INDEX CONCURRENTLY idx_lessons_section ON lessons(section_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_lessons_type    ON lessons(lesson_type) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_lessons_search  ON lessons USING GIN(search_vector);

-- Progress
CREATE INDEX CONCURRENTLY idx_lesson_completions_enrollment ON lesson_completions(enrollment_id);
CREATE INDEX CONCURRENTLY idx_lesson_completions_date       ON lesson_completions(completed_at);

-- Quizzes
CREATE INDEX CONCURRENTLY idx_quiz_attempts_enrollment ON quiz_attempts(enrollment_id);
CREATE INDEX CONCURRENTLY idx_quiz_attempts_quiz       ON quiz_attempts(quiz_id);
CREATE INDEX CONCURRENTLY idx_quiz_questions_quiz      ON quiz_questions(quiz_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_quiz_questions_options   ON quiz_questions USING GIN(options);

-- Messages
CREATE INDEX CONCURRENTLY idx_messages_sender    ON messages(sender_id)    WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_messages_recipient ON messages(recipient_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_messages_sent_at   ON messages(sent_at);
CREATE INDEX CONCURRENTLY idx_messages_search    ON messages USING GIN(search_vector);


-- ============================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================

-- Αυτόματη ενημέρωση updated_at σε κάθε UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at           BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_courses_updated_at         BEFORE UPDATE ON courses          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sections_updated_at        BEFORE UPDATE ON course_sections  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at         BEFORE UPDATE ON lessons          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_enrollments_updated_at     BEFORE UPDATE ON course_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quizzes_updated_at         BEFORE UPDATE ON quizzes          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Αν is_deleted = TRUE, θέτει αυτόματα is_active = FALSE (soft delete consistency)
CREATE OR REPLACE FUNCTION soft_delete_consistency()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE THEN
        NEW.is_active := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_soft_delete_consistency   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION soft_delete_consistency();
CREATE TRIGGER courses_soft_delete_consistency BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION soft_delete_consistency();


-- Ανανέωση search_vector για full-text search
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'users' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.first_name, '') || ' ' ||
            COALESCE(NEW.last_name,  '') || ' ' ||
            COALESCE(NEW.email,      '')
        );
    ELSIF TG_TABLE_NAME = 'courses' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.title,             '') || ' ' ||
            COALESCE(NEW.description,       '') || ' ' ||
            COALESCE(NEW.short_description, '') || ' ' ||
            COALESCE(array_to_string(NEW.tags, ' '), '')
        );
    ELSIF TG_TABLE_NAME = 'lessons' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.title,       '') || ' ' ||
            COALESCE(NEW.description, '') || ' ' ||
            COALESCE(NEW.content,     '')
        );
    ELSIF TG_TABLE_NAME = 'messages' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.subject, '') || ' ' ||
            COALESCE(NEW.content, '')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_search_vector    BEFORE INSERT OR UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION update_search_vector();
CREATE TRIGGER update_courses_search_vector  BEFORE INSERT OR UPDATE ON courses  FOR EACH ROW EXECUTE FUNCTION update_search_vector();
CREATE TRIGGER update_lessons_search_vector  BEFORE INSERT OR UPDATE ON lessons  FOR EACH ROW EXECUTE FUNCTION update_search_vector();
CREATE TRIGGER update_messages_search_vector BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_search_vector();


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Υπολογισμός ποσοστού προόδου φοιτητή σε μάθημα
CREATE OR REPLACE FUNCTION calculate_course_progress(p_enrollment_id INTEGER)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_lessons     INTEGER;
    completed_lessons INTEGER;
    progress          DECIMAL(5,2);
BEGIN
    SELECT COUNT(l.id) INTO total_lessons
    FROM lessons l
    JOIN course_sections cs ON l.section_id = cs.id
    JOIN course_enrollments ce ON cs.course_id = ce.course_id
    WHERE ce.id = p_enrollment_id AND NOT l.is_deleted;

    SELECT COUNT(lc.lesson_id) INTO completed_lessons
    FROM lesson_completions lc
    WHERE lc.enrollment_id = p_enrollment_id AND lc.completed_at IS NOT NULL;

    IF total_lessons = 0 THEN
        progress := 0;
    ELSE
        progress := (completed_lessons::DECIMAL / total_lessons::DECIMAL) * 100;
    END IF;

    RETURN ROUND(progress, 2);
END;
$$ LANGUAGE plpgsql;
