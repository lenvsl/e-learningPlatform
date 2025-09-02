import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";




//gia to video
import multer from "multer";
import path from "path";
import fs from "fs";

// storage config (local filesystem)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/videos";
    fs.mkdirSync(uploadPath, { recursive: true }); // ensure dir exists
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadVideo = multer({ storage });

const uploadPDF = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = "uploads/pdfs";
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
});
//gia to video





const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

app.get("/", (req, res) => {
  res.send("E-learning API running!");
});


//------------------------------
//----------- Users ------------
//------------------------------


// Users endpoint
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, first_name, last_name, role FROM users WHERE NOT is_deleted"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Register new user
app.post("/api/register", async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;

  try {
    // Έλεγχος αν υπάρχει ήδη ο χρήστης
    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Δημιουργία χρήστη
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, passwordHash, first_name, last_name, role || "student"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Kρυφό κλειδί που κρατάει ο server, ώστε να εμπιστεύεται μόνο tokens που ο ίδιος δημιούργησε
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";


// Login user
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Βρίσκουμε τον χρήστη
    const result = await pool.query("SELECT * FROM users WHERE email = $1 AND NOT is_deleted", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Έλεγχος password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Δημιουργία JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//-------------------------------------
//----------- Institutions ------------
//-------------------------------------


// Get all active institutions
app.get("/api/institutions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, website_url, created_at 
       FROM institutions 
       WHERE NOT is_deleted AND is_active
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching institutions:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Get single institution
app.get("/api/institutions/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, name, description, website_url, created_at, updated_at
       FROM institutions 
       WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Institution not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching institution:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Create new institution (admin only)
app.post("/api/institutions", authenticateToken, async (req, res) => {
  const { name, description, website_url } = req.body;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can create institutions" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO institutions (name, description, website_url, is_active) 
       VALUES ($1, $2, $3, TRUE) 
       RETURNING id, name, description, website_url, created_at`,
      [name, description, website_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating institution:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Update institution (admin only)
app.put("/api/institutions/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, website_url, is_active } = req.body;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can update institutions" });
  }

  try {
    const result = await pool.query(
      `UPDATE institutions
       SET name = $1, description = $2, website_url = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND NOT is_deleted
       RETURNING id, name, description, website_url, is_active, updated_at`,
      [name, description, website_url, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Institution not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating institution:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Delete institution (soft delete - admin only)
app.delete("/api/institutions/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can delete institutions" });
  }

  try {
    const result = await pool.query(
      `UPDATE institutions 
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND NOT is_deleted
       RETURNING id, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Institution not found" });
    }

    res.json({ message: "Institution deleted", institution: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting institution:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});




//--------------------------------
//----------- Courses ------------
//--------------------------------


// Get single course by ID
app.get("/api/courses/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, description, short_description, price, currency, difficulty, status, created_at 
       FROM courses 
       WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Create new course (only for lecturers/admins)
app.post("/api/courses", authenticateToken, async (req, res) => {
  const { title, description, short_description, price, difficulty } = req.body;

  // Μόνο lecturer/admin μπορούν να φτιάξουν course
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses (title, description, short_description, price, currency, lecturer_id, difficulty, status) 
       VALUES ($1, $2, $3, $4, 'EUR', $5, $6, 'draft') 
       RETURNING id, title, status`,
      [title, description, short_description, price, req.user.id, difficulty]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Get courses for logged-in student
app.get("/api/my-courses", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can view enrolled courses" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.short_description, ce.status, ce.progress_percentage
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.student_id = $1 AND NOT ce.is_deleted`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching my courses:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Enroll in a course
app.post("/api/enroll/:courseId", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can enroll in courses" });
  }

  try {
    // Check if already enrolled
    const existing = await pool.query(
      `SELECT * FROM course_enrollments WHERE student_id = $1 AND course_id = $2`,
      [req.user.id, courseId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    // Create enrollment
    const result = await pool.query(
      `INSERT INTO course_enrollments (student_id, course_id, status) 
       VALUES ($1, $2, 'active')
       RETURNING id, student_id, course_id, status, enrolled_at`,
      [req.user.id, courseId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error enrolling in course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//-----------------------------------
//----------- Categories ------------
//-----------------------------------

// Get all active categories
app.get("/api/categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, created_at 
       FROM course_categories 
       WHERE NOT is_deleted AND is_active
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching categories:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Get single category
app.get("/api/categories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, name, description, created_at 
       FROM course_categories 
       WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching category:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Create new category (admin only)
app.post("/api/categories", authenticateToken, async (req, res) => {
  const { name, description } = req.body;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can create categories" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO course_categories (name, description, is_active) 
       VALUES ($1, $2, TRUE) 
       RETURNING id, name, description, created_at`,
      [name, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating category:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Update category (admin only)
app.put("/api/categories/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can update categories" });
  }

  try {
    const result = await pool.query(
      `UPDATE course_categories
       SET name = $1, description = $2, is_active = $3, deleted_at = NULL
       WHERE id = $4 AND NOT is_deleted
       RETURNING id, name, description, is_active, deleted_at`,
      [name, description, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating category:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Delete category (soft delete - admin only)
app.delete("/api/categories/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can delete categories" });
  }

  try {
    const result = await pool.query(
      `UPDATE course_categories
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND NOT is_deleted
       RETURNING id, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ message: "Category deleted", category: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting category:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//----------------------------------------
//----------- Course Sections ------------
//----------------------------------------

// Get all sections for a course
app.get("/api/courses/:courseId/sections", async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, description, order_index, is_free, created_at
       FROM course_sections 
       WHERE course_id = $1 AND NOT is_deleted
       ORDER BY order_index ASC`,
      [courseId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching sections:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Create a new section
app.post("/api/courses/:courseId/sections", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { title, description, order_index, is_free } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can add sections" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO course_sections (course_id, title, description, order_index, is_free)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, order_index, created_at`,
      [courseId, title, description, order_index, is_free || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating section:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------
//----------- Lessons ------------
//--------------------------------


// Get all lessons in a section
app.get("/api/sections/:sectionId/lessons", async (req, res) => {
  const { sectionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, description, lesson_type, order_index, is_free, is_downloadable, created_at
       FROM lessons
       WHERE section_id = $1 AND NOT is_deleted
       ORDER BY order_index ASC`,
      [sectionId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching lessons:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Get single lesson
app.get("/api/lessons/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, description, content, lesson_type, video_path, pdf_path, is_free, created_at
       FROM lessons
       WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Create new lesson
app.post("/api/sections/:sectionId/lessons", authenticateToken, async (req, res) => {
  const { sectionId } = req.params;
  const { title, description, content, lesson_type, order_index, is_free, is_downloadable } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can add lessons" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO lessons (section_id, title, description, content, lesson_type, order_index, is_free, is_downloadable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, lesson_type, order_index, created_at`,
      [sectionId, title, description, content, lesson_type, order_index, is_free || false, is_downloadable || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


//------------------------------------------
//----------- Progress Tracking ------------
//------------------------------------------

// Μαρκάρει lesson ως ολοκληρωμένο (ή uncomplete).
// Mark lesson as completed/uncompleted
app.post("/api/lessons/:lessonId/complete", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { is_completed } = req.body;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can track progress" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO lesson_completions (student_id, lesson_id, is_completed, completed_at)
       VALUES ($1, $2, $3, CASE WHEN $3 = true THEN NOW() ELSE NULL END)
       ON CONFLICT (student_id, lesson_id)
       DO UPDATE SET is_completed = $3, completed_at = CASE WHEN $3 = true THEN NOW() ELSE NULL END
       RETURNING student_id, lesson_id, is_completed, completed_at`,
      [req.user.id, lessonId, is_completed]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating lesson completion:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Ενημερώνει την πρόοδο video σε δευτερόλεπτα.
// Update video progress
app.post("/api/lessons/:lessonId/video-progress", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { seconds_watched } = req.body;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can track video progress" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO video_progress (student_id, lesson_id, seconds_watched, last_accessed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (student_id, lesson_id)
       DO UPDATE SET seconds_watched = $3, last_accessed_at = NOW()
       RETURNING student_id, lesson_id, seconds_watched, last_accessed_at`,
      [req.user.id, lessonId, seconds_watched]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating video progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Χρησιμοποιεί το function calculate_course_progress() που υπάρχει στη βάση.
// Get overall course progress
app.get("/api/courses/:courseId/progress", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can view course progress" });
  }

  try {
    const result = await pool.query(
      `SELECT calculate_course_progress($1, $2) AS progress_percentage`,
      [courseId, req.user.id]
    );

    res.json({ courseId, progress: result.rows[0].progress_percentage });
  } catch (err) {
    console.error("❌ Error calculating course progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------
//----------- Quizzes ------------
//--------------------------------


// (Μόνο lecturer/admin) Δημιουργεί quiz για lesson.
app.post("/api/lessons/:lessonId/quizzes", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { title, description } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can create quizzes" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO quizzes (lesson_id, title, description, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, lesson_id, title, description, created_at`,
      [lessonId, title, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Προσθήκη ερώτησης σε quiz.
app.post("/api/quizzes/:quizId/questions", authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { question_text, options, correct_answer } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can add questions" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO quiz_questions (quiz_id, question_text, options, correct_answer, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, quiz_id, question_text, options, correct_answer`,
      [quizId, question_text, JSON.stringify(options), correct_answer]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error adding question:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Φέρνει quiz + ερωτήσεις για lesson.
app.get("/api/lessons/:lessonId/quiz", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;

  try {
    const quizRes = await pool.query(
      `SELECT * FROM quizzes WHERE lesson_id = $1 LIMIT 1`,
      [lessonId]
    );

    if (quizRes.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const quiz = quizRes.rows[0];

    const questionsRes = await pool.query(
      `SELECT id, question_text, options FROM quiz_questions WHERE quiz_id = $1`,
      [quiz.id]
    );

    quiz.questions = questionsRes.rows;
    res.json(quiz);
  } catch (err) {
    console.error("❌ Error fetching quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Ο student απαντά σε quiz → υπολογίζεται το score.
app.post("/api/quizzes/:quizId/attempt", authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { answers } = req.body; // { questionId: answer, ... }

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can attempt quizzes" });
  }

  try {
    // 1. Fetch questions
    const questionsRes = await pool.query(
      `SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );

    const questions = questionsRes.rows;
    if (questions.length === 0) {
      return res.status(404).json({ error: "No questions found for this quiz" });
    }

    // 2. Calculate score
    let correct = 0;
    questions.forEach((q) => {
      if (answers[q.id] && answers[q.id] === q.correct_answer) {
        correct++;
      }
    });

    const score = Math.round((correct / questions.length) * 100);

    // 3. Save attempt
    const attemptRes = await pool.query(
      `INSERT INTO quiz_attempts (student_id, quiz_id, score, started_at, completed_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, student_id, quiz_id, score, completed_at`,
      [req.user.id, quizId, score]
    );

    res.json({ attempt: attemptRes.rows[0], total_questions: questions.length, correct });
  } catch (err) {
    console.error("❌ Error submitting quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει όλα τα attempts του student (ή όλων αν admin/lecturer).
app.get("/api/quizzes/:quizId/attempts", authenticateToken, async (req, res) => {
  const { quizId } = req.params;

  try {
    let result;
    if (req.user.role === "student") {
      result = await pool.query(
        `SELECT id, score, completed_at FROM quiz_attempts
         WHERE quiz_id = $1 AND student_id = $2
         ORDER BY completed_at DESC`,
        [quizId, req.user.id]
      );
    } else if (req.user.role === "lecturer" || req.user.role === "admin") {
      result = await pool.query(
        `SELECT qa.id, qa.score, qa.completed_at, u.first_name, u.last_name
         FROM quiz_attempts qa
         JOIN users u ON u.id = qa.student_id
         WHERE qa.quiz_id = $1
         ORDER BY qa.completed_at DESC`,
        [quizId]
      );
    } else {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching quiz attempts:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});








//-------------------------------------
//----------- Certificates ------------
//-------------------------------------

// Εκδίδει πιστοποιητικό αφού ο μαθητής έχει ολοκληρώσει το course (progress = 100%).
app.post("/api/courses/:courseId/certificate", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can request certificates" });
  }

  try {
    // 1. Check if progress is 100%
    const progressRes = await pool.query(
      `SELECT calculate_course_progress($1, $2) AS progress_percentage`,
      [courseId, req.user.id]
    );

    const progress = progressRes.rows[0].progress_percentage;
    if (progress < 100) {
      return res.status(400).json({ error: "Course not fully completed yet" });
    }

    // 2. Check if already issued
    const existing = await pool.query(
      `SELECT * FROM certificates WHERE course_id = $1 AND user_id = $2`,
      [courseId, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]); // already exists
    }

    // 3. Generate certificate URL (in production θα είναι PDF generator)
    const certUrl = `/certificates/${req.user.id}_${courseId}.pdf`;

    // 4. Insert into DB
    const result = await pool.query(
      `INSERT INTO certificates (user_id, course_id, issued_at, certificate_url)
       VALUES ($1, $2, NOW(), $3)
       RETURNING *`,
      [req.user.id, courseId, certUrl]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error issuing certificate:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Λίστα με όλα τα πιστοποιητικά του μαθητή.
app.get("/api/my-certificates", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have certificates" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.course_id, cr.title AS course_title, c.issued_at, c.certificate_url
       FROM certificates c
       JOIN courses cr ON cr.id = c.course_id
       WHERE c.user_id = $1
       ORDER BY c.issued_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching certificates:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Φέρνει συγκεκριμένο πιστοποιητικό.
app.get("/api/certificates/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM certificates WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching certificate:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});










// //--------------------------------------------------

// // Ο μαθητής ενημερώνει την πρόοδό του για συγκεκριμένο lesson.
// // Update or create progress for a lesson
// app.post("/api/lessons/:lessonId/progress", authenticateToken, async (req, res) => {
//   const { lessonId } = req.params;
//   const { is_completed, progress_percentage } = req.body;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can update progress" });
//   }

//   try {
//     const result = await pool.query(
//       `INSERT INTO progress_tracking (student_id, lesson_id, is_completed, progress_percentage, last_accessed_at)
//        VALUES ($1, $2, $3, $4, NOW())
//        ON CONFLICT (student_id, lesson_id)
//        DO UPDATE SET is_completed = $3, progress_percentage = $4, last_accessed_at = NOW()
//        RETURNING student_id, lesson_id, is_completed, progress_percentage, last_accessed_at`,
//       [req.user.id, lessonId, is_completed, progress_percentage]
//     );

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error updating progress:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Προβολή προόδου μαθητή σε ένα συγκεκριμένο lesson.
// // Get progress for a specific lesson
// app.get("/api/lessons/:lessonId/progress", authenticateToken, async (req, res) => {
//   const { lessonId } = req.params;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can view progress" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT student_id, lesson_id, is_completed, progress_percentage, last_accessed_at
//        FROM progress_tracking
//        WHERE student_id = $1 AND lesson_id = $2`,
//       [req.user.id, lessonId]
//     );

//     if (result.rows.length === 0) {
//       return res.json({ message: "No progress yet" });
//     }

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error fetching progress:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Προβολή προόδου μαθητή σε όλο το course.
// // Get progress for all lessons in a course
// app.get("/api/courses/:courseId/progress", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can view progress" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT l.id AS lesson_id, l.title, 
//               COALESCE(p.is_completed, false) AS is_completed,
//               COALESCE(p.progress_percentage, 0) AS progress_percentage,
//               p.last_accessed_at
//        FROM lessons l
//        JOIN course_sections s ON s.id = l.section_id
//        JOIN courses c ON c.id = s.course_id
//        LEFT JOIN progress_tracking p 
//          ON p.lesson_id = l.id AND p.student_id = $1
//        WHERE c.id = $2 AND NOT l.is_deleted
//        ORDER BY s.order_index, l.order_index`,
//       [req.user.id, courseId]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching course progress:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });




//------------------------------------
//----------- Enrollments ------------
//------------------------------------

// Ο μαθητής εγγράφεται σε course.
// Enroll student in a course
app.post("/api/enroll/:courseId", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can enroll in courses" });
  }

  try {
    // Check if course exists
    const course = await pool.query(
      `SELECT id, price FROM courses WHERE id = $1 AND NOT is_deleted AND status = 'published'`,
      [courseId]
    );
    if (course.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if already enrolled
    const existing = await pool.query(
      `SELECT id FROM course_enrollments WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
      [req.user.id, courseId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Already enrolled" });
    }

    // Create enrollment
    const result = await pool.query(
      `INSERT INTO course_enrollments (student_id, course_id, status) 
       VALUES ($1, $2, 'active') 
       RETURNING id, student_id, course_id, status, enrolled_at`,
      [req.user.id, courseId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error enrolling:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Δες όλα τα courses που έχεις εγγραφεί.
// Get all enrolled courses for logged-in student
app.get("/api/my-enrollments", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can view enrollments" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.short_description, ce.status, ce.enrolled_at
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.student_id = $1 AND NOT ce.is_deleted`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching enrollments:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//---------------------------------
//----------- Reviews ------------
//---------------------------------

// Ο student αφήνει review (μόνο αν έχει enrollment στο course).
app.post("/api/courses/:courseId/reviews", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { rating, comment } = req.body;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can leave reviews" });
  }

  try {
    // Check if student is enrolled
    const enrollment = await pool.query(
      `SELECT * FROM course_enrollments WHERE student_id = $1 AND course_id = $2 AND status = 'active'`,
      [req.user.id, courseId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(403).json({ error: "You must be enrolled to review this course" });
    }

    // Insert or update review
    const result = await pool.query(
      `INSERT INTO course_reviews (student_id, course_id, rating, comment, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (student_id, course_id)
       DO UPDATE SET rating = $3, comment = $4, updated_at = NOW()
       RETURNING id, student_id, course_id, rating, comment, created_at, updated_at`,
      [req.user.id, courseId, rating, comment]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error adding review:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει όλα τα reviews για course + student info.
app.get("/api/courses/:courseId/reviews", async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              u.first_name, u.last_name
       FROM course_reviews r
       JOIN users u ON u.id = r.student_id
       WHERE r.course_id = $1 AND NOT r.is_deleted
       ORDER BY r.created_at DESC`,
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching reviews:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Ο student μπορεί να σβήσει το δικό του review (soft delete).
app.delete("/api/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE course_reviews
       SET is_deleted = TRUE, updated_at = NOW()
       WHERE id = $1 AND student_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Review not found or not yours" });
    }

    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("❌ Error deleting review:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});




//------------------------------------------------
//----------- Analytics (Daily Stats) ------------
//------------------------------------------------


// Λίστα ημερήσιων στατιστικών.
app.get("/api/admin/stats/daily", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admins only" });
  }

  try {
    const result = await pool.query(
      `SELECT stat_date, total_users, active_users, new_enrollments, revenue
       FROM daily_stats
       ORDER BY stat_date DESC
       LIMIT 30`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching stats:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Συνοπτικά στοιχεία.
app.get("/api/admin/stats/summary", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admins only" });
  }

  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'student') AS total_students,
         COUNT(*) FILTER (WHERE role = 'lecturer') AS total_lecturers,
         COUNT(*) FILTER (WHERE role = 'admin') AS total_admins,
         (SELECT COUNT(*) FROM courses WHERE NOT is_deleted) AS total_courses,
         (SELECT COUNT(*) FROM course_enrollments WHERE status='active') AS active_enrollments,
         (SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_status='completed') AS total_revenue
       FROM users`
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching summary stats:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------------------------
//----------- Search (Full-Text Search) ------------
//--------------------------------------------------

// Ψάχνει σε courses + lessons + messages.
app.get("/api/search", authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query parameter q is required" });

  try {
    const courses = await pool.query(
      `SELECT id, title, description, 'course' AS type
       FROM courses
       WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
       LIMIT 10`,
      [q]
    );

    const lessons = await pool.query(
      `SELECT id, title, description, 'lesson' AS type
       FROM lessons
       WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
       LIMIT 10`,
      [q]
    );

    const messages = await pool.query(
      `SELECT id, subject AS title, content AS description, 'message' AS type
       FROM messages
       WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
       LIMIT 10`,
      [q]
    );

    res.json({
      courses: courses.rows,
      lessons: lessons.rows,
      messages: messages.rows,
    });
  } catch (err) {
    console.error("❌ Error performing search:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});




//---------------------------------
//----------- Payments ------------
//---------------------------------


// Δημιουργία πληρωμής για course.
// Create a payment record
app.post("/api/payments", authenticateToken, async (req, res) => {
  const { course_id, amount, currency, method } = req.body;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can make payments" });
  }

  try {
    // Check if course exists
    const course = await pool.query(
      `SELECT id FROM courses WHERE id = $1 AND NOT is_deleted`,
      [course_id]
    );
    if (course.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Insert payment
    const result = await pool.query(
      `INSERT INTO payments (user_id, course_id, amount, currency, payment_status, payment_method) 
       VALUES ($1, $2, $3, $4, 'completed', $5)
       RETURNING id, user_id, course_id, amount, currency, payment_status, payment_method, created_at`,
      [req.user.id, course_id, amount, currency || "EUR", method || "credit_card"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating payment:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Ιστορικό πληρωμών του χρήστη.
// Get my payment history
app.get("/api/my-payments", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can view payments" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, c.title AS course_title, p.amount, p.currency, p.payment_status, p.payment_method, p.created_at
       FROM payments p
       JOIN courses c ON c.id = p.course_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching payments:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------------------------------
//----------- Admin Endpoints για Enrollments ------------
//--------------------------------------------------------

// Λίστα με όλες τις εγγραφές μαθητών σε courses.
// Admin: get all enrollments
app.get("/api/admin/enrollments", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view all enrollments" });
  }

  try {
    const result = await pool.query(
      `SELECT ce.id, u.email AS student_email, c.title AS course_title, ce.status, ce.enrolled_at
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.student_id
       JOIN courses c ON c.id = ce.course_id
       WHERE NOT ce.is_deleted
       ORDER BY ce.enrolled_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching enrollments (admin):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Όλοι οι μαθητές για courses που έχει φτιάξει ο lecturer.
// Lecturer: get enrollments for my courses
app.get("/api/lecturer/enrollments", authenticateToken, async (req, res) => {
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can view their enrollments" });
  }

  try {
    const result = await pool.query(
      `SELECT ce.id, u.email AS student_email, c.title AS course_title, ce.status, ce.enrolled_at
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.student_id
       JOIN courses c ON c.id = ce.course_id
       WHERE c.lecturer_id = $1 AND NOT ce.is_deleted
       ORDER BY ce.enrolled_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching enrollments (lecturer):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//-----------------------------------------------------
//----------- Admin Endpoints για Payments ------------
//-----------------------------------------------------

// Όλες οι πληρωμές στην πλατφόρμα.
// Admin: get all payments
app.get("/api/admin/payments", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view all payments" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, u.email AS student_email, c.title AS course_title,
              p.amount, p.currency, p.payment_status, p.payment_method, p.created_at
       FROM payments p
       JOIN users u ON u.id = p.user_id
       JOIN courses c ON c.id = p.course_id
       ORDER BY p.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching payments (admin):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Όλες οι πληρωμές που έγιναν σε courses του lecturer.
// Lecturer: get payments for my courses
app.get("/api/lecturer/payments", authenticateToken, async (req, res) => {
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can view payments" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, u.email AS student_email, c.title AS course_title,
              p.amount, p.currency, p.payment_status, p.payment_method, p.created_at
       FROM payments p
       JOIN users u ON u.id = p.user_id
       JOIN courses c ON c.id = p.course_id
       WHERE c.lecturer_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching payments (lecturer):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Μικρό dashboard με συνολικά στοιχεία.
// Admin: stats overview
app.get("/api/admin/stats", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view stats" });
  }

  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE NOT is_deleted) AS total_users,
        (SELECT COUNT(*) FROM courses WHERE NOT is_deleted) AS total_courses,
        (SELECT COUNT(*) FROM payments) AS total_payments,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_status = 'completed') AS total_revenue
    `);

    res.json(stats.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching stats:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//------------------------------------------------------
//----------- Endpoints για User Management ------------
//------------------------------------------------------

// Λίστα με όλους τους χρήστες
// Admin: get all users
app.get("/api/admin/users", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view users" });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, is_active, created_at 
       FROM users 
       WHERE NOT is_deleted 
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching users:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Admin: get single user
app.get("/api/admin/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view users" });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
       FROM users 
       WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching user:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Admin: create new user
app.post("/api/admin/users", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can create users" });
  }

  const { email, password, first_name, last_name, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, hashedPassword, first_name, last_name, role || "student"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating user:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Admin: update user
app.put("/api/admin/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can update users" });
  }

  const { id } = req.params;
  const { first_name, last_name, role, is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, role = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5 AND NOT is_deleted
       RETURNING id, email, first_name, last_name, role, is_active, updated_at`,
      [first_name, last_name, role, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating user:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Admin: delete (soft delete) user
app.delete("/api/admin/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can delete users" });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND NOT is_deleted
       RETURNING id, email`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted", user: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting user:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//------------------------------------------------
//----------- Notifications Endpoints ------------
//------------------------------------------------

// Φέρνει όλες τις ειδοποιήσεις του logged-in χρήστη.
// Get my notifications
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching notifications:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Μαρκάρει notification ως διαβασμένο.
// Mark notification as read
app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, message, is_read`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating notification:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Admin μπορεί να στείλει ειδοποίηση σε χρήστη (ή μαζικά).
// Admin: send notification to a user
app.post("/api/admin/notifications", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can send notifications" });
  }

  const { user_id, type, message } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, message, is_read) 
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, user_id, type, message, created_at`,
      [user_id, type || "info", message]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating notification:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------------------
//----------- Messaging Endpoints ------------
//--------------------------------------------

// Αποστολή νέου μηνύματος (direct ή announcement ή forum post).
// Send a message
app.post("/api/messages", authenticateToken, async (req, res) => {
  const { recipient_id, course_id, subject, content, message_type, parent_message_id } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id, sent_at`,
      [req.user.id, recipient_id || null, course_id || null, subject || null, content, message_type || "direct_message", parent_message_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error sending message:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Φέρνει όλα τα μηνύματα του χρήστη (εισερχόμενα + απεσταλμένα).
// Get my messages (inbox + sent)
app.get("/api/messages", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.sender_id, s.email AS sender_email,
              m.recipient_id, r.email AS recipient_email,
              m.course_id, c.title AS course_title,
              m.subject, m.content, m.message_type,
              m.parent_message_id, m.is_read, m.is_important, m.sent_at
       FROM messages m
       LEFT JOIN users s ON s.id = m.sender_id
       LEFT JOIN users r ON r.id = m.recipient_id
       LEFT JOIN courses c ON c.id = m.course_id
       WHERE m.sender_id = $1 OR m.recipient_id = $1
       ORDER BY m.sent_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching messages:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει thread συζήτησης (όλα τα replies ενός parent message).
// Get a message thread (all replies)
app.get("/api/messages/thread/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `WITH RECURSIVE thread AS (
         SELECT * FROM messages WHERE id = $1
         UNION ALL
         SELECT m.* FROM messages m
         JOIN thread t ON m.parent_message_id = t.id
       )
       SELECT t.id, t.sender_id, s.email AS sender_email,
              t.recipient_id, r.email AS recipient_email,
              t.subject, t.content, t.message_type,
              t.is_read, t.sent_at
       FROM thread t
       LEFT JOIN users s ON s.id = t.sender_id
       LEFT JOIN users r ON r.id = t.recipient_id
       ORDER BY t.sent_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching thread:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Μαρκάρει μήνυμα ως διαβασμένο.
// Mark message as read
app.put("/api/messages/:id/read", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE messages
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND recipient_id = $2
       RETURNING id, subject, is_read, read_at`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error marking message as read:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Soft delete message
app.delete("/api/messages/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE messages
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)
       RETURNING id, subject`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Message not found or not yours" });
    }

    res.json({ message: "Message deleted", messageData: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting message:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//--------------------------------------
// -------------- Video ----------------
//--------------------------------------
//----------- Upload Routes ------------
//--------------------------------------

// Ανεβάζει video για lesson.
// Upload video for lesson
app.post("/api/lessons/:lessonId/upload/video", authenticateToken, uploadVideo.single("video"), async (req, res) => {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only lecturers/admins can upload videos" });
    }

    const { lessonId } = req.params;
    const file = req.file;

    try {
      await pool.query(
        `UPDATE lessons
         SET video_path = $1, video_filename = $2, video_size = $3, updated_at = NOW()
         WHERE id = $4 AND NOT is_deleted
         RETURNING id, title, video_filename, video_size, video_path`,
        [file.path, file.originalname, file.size, lessonId]
      );

      res.json({ message: "Video uploaded successfully", file });
    } catch (err) {
      console.error("❌ Error uploading video:", err.message);
      res.status(500).json({ error: "Database error" });
    }
  }
);


// Ανεβάζει PDF για lesson.
// Upload PDF for lesson
app.post(
  "/api/lessons/:lessonId/upload/pdf",
  authenticateToken,
  uploadPDF.single("pdf"),
  async (req, res) => {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only lecturers/admins can upload PDFs" });
    }

    const { lessonId } = req.params;
    const file = req.file;

    try {
      await pool.query(
        `UPDATE lessons
         SET pdf_path = $1, pdf_filename = $2, pdf_size = $3, updated_at = NOW()
         WHERE id = $4 AND NOT is_deleted
         RETURNING id, title, pdf_filename, pdf_size, pdf_path`,
        [file.path, file.originalname, file.size, lessonId]
      );

      res.json({ message: "PDF uploaded successfully", file });
    } catch (err) {
      console.error("❌ Error uploading PDF:", err.message);
      res.status(500).json({ error: "Database error" });
    }
  }
);


// Serve Files (static)
// Για να μπορεί το frontend να τα κατεβάζει:
// Έτσι ένα video που αποθηκεύτηκε στο uploads/videos/12345.mp4 θα είναι προσβάσιμο στο: http://localhost:5000/uploads/videos/12345.mp4

app.use("/uploads", express.static("uploads")); // στατικό σερβίρισμα αρχείων





//------------------------------------------
//----------- authenticateToken ------------
//------------------------------------------


// Protected route - μόνο με token
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, first_name, last_name, role FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error in /api/me:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// Middleware για έλεγχο JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token." });
    }
    req.user = user; // βάζουμε τον χρήστη στο request
    next();
  });
}







const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
});