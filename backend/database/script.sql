
-----------------------------------------------------------------------------------------------------
--ΔΕ: Μελέτη, σχεδιασμός και υλοποίηση βάσης δεδομένων για πλατφόρμα παροχής διαδικτυακών μαθημάτων--
--------------------------------Educational Platform Database Schema---------------------------------
-----------------------------------------------------------------------------------------------------


-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- (Δεν το χρησιμοποίησα για να κάνω πιο εύκολα testing με μικρά id)
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- Για κρυπτογραφικές λειτουργίες
CREATE EXTENSION IF NOT EXISTS unaccent;


------------- USER -------------

-- User roles enum
CREATE TYPE user_role AS ENUM ('admin', 'lecturer', 'student');
-- DROP TYPE user_role;

ALTER TYPE user_role ADD VALUE 'pending_lecturer';

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(500) NOT NULL,
    password_algorithm VARCHAR(20) DEFAULT 'bcrypt',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    search_vector tsvector,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT password_not_empty CHECK (LENGTH(password_hash) > 0),
    CONSTRAINT check_user_active_deleted CHECK (NOT (is_deleted = TRUE AND is_active = TRUE))
);


-- Add columns to users table
ALTER TABLE users 
ADD COLUMN google_access_token TEXT,
ADD COLUMN google_refresh_token TEXT;

-- Index for faster lookups
CREATE INDEX idx_users_google_tokens ON users(id) 
WHERE google_access_token IS NOT NULL;


-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT token_not_expired CHECK (expires_at > created_at)
);


-- User sessions
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT session_not_expired CHECK (expires_at > created_at)
);



------------- INSTITUTIONS & CATEGORIES -------------

-- Institutions (Σχολές/Ιδρύματα)
CREATE TABLE institutions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    website_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT website_url_valid CHECK (website_url IS NULL OR website_url ~* '^https?://.*')
);


-- Course categories/specializations
CREATE TABLE course_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);



------------- COURSE MANAGEMENT -------------

-- Enums
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE course_status AS ENUM ('draft', 'published', 'archived');
-- Drop type course_status;

-- Courses
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE, -- URL friendly identifier, πχ: "python-programming-beginners", URL-safe (μόνο a-z, 0-9, -)
    description TEXT NOT NULL,
    short_description VARCHAR(500),
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'EUR',
    lecturer_id INT REFERENCES users(id) ON DELETE SET NULL,
    institution_id INT REFERENCES institutions(id) ON DELETE SET NULL,
    category_id INT REFERENCES course_categories(id) ON DELETE SET NULL,
    difficulty difficulty_level DEFAULT 'beginner',
    status course_status DEFAULT 'draft',
    duration_minutes INTEGER DEFAULT 0, -- Συνολική διάρκεια
    max_students INTEGER,
    prerequisites TEXT[], -- Προαπαιτούμενα πχ: ['Βασικές γνώσεις υπολογιστών', 'Αγγλικά B2']
    learning_objectives TEXT[], -- Μαθησιακοί στόχοι πχ: ['Κατανόηση Python syntax', 'Δημιουργία web apps']
    tags TEXT[], -- Tags για search πχ: ['python', 'programming', 'beginners', 'web-development']
    is_deleted BOOLEAN DEFAULT FALSE, -- Soft delete, δε διαγράφουμε οριστικά τα μαθήματα
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector tsvector,
    
    CONSTRAINT positive_price CHECK (price >= 0),
    CONSTRAINT valid_slug CHECK (slug ~* '^[a-z0-9-]+$'),
    CONSTRAINT max_students_positive CHECK (max_students IS NULL OR max_students > 0),
    CONSTRAINT valid_currency CHECK (currency IN ('EUR'))
);
--ALTER TABLE public.courses ALTER COLUMN lecturer_id DROP NOT NULL;


-- Course sections (Ενότητες)
CREATE TABLE course_sections (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL, -- Σειρά εμφάνισης
    is_free BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(course_id, order_index), -- Δεν επιτρέπεται duplicate ordering
    CONSTRAINT positive_order CHECK (order_index >= 0)
);


-- Lesson types
CREATE TYPE lesson_type AS ENUM ('video', 'text', 'pdf', 'quiz', 'assignment');

-- Lessons (Μαθήματα)
CREATE TABLE lessons (
    id SERIAL PRIMARY KEY,
    section_id INT NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE, -- Αν διαγραφεί το section, διαγράφονται αυτόματα και τα lessons του
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT, -- μόνο για τα text lessons
    lesson_type lesson_type NOT NULL DEFAULT 'video',
    order_index INTEGER NOT NULL,
    
    -- Video metadata (file storage - S3/MinIO/filesystem)
    video_path VARCHAR(500), -- S3 key or filesystem path
    video_filename VARCHAR(255),
    video_size BIGINT, -- bytes
    video_duration INTEGER, -- seconds
    video_format VARCHAR(10), -- πχ: mp4, avi, etc.
    video_resolution VARCHAR(20), -- πχ: 1080p, 720p, etc.
    video_thumbnail_path VARCHAR(500), -- Thumbnail image path
    
    pdf_path VARCHAR(500), -- PDF metadata
    pdf_filename VARCHAR(255),
    pdf_size BIGINT,
    
    is_free BOOLEAN DEFAULT FALSE,
    is_downloadable BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector tsvector,
    
    UNIQUE(section_id, order_index), -- σε κάθε section, κάθε order είναι μοναδική
    CONSTRAINT positive_order CHECK (order_index >= 0),
    CONSTRAINT valid_duration CHECK (video_duration IS NULL OR video_duration > 0),
    CONSTRAINT valid_video_size CHECK (video_size IS NULL OR video_size > 0),
    CONSTRAINT valid_pdf_size CHECK (pdf_size IS NULL OR pdf_size > 0),
    CONSTRAINT max_video_size CHECK (video_size IS NULL OR video_size <= 2147483648), -- 2GB
    CONSTRAINT max_pdf_size CHECK (pdf_size IS NULL OR pdf_size <= 52428800) -- 50MB
);


ALTER TABLE lessons 
ADD COLUMN drive_file_id VARCHAR(255);


------------- ENROLLMENTS & PAYMENTS -------------

-- Enrollment status
CREATE TYPE enrollment_status AS ENUM ('active', 'completed', 'cancelled', 'expired');

-- Course enrollments (εγγραφές)
CREATE TABLE course_enrollments (
    id SERIAL PRIMARY KEY,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    status enrollment_status DEFAULT 'active',
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    final_grade DECIMAL(5,2),
    certificate_issued BOOLEAN DEFAULT FALSE, -- αν δόθηκε πιστοποιητικό
    certificate_path VARCHAR(500), -- path του πιστοποιητικού PDF
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- πότε γράφτηκε
    completed_at TIMESTAMP WITH TIME ZONE, -- πότε ολοκλήρωσε
    expires_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(student_id, course_id),
    CONSTRAINT valid_progress CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    CONSTRAINT valid_grade CHECK (final_grade IS NULL OR (final_grade >= 0 AND final_grade <= 100))
);

ALTER TABLE course_enrollments
ADD COLUMN updated_at timestamptz DEFAULT NOW();


-- Enums
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');
CREATE TYPE payment_method AS ENUM ('paypal', 'stripe', 'bank_transfer', 'free');

-- Payments
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE RESTRICT, -- ποια εγγραφή μαθήματος πληρώθηκε
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    payment_method payment_method NOT NULL,
    status payment_status DEFAULT 'pending',
    transaction_id VARCHAR(255), -- ID συναλλαγής από τον πάροχο
    gateway_response JSONB, -- store full gateway response (ολόκληρη απάντηση που επέστρεψε το API του παρόχου)
    refund_amount DECIMAL(10,2) DEFAULT 0.00,
    refund_reason TEXT,
    refunded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_amount CHECK (amount >= 0),
    CONSTRAINT valid_refund CHECK (refund_amount >= 0 AND refund_amount <= amount),
    CONSTRAINT valid_currency CHECK (currency IN ('EUR'))
);


-- Payment attempts
-- Είναι όλα τα logs των προσπαθειών προς τον πάροχο (Στείλαμε αίτημα, απάντησε, πέτυχε/απέτυχε)
CREATE TABLE payment_attempts (
    id SERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    gateway_request JSONB,
    gateway_response JSONB,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_attempt CHECK (attempt_number > 0)
);



-------------- COMMUNICATION SYSTEM --------------

-- Message types
CREATE TYPE message_type AS ENUM ('direct_message', 'announcement');

-- Messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL, -- ποιος στέλνει το μήνυμα
    recipient_id INT REFERENCES users(id) ON DELETE SET NULL, -- ποιος λαμβάνει το direct_message
    course_id INT REFERENCES courses(id) ON DELETE CASCADE, -- σε ποιο μάθημα ανήκει το μήνυμα
    subject VARCHAR(255), -- τίτλος μηνύματος
    content TEXT NOT NULL, -- περιεχόμενο μηνύματος
    message_type message_type DEFAULT 'direct_message',
    parent_message_id INT REFERENCES messages(id) ON DELETE CASCADE, -- αν είναι απάντηση σε άλλο μήνυμα, δείχνει το ID του parent.. έτσι φτιάχνουμε threads συζητήσεων
    is_read BOOLEAN DEFAULT FALSE,
    is_important BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    search_vector tsvector
);

-- Index for fast queries
CREATE INDEX idx_messages_conversation 
ON messages(sender_id, recipient_id, sent_at DESC);

-- Combined index for both directions
CREATE INDEX idx_messages_both_directions 
ON messages(LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), sent_at DESC);


-- Create private_messages table
CREATE TABLE private_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes για performance
CREATE INDEX idx_private_messages_sender ON private_messages(sender_id, sent_at DESC);
CREATE INDEX idx_private_messages_recipient ON private_messages(recipient_id, sent_at DESC);
CREATE INDEX idx_private_messages_conversation 
  ON private_messages(sender_id, recipient_id, sent_at DESC);

-- Index για unread messages
CREATE INDEX idx_private_messages_unread 
  ON private_messages(recipient_id, is_read) 
  WHERE is_read = FALSE;


--4/4/26
CREATE TABLE group_chats (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id)
);

CREATE TABLE group_chat_members (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE group_chat_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE group_chat_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

UPDATE group_chat_members SET last_read_at = NOW() WHERE last_read_at IS NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
UPDATE messages SET read_at = NOW() WHERE read_at IS NULL;


SELECT gc.id, gc.title, gcm.last_read_at,
  EXISTS(SELECT 1 FROM group_chat_messages m 
         WHERE m.chat_id = gc.id 
         AND m.sent_at > COALESCE(gcm.last_read_at, '1970-01-01')
         AND m.sender_id != gcm.user_id) as has_unread
FROM group_chats gc
JOIN group_chat_members gcm ON gcm.chat_id = gc.id
WHERE gcm.user_id = 24;

SELECT sent_at FROM group_chat_messages 
WHERE chat_id = (SELECT id FROM group_chats WHERE title = 'neo ma8ima!!!')
ORDER BY sent_at DESC LIMIT 3;


-------------- RATINGS & REVIEWS --------------

-- Course reviews
CREATE TABLE course_reviews (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL, -- κρατάμε τα reviews
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    is_published BOOLEAN DEFAULT TRUE,
    helpful_votes INTEGER DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(course_id, student_id)
);



-------------- ANALYTICS & STATISTICS --------------

-- τρέχουν στο backend καθε Χ..

-- Daily statistics
CREATE TABLE daily_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE, -- ποια ημέρα αναφέρονται τα στατιστικά (δεν μπορεί να υπάρχει δεύτερη γραμμή για την ίδια ημερομηνία)
    new_users INTEGER DEFAULT 0, -- πόσοι νέοι χρήστες γράφτηκαν εκείνη τη μέρα
    new_enrollments INTEGER DEFAULT 0, -- πόσες νέες εγγραφές σε μαθήματα έγιναν 
    completed_lessons INTEGER DEFAULT 0, -- πόσα lessons ολοκληρώθηκαν εκείνη τη μέρα
    total_revenue DECIMAL(12,2) DEFAULT 0.00, -- συνολικά έσοδα εκείνης της μέρας (μέχρι 10 ψηφία πριν την υποδιαστολή κ 2 μετά)
    active_students INTEGER DEFAULT 0, -- πόσοι διαφορετικοί φοιτητές έκαναν login/κάποια ενέργεια
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_stats CHECK (
        new_users >= 0 AND 
        new_enrollments >= 0 AND 
        completed_lessons >= 0 AND 
        total_revenue >= 0 AND 
        active_students >= 0
    )
);

---------------------------------------------------------------------------------------------------------
-----------------------------------oooooooooooooooKKKKKKKKKKKKKKKKK--------------------------------------
---------------------------------------------------------------------------------------------------------



------------- PROGRESS TRACKING -------------

-- Lesson completion tracking (όταν ολοκληρώνω ένα μάθημα)
CREATE TABLE lesson_completions (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_spent_seconds INTEGER DEFAULT 0,
    
    UNIQUE(enrollment_id, lesson_id),
    CONSTRAINT positive_time CHECK (time_spent_seconds >= 0)
);


/*-- Lesson completion tracking (όταν ολοκληρώνω ένα μάθημα)
CREATE TABLE lesson_completions (
    id SERIAL,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_spent_seconds INTEGER DEFAULT 0,
    
    UNIQUE(enrollment_id, lesson_id, completed_at),
    CONSTRAINT lesson_completions_pk PRIMARY KEY (id, completed_at),
    CONSTRAINT positive_time CHECK (time_spent_seconds >= 0)
) PARTITION BY RANGE (completed_at); -- σπάμε τα δεδομένα σε κομμάτια ανά ημερομηνία για καλύτερη απόδοση

-- Τα κομμάτια για lesson_completions
CREATE TABLE lesson_completions_2024 PARTITION OF lesson_completions
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE lesson_completions_2025 PARTITION OF lesson_completions
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');*/


-- Video watch progress (που σταμάτησα σε κάποιο βίντεο)
CREATE TABLE video_progress (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    current_time_seconds INTEGER DEFAULT 0, -- που έχει φτάσει ο μαθητής
    total_duration_seconds INTEGER DEFAULT 0, -- πόσο διαρκεί συνολικά το βίντεο
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(enrollment_id, lesson_id),
    CONSTRAINT valid_progress_time CHECK (current_time_seconds >= 0),
    CONSTRAINT valid_duration CHECK (total_duration_seconds >= 0),
    CONSTRAINT progress_within_duration CHECK (current_time_seconds <= total_duration_seconds)
);
--  η λογική θα υλοποιηθεί στο backend


-------------- ASSESSMENTS & CERTIFICATIONS -------------

-- Quiz types
CREATE TYPE quiz_type AS ENUM ('practice', 'final_exam');

-- Quizzes
CREATE TABLE quizzes (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_id INT REFERENCES course_sections(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    quiz_type quiz_type DEFAULT 'practice',
    time_limit_minutes INTEGER,
    max_attempts INTEGER DEFAULT 1, -- πόσες φορές μπορεί να το δώσει ο φοιτητής
    passing_grade DECIMAL(5,2) DEFAULT 70.00, -- ποσοστό επιτυχίας
    show_correct_answers BOOLEAN DEFAULT TRUE,
    available_from TIMESTAMP WITH TIME ZONE,
    available_until TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT positive_time_limit CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    CONSTRAINT positive_attempts CHECK (max_attempts > 0),
    CONSTRAINT valid_passing_grade CHECK (passing_grade >= 0 AND passing_grade <= 100),
    CONSTRAINT valid_availability CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from)
);

ALTER TABLE quizzes
ADD COLUMN lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE;


-- Question types
CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'text_input', 'essay');

-- Quiz questions
CREATE TABLE quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type question_type DEFAULT 'multiple_choice',
    points DECIMAL(5,2) DEFAULT 1.00,
    order_index INTEGER NOT NULL,
    explanation TEXT,
    options JSONB, -- αν είναι multiple choice αποθηκεύονται έτσι: [{"text": "Option A", "is_correct": true}, ...]
    correct_answer TEXT, -- για text input ερωτήσεις
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(quiz_id, order_index),
    CONSTRAINT positive_points CHECK (points > 0),
    CONSTRAINT positive_order CHECK (order_index >= 0)
);

ALTER TYPE question_type ADD VALUE 'single_choice';
ALTER TYPE question_type ADD VALUE 'text';



-- Student quiz attempts
CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE, -- ποιος φοιτητής
    quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    score DECIMAL(5,2) DEFAULT 0.00,
    max_possible_score DECIMAL(5,2) NOT NULL,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    passed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    time_taken_seconds INTEGER,
    answers JSONB, -- απάντηση: {"question_id": "answer", ...}, πχ: {"q1": "Option A", ...}
    
    UNIQUE(enrollment_id, quiz_id, attempt_number),
    CONSTRAINT positive_attempt CHECK (attempt_number > 0),
    CONSTRAINT valid_score CHECK (score >= 0),
    CONSTRAINT valid_percentage CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT submitted_after_started CHECK (submitted_at IS NULL OR submitted_at >= started_at)
);

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS answers JSONB;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS needs_grading BOOLEAN DEFAULT false;



/*
-- Student quiz attempts
CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE, -- ποιος φοιτητής
    quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    score DECIMAL(5,2) DEFAULT 0.00,
    max_possible_score DECIMAL(5,2) NOT NULL,
    percentage DECIMAL(5,2) DEFAULT 0.00,
    passed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    time_taken_seconds INTEGER,
    answers JSONB, -- απάντηση: {"question_id": "answer", ...}, πχ: {"q1": "Option A", ...}
    
    UNIQUE(enrollment_id, quiz_id, attempt_number),
    CONSTRAINT positive_attempt CHECK (attempt_number > 0),
    CONSTRAINT valid_score CHECK (score >= 0),
    CONSTRAINT valid_percentage CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT submitted_after_started CHECK (submitted_at IS NULL OR submitted_at >= started_at)
) PARTITION BY RANGE (started_at);


-- Κομμάτια για quiz_attempts
CREATE TABLE quiz_attempts_2024 PARTITION OF quiz_attempts
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE quiz_attempts_2025 PARTITION OF quiz_attempts
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
*/


-- Certificates
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    enrollment_id INT NOT NULL REFERENCES course_enrollments(id) ON DELETE RESTRICT,
    certificate_number VARCHAR(50) NOT NULL UNIQUE,
    final_grade DECIMAL(5,2) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- ημερομηνία έκδοσης
    certificate_path VARCHAR(500), -- που αποθηκεύτηκε το PDF
    is_valid BOOLEAN DEFAULT TRUE, -- αν ισχύει ακόμα
 
    CONSTRAINT valid_final_grade CHECK (final_grade >= 0 AND final_grade <= 100)
);

ALTER TABLE certificates ADD CONSTRAINT certificates_enrollment_id_unique UNIQUE (enrollment_id);


-------------- PERFORMANCE INDEXES --------------

-- User indexes
CREATE INDEX CONCURRENTLY idx_users_email ON users(email) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_users_role ON users(role) WHERE is_active AND NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_users_search ON users USING GIN(search_vector); -- GIN index σε tsvector (search_vector) για full-text search

-- Course indexes
CREATE INDEX CONCURRENTLY idx_courses_lecturer ON courses(lecturer_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_category ON courses(category_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_status ON courses(status) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_published ON courses(published_at) WHERE status = 'published';
CREATE INDEX CONCURRENTLY idx_courses_price ON courses(price) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_courses_tags ON courses USING GIN(tags); -- το tags είναι array ή JSONB πεδίο, αναζητάμε μέσα σε λίστες tags (πχ: ποια courses έχουν tag = "Python")
CREATE INDEX CONCURRENTLY idx_courses_search ON courses USING GIN(search_vector); -- GIN για full-text search στα lessons

-- Enrollment indexes
CREATE INDEX CONCURRENTLY idx_enrollments_student ON course_enrollments(student_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_enrollments_course ON course_enrollments(course_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_enrollments_status ON course_enrollments(status) WHERE NOT is_deleted;

-- Lesson indexes
CREATE INDEX CONCURRENTLY idx_lessons_section ON lessons(section_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_lessons_type ON lessons(lesson_type) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_lessons_search ON lessons USING GIN(search_vector);

-- Progress indexes
CREATE INDEX CONCURRENTLY idx_lesson_completions_enrollment ON lesson_completions(enrollment_id);
CREATE INDEX CONCURRENTLY idx_lesson_completions_date ON lesson_completions(completed_at);
CREATE INDEX CONCURRENTLY idx_video_progress_enrollment ON video_progress(enrollment_id);

-- Quiz indexes
CREATE INDEX CONCURRENTLY idx_quiz_attempts_enrollment ON quiz_attempts(enrollment_id);
CREATE INDEX CONCURRENTLY idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);
CREATE INDEX CONCURRENTLY idx_quiz_questions_quiz ON quiz_questions(quiz_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_quiz_questions_options ON quiz_questions USING GIN(options); -- options JSONB (πχ: multiple choice options), πχ: WHERE options @> '[{"is_correct": true}]')

-- Payment indexes
CREATE INDEX CONCURRENTLY idx_payments_enrollment ON payments(enrollment_id);
CREATE INDEX CONCURRENTLY idx_payments_status ON payments(status);
CREATE INDEX CONCURRENTLY idx_payments_created ON payments(created_at);
CREATE INDEX CONCURRENTLY idx_payments_gateway_response ON payments USING GIN(gateway_response); -- gateway_response: ολόκληρη JSONB απάντηση από PayPal

-- Message indexes
CREATE INDEX CONCURRENTLY idx_messages_sender ON messages(sender_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_messages_recipient ON messages(recipient_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_messages_course ON messages(course_id) WHERE NOT is_deleted;
CREATE INDEX CONCURRENTLY idx_messages_sent_at ON messages(sent_at);
CREATE INDEX CONCURRENTLY idx_messages_search ON messages USING GIN(search_vector); -- GIN για full-text search στα messages



-------------- TRIGGERS & FUNCTIONS --------------

-- Ενημερώνουμε αυτόματα το πεδίο updated_at με την τρέχουσα 
-- ημερομηνία/ώρα κάθε φορά που γίνεται αλλαγή σε μια εγγραφή.

CREATE OR REPLACE FUNCTION update_updated_at_column() -- φτιάχνω την function
RETURNS TRIGGER AS $$ -- η function επιστρέφει TRIGGER
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql; -- η function χρησιμοποιεί γλώσσα plpgsql


-- Triggers
CREATE TRIGGER update_users_2 BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON course_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

   
-- +++++ 8ελουν τρεξιμο ++++++++
   
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
   
CREATE TRIGGER update_course_reviews_updated_at BEFORE UPDATE ON course_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
   
CREATE TRIGGER update_video_progress_updated_at BEFORE UPDATE ON video_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
   
CREATE TRIGGER update_quizzes_updated_at BEFORE UPDATE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
   
-- +++++++++++++
   
   
-- TRIGGER αν το is_deleted γίνεται TRUE, να θέτει is_active = FALSE
   
CREATE OR REPLACE FUNCTION soft_delete_consistency()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE THEN
      NEW.is_active := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_soft_delete_consistency BEFORE UPDATE ON users
	FOR EACH row EXECUTE FUNCTION soft_delete_consistency();

CREATE TRIGGER institutions_soft_delete_consistency BEFORE UPDATE ON institutions
	FOR EACH row EXECUTE FUNCTION soft_delete_consistency();

CREATE TRIGGER course_categories_soft_delete_consistency BEFORE UPDATE ON course_categories
	FOR EACH row EXECUTE FUNCTION soft_delete_consistency();

   
-- Ανανεώνουμε το πεδίο search_vector με τα σωστά δεδομένα

CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'users' THEN -- ειδική μεταβλητή TG_TABLE_NAME της PostgreSQL (κρατάει το όνομα του πίνακα που πυροδότησε το trigger)
        NEW.search_vector := to_tsvector('greek', 
            COALESCE(NEW.first_name, '') || ' ' || 
            COALESCE(NEW.last_name, '') || ' ' || 
            COALESCE(NEW.email, '')
        );
    ELSIF TG_TABLE_NAME = 'courses' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.title, '') || ' ' ||
            COALESCE(NEW.description, '') || ' ' ||
            COALESCE(NEW.short_description, '') || ' ' ||
            COALESCE(array_to_string(NEW.tags, ' '), '') -- πχ: {python, sql, postgres} -> γίνεται "python sql postgres"
        );
    ELSIF TG_TABLE_NAME = 'lessons' THEN
        NEW.search_vector := to_tsvector('greek',
            COALESCE(NEW.title, '') || ' ' ||
            COALESCE(NEW.description, '') || ' ' ||
            COALESCE(NEW.content, '')
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


-- Triggers
CREATE TRIGGER update_users_search_vector BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

CREATE TRIGGER update_courses_search_vector BEFORE INSERT OR UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

CREATE TRIGGER update_lessons_search_vector BEFORE INSERT OR UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

CREATE TRIGGER update_messages_search_vector BEFORE INSERT OR UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();



-------------- FUNCTIONS --------------

-- Function που υπολογίζει όλο τον χώρο που καταλαμβάνουν τα αρχεία 
-- στην πλατφόρμα και επιστρέφει ένα JSON με τα αποτελέσματα.

CREATE OR REPLACE FUNCTION get_storage_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_videos BIGINT := 0;
    total_pdfs BIGINT := 0;
    total_images BIGINT := 0;
    total_trailers BIGINT := 0;
BEGIN
    -- Αθροίζει όλα τα video_size των μαθημάτων
    SELECT COALESCE(SUM(video_size), 0) INTO total_videos 
    FROM lessons WHERE video_path IS NOT NULL AND NOT is_deleted;
    
    -- Αθροίζει όλα τα pdf_size
    SELECT COALESCE(SUM(pdf_size), 0) INTO total_pdfs 
    FROM lessons WHERE pdf_path IS NOT NULL AND NOT is_deleted;
    
    -- Calculate course thumbnails and trailers separately
    SELECT COALESCE(SUM(COALESCE(thumbnail_size, 0)), 0) INTO total_trailers
    FROM courses WHERE NOT is_deleted;
    
    total_images := total_images + total_trailers;
    
    SELECT json_build_object(
        'total_videos_bytes', total_videos,
        'total_pdfs_bytes', total_pdfs,
        'total_images_bytes', total_images,
        'total_storage_bytes', total_videos + total_pdfs + total_images,
        'total_storage_mb', ROUND((total_videos + total_pdfs + total_images)::numeric / 1048576, 2),
        'video_count', (SELECT COUNT(*) FROM lessons WHERE video_path IS NOT NULL AND NOT is_deleted),
        'pdf_count', (SELECT COUNT(*) FROM lessons WHERE pdf_path IS NOT NULL AND NOT is_deleted)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;



/*
-- Function to calculate course progress
CREATE OR REPLACE FUNCTION calculate_course_progress(enrollment_uuid UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_lessons INTEGER;
    completed_lessons INTEGER;
    progress DECIMAL(5,2);
BEGIN
    -- Get total lessons for the course
    SELECT COUNT(l.id) INTO total_lessons
    FROM lessons l
    JOIN course_sections cs   */                     
    


CREATE OR REPLACE FUNCTION calculate_course_progress(p_enrollment_id INTEGER)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    total_lessons INTEGER;
    completed_lessons INTEGER;
    progress DECIMAL(5,2);
BEGIN
    -- Get total lessons for the course of the enrollment
    SELECT COUNT(l.id) INTO total_lessons
    FROM lessons l
    JOIN course_sections cs ON l.section_id = cs.id
    JOIN course_enrollments ce ON cs.course_id = ce.course_id
    WHERE ce.id = p_enrollment_id;

    -- Get completed lessons count for this enrollment
    SELECT COUNT(lp.lesson_id) INTO completed_lessons
    FROM lesson_completions lp
    WHERE lp.enrollment_id = p_enrollment_id AND lp.completed_at IS NOT NULL;

    IF total_lessons = 0 THEN
        progress := 0;
    ELSE
        progress := (completed_lessons::DECIMAL / total_lessons::DECIMAL) * 100;
    END IF;

    RETURN ROUND(progress, 2);
END;
$$ LANGUAGE plpgsql;


    
DROP FUNCTION calculate_course_progress(integer)

 
SELECT calculate_course_progress(2);


SELECT l.id, l.title, l.video_path 
FROM lessons l
JOIN course_sections cs ON l.section_id = cs.id
WHERE cs.course_id = 1;


SELECT google_access_token IS NOT NULL as has_access, 
       google_refresh_token IS NOT NULL as has_refresh,
       LEFT(google_refresh_token, 20) as refresh_preview
FROM users WHERE role = 'lecturer';

   UPDATE users SET google_access_token = NULL, 
                    google_refresh_token = NULL 
   WHERE id = 24;
   
   SELECT google_refresh_token FROM users WHERE role = 'lecturer' OR role = 'admin'
   
   
   SELECT id, email, role, is_deleted, password_hash IS NOT NULL as has_password 
FROM users 
WHERE email LIKE 'eleni%';


SELECT first_name, last_name
FROM users
WHERE email = 'eleni23@gmail.com';

SELECT id, email, first_name, last_name FROM users WHERE email = 'eleni23@gmail.com';

SELECT id, title, video_path, video_url 
FROM lessons 
WHERE video_path IS NOT NULL OR video_url IS NOT NULL;
    
UPDATE lessons SET video_path = video_url 
WHERE video_url IS NOT NULL AND video_path IS NULL;

-- Καθάρισε τα local paths
UPDATE lessons SET video_path = NULL 
WHERE video_path NOT LIKE 'https://%';

-- Καθάρισε το video_url column
UPDATE lessons SET video_url = NULL;

select email from users where role = 'lecturer';



SELECT id, email, role, is_deleted, first_name, last_name 
FROM users 
WHERE email = 'eleni23@gmail.com';

SELECT password_hash FROM users WHERE email = 'eleni23@gmail.com';


UPDATE users 
SET password_hash = '$2b$10$K0H2Uggd4HlEUBo3IqXYcORNgAzglgT/ZPd6QQjgHk4n1OqcFLvE' 
WHERE email = 'eleni23@gmail.com';

$2b$10$K0H2Uggd4HlEUBo3IqXYcORNgAzglgT/ZPd6QQjgHk4n1OqcFLvE







SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quiz_attempts';

SELECT * FROM quiz_attempts WHERE needs_grading = true;


ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS text_grades JSONB;


DELETE FROM certificates 
WHERE enrollment_id IN (
  SELECT id FROM course_enrollments 
  WHERE final_grade = 0 OR final_grade IS NULL
);

DELETE FROM quiz_attempts 
WHERE needs_grading = true AND text_grades IS NULL;




CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  course_id INT REFERENCES courses(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE notification_reads (
  notification_id INT REFERENCES notifications(id) ON DELETE CASCADE,
  student_id INT REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (notification_id, student_id)
);







