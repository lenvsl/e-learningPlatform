import express from "express";  // Εισαγωγή Express framework για να δημιουργήσουμε το server
import dotenv from "dotenv";    // Εισαγωγή της βιβλιοθήκης για να διαβάσουμε μεταβλητές από το .env αρχείο
import cors from "cors";        // Εισαγωγή της βιβλιοθήκης για requests από διαφορετικά domains
import pkg from "pg";           // Εισαγωγή του PostgreSQL client για να συνδεθούμε με τη βάση δεδομένων
import bcrypt from "bcrypt";    // Εισαγωγή της βιβλιοθήκης για κρυπτογράφηση κωδικών
import jwt from "jsonwebtoken"; // Εισαγωγή της βιβλιοθήκης για δημιουργία και επαλήθευση JWT tokens
// Για το video/pdf:
import multer from "multer";    // Εισαγωγή της βιβλιοθήκης για ανέβασμα αρχείων (upload)
import path from "path";        // Εισαγωγή της built-in βιβλιοθήκης Node.js για διαχείριση paths αρχείων
import fs from "fs";            // Εισαγωγή της built-in βιβλιοθήκης Node.js για εργασία με το file system
// import { v4 as uuidv4 } from 'uuid';
import crypto from "crypto";
import cron from "node-cron";
import { createClient } from 'redis';
import http from 'http';
import { Server } from 'socket.io';
import session from 'express-session';      // Διαχείριση sessions
import { RedisStore } from 'connect-redis'; // Αποθήκευση sessions στο Redis

// const bcrypt = require('bcrypt');
// const { v4: uuidv4 } = require('uuid');

const { Pool } = pkg;
dotenv.config();
const app = express();

// ----- ΠΡΟΣΑΡΜΟΓΗ ΤΟΥ EXPRESS SERVER -----
const server = http.createServer(app); // <-- Δημιουργία του http server εδώ

// app.use(cors()); // Εφαρμόζουμε middleware CORS για όλα τα requests
// app.use(express.json()); // Εφαρμόζουμε middleware για να μετατρέπουμε τα JSON bodies σε JavaScript objects


// ----- ΡΥΘΜΙΣΗ SOCKET.IO -----
// Setup Socket.io (CORS: Επέτρεψε το Frontend να συνδεθεί)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Βάλε εδώ το URL του React app σου
    methods: ["GET", "POST"],
    credentials: true                // Σημαντικό για τα sessions/cookies
  }
});

app.use(cors({ origin: "http://localhost:3000", credentials: true })); // Update και το CORS του Express
app.use(express.json());

// α. create redis clients
// δήλωσε/φτιάξε redisClient πριν από το app.use(session(...)). 65
// ----- ΡΥΘΜΙΣΗ REDIS CLIENTS -----
const redisClient = createClient();
const redisSubscriber = redisClient.duplicate(); // <-- Ένας κλώνος ΜΟΝΟ για subscribe

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisSubscriber.on('error', (err) => console.error('❌ Redis Subscriber Error', err));


//γ. session middleware AFTER redisClient is defined
// Session Middleware (Το "Login που αντέχει")
// ----- Session Middleware (Σύνδεση Login με Redis) -----
// ΠΡΟΣΟΧΗ: Αυτό ΠΡΙΝ από τα routes (/api/...)
app.use(session({
    store: new RedisStore({ client: redisClient }), // Αποθήκευση στο Redis
    secret: process.env.SESSION_SECRET || "super_secret_key_change_me", // Κλειδί κρυπτογράφησης
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,               // false για localhost (http), true αν βγεις production (https)
      httpOnly: true,              // Προστασία από XSS attacks
      maxAge: 1000 * 60 * 60 * 24  // Το login διαρκεί 1 μέρα
    },
  })
);

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// // ------- ΔΗΜΙΟΥΡΓΙΑ REDIS CLIENT -------
// // Θα συνδεθεί αυτόματα στο '127.0.0.1:6379'
// const redisClient = createClient();

// // Listener για σφάλματα (αν ξεχάσουμε να τρέξουμε το redis-server.exe)
// redisClient.on('error', (err) => {
//   console.error('❌ Σφάλμα Σύνδεσης Redis:', err.message);
//   console.log('Βεβαιωθείτε ότι ο Redis server τρέχει (redis-server.exe).');
// });



// Ρυθμίσεις για αποθήκευση βίντεο
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/videos";            // Φάκελος για βίντεο
    fs.mkdirSync(uploadPath, { recursive: true });  // Δημιουργεί φάκελο αν δεν υπάρχει
    cb(null, uploadPath);                           // Callback για να ορίσουμε τον προορισμό, oδηγεί τα αρχεία σε αυτόν τον φάκελο
  },
  filename: (req, file, cb) => { 
    // Δημιουργεί μοναδικό όνομα αρχείου για να αποφύγει αντικαταστάσεις
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Διατηρεί την αρχική επέκταση αρχείου (.mp4, .mov, κλπ)
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadVideo = multer({ storage }); // Middleware για ανέβασμα βίντεο

// Ρυθμίσεις για αποθήκευση pdf
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


// ----- ΟΛΑ ΤΑ API ENDPOINTS -----

app.get("/", (req, res) => {
  res.send("E-learning API running!");
});


//------------------------------
//----------- Users ------------
//------------------------------


// Users endpoint
app.get("/api/users", async (req, res) => { // Δημιουργεί endpoint GET στο URL "/api/users"
  try {
    const result = await pool.query(        // await: Περιμένει να ολοκληρωθεί το query πριν προχωρήσει
      "SELECT id, email, first_name, last_name, role FROM users WHERE NOT is_deleted"
    );
    res.json(result.rows); // Στέλνει τα αποτελέσματα ως JSON response
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Register new user
app.post("/api/register", async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body; // Εξαγωγή δεδομένων από το body του request

  try {
    // Έλεγχος αν υπάρχει ήδη ο χρήστης
    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const saltRounds = 10; // Αριθμός επαναλήψεων για την ασφάλεια του hash
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Δημιουργία χρήστη στη βάση
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
// JWT (JSON Web Token) -> τεχνική για αυθεντικοποίηση χρηστών
// Secret: Ένα μυστικό κλειδί που μόνο ο server γνωρίζει
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
    const token = jwt.sign( // jwt.sign(payload, secret, options)
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


// ----------------------------------------
// ------------ Password reset ------------
// ----------------------------------------


// Request Reset (δημιουργία token)
app.post("/api/password-reset/request", async (req, res) => {
  const { email } = req.body;
  try {
    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND NOT is_deleted",
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(200).json({ message: "If email exists, reset link will be sent" }); 
    }

    const userId = userRes.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [userId, token]
    );

    // TODO: send email with reset link
    console.log(`🔗 Reset link: http://localhost:3000/reset?token=${token}`);

    res.json({ message: "Password reset link sent if email exists" });
  } catch (err) {
    console.error("❌ Error requesting reset:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Confirm Reset (νέο password)
app.post("/api/password-reset/confirm", async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const tokenRes = await pool.query(
      `SELECT user_id FROM password_reset_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const userId = tokenRes.rows[0].user_id;
    const hashed = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashed, userId]
    );

    await pool.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Error confirming reset:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// // ----------------------------------------
// // ------------ Password reset ------------
// // ----------------------------------------

// // 1. Request reset (generate token)
// app.post('/api/auth/password/reset-request', async (req, res) => {
//   try {
//     const { email } = req.body;
//     if (!email) return res.status(400).json({ message: 'Email required' });

//     const user = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
//     if (user.rows.length === 0) {
//       // Για λόγους ασφαλείας επιστρέφουμε 200 ακόμα κι αν δεν βρέθηκε user
//       return res.status(200).json({ message: 'If this email exists, a reset link will be sent' });
//     }

//     // const token = uuidv4();
//     const expires = new Date(Date.now() + 3600 * 1000); // 1 ώρα

//     await pool.query(
//       `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
//        VALUES ($1, $2, $3, $4, false)`,
//       [user.rows[0].id, token, expires]
//     );

//     // Σε production: στέλνεις email με το token
//     // Για δοκιμή: επιστρέφουμε το token
//     return res.status(200).json({
//       message: 'Reset token generated',
//       token
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });


// // 2. Confirm reset (set new password)
// app.post('/api/auth/password/reset-confirm', async (req, res) => {
//   try {
//     const { token, newPassword } = req.body;
//     if (!token || !newPassword) {
//       return res.status(400).json({ message: 'Token and new password required' });
//     }

//     const reset = await pool.query(
//       `SELECT * FROM password_reset_tokens WHERE token=$1 AND used=false AND expires_at > now()`,
//       [token]
//     );

//     if (reset.rows.length === 0) {
//       return res.status(400).json({ message: 'Invalid or expired token' });
//     }

//     const userId = reset.rows[0].user_id;
//     const hashed = await bcrypt.hash(newPassword, 10);

//     // Update password
//     await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hashed, userId]);

//     // Mark token as used
//     await pool.query(`UPDATE password_reset_tokens SET used=true WHERE id=$1`, [reset.rows[0].id]);

//     return res.status(200).json({ message: 'Password updated successfully' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
//   }
// });


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
       SET name = $1, description = $2, website_url = $3, is_active = $4
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
  const { title, slug, description, short_description, price, difficulty } = req.body;

  // Μόνο lecturer/admin μπορούν να φτιάξουν course
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses (title, slug, description, short_description, price, currency, lecturer_id, difficulty, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id, title, status`,
      [title, slug, description, short_description, price, 'EUR', req.user.id, difficulty, 'draft']
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


// // Enroll in a course
// app.post("/api/enroll/:courseId", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can enroll in courses" });
//   }

//   try {
//     // Check if already enrolled
//     const existing = await pool.query(
//       `SELECT * FROM course_enrollments WHERE student_id = $1 AND course_id = $2`,
//       [req.user.id, courseId]
//     );

//     if (existing.rows.length > 0) {
//       return res.status(400).json({ error: "Already enrolled in this course" });
//     }

//     // Create enrollment
//     const result = await pool.query(
//       `INSERT INTO course_enrollments (student_id, course_id, status) 
//        VALUES ($1, $2, 'active')
//        RETURNING id, student_id, course_id, status, enrolled_at`,
//       [req.user.id, courseId]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error enrolling in course:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


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
// app.post("/api/courses/:courseId/sections", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;
//   const { title, description, order_index, is_free } = req.body;

//   if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only lecturers or admins can add sections" });
//   }

//   try {
//     const result = await pool.query(
//       `INSERT INTO course_sections (course_id, title, description, order_index, is_free)
//        VALUES ($1, $2, $3, $4, $5)
//        RETURNING id, title, order_index, created_at`,
//       [courseId, title, description, order_index, is_free || false]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error creating section:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

app.post("/api/courses/:courseId/sections", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { title, description, is_free } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can add sections" });
  }

  try {
    // Υπολογισμός μεγαλύτερου order_index για το συγκεκριμένο course
    const maxIndexResult = await pool.query(
      'SELECT COALESCE(MAX(order_index), 0) as max_order FROM course_sections WHERE course_id = $1',
      [courseId]
    );
    const nextOrderIndex = maxIndexResult.rows[0].max_order + 1;

    const result = await pool.query(
      `INSERT INTO course_sections (course_id, title, description, order_index, is_free)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, order_index, created_at`,
      [courseId, title, description, nextOrderIndex, is_free || false]
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


// // Create new lesson
// app.post("/api/sections/:sectionId/lessons", authenticateToken, async (req, res) => {
//   const { sectionId } = req.params;
//   const { title, description, content, lesson_type, order_index, is_free, is_downloadable } = req.body;

//   if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only lecturers or admins can add lessons" });
//   }

//   try {
//     const result = await pool.query(
//       `INSERT INTO lessons (section_id, title, description, content, lesson_type, order_index, is_free, is_downloadable)
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//        RETURNING id, title, lesson_type, order_index, created_at`,
//       [sectionId, title, description, content, lesson_type, order_index, is_free || false, is_downloadable || false]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error creating lesson:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// Create new lesson
app.post("/api/sections/:sectionId/lessons", authenticateToken, async (req, res) => {
  const { sectionId } = req.params;
  const { title, description, content, lesson_type, is_free, is_downloadable } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers or admins can add lessons" });
  }

  try {
    // Βρίσκουμε το μέγιστο order_index για το συγκεκριμένο section
    const maxOrderResult = await pool.query(
      `SELECT COALESCE(MAX(order_index), 0) AS max_order FROM lessons WHERE section_id = $1`,
      [sectionId]
    );
    const nextOrderIndex = maxOrderResult.rows[0].max_order + 1;

    // Κάνουμε το insert με τον υπολογισμένο order_index
    const result = await pool.query(
      `INSERT INTO lessons (section_id, title, description, content, lesson_type, order_index, is_free, is_downloadable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, lesson_type, order_index, created_at`,
      [sectionId, title, description, content, lesson_type, nextOrderIndex, is_free || false, is_downloadable || false]
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

// DEN DOYLEYEI
// Mark lesson as completed/uncompleted
// app.post("/api/lessons/:lessonId/complete", authenticateToken, async (req, res) => {
//   const { lessonId } = req.params;
//   const { is_completed } = req.body;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can track progress" });
//   }

//   try {
//     const result = await pool.query(
//       `INSERT INTO lesson_completions (student_id, lesson_id, is_completed, completed_at)
//        VALUES ($1, $2, $3, CASE WHEN $3 = true THEN NOW() ELSE NULL END)
//        ON CONFLICT (student_id, lesson_id)
//        DO UPDATE SET is_completed = $3, completed_at = CASE WHEN $3 = true THEN NOW() ELSE NULL END
//        RETURNING student_id, lesson_id, is_completed, completed_at`,
//       [req.user.id, lessonId, is_completed]
//     );

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error updating lesson completion:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// δεν δουλευει
// Ενημερώνει την πρόοδο video σε δευτερόλεπτα.
// Update video progress
// app.post("/api/lessons/:lessonId/video-progress", authenticateToken, async (req, res) => {
//   const { lessonId, enrollment_id } = req.params;
//   const { current_time_seconds } = req.body;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can track video progress" });
//   }

//   try {
//     const result = await pool.query(
//       `INSERT INTO video_progress (id, enrollment_id, lesson_id, current_time_seconds, updated_at)
//        VALUES ($1, $2, $3, $4, NOW())
//        ON CONFLICT (id, enrollment_id)
//        DO UPDATE SET current_time_seconds = $4, updated_at = NOW()
//        RETURNING id, enrollment_id, lesson_id, current_time_seconds, updated_at`,
//       [req.user.id, enrollment_id, lessonId, current_time_seconds]
//     );

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error updating video progress:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// Χρησιμοποιεί το function calculate_course_progress() που υπάρχει στη βάση
// Get overall course progress
// app.get("/api/courses/:courseId/progress", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can view course progress" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT calculate_course_progress($1, $2) AS progress_percentage`,
//       [courseId, req.user.id]
//     );

//     res.json({ courseId, progress: result.rows[0].progress_percentage });
//   } catch (err) {
//     console.error("❌ Error calculating course progress:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


app.get("/api/course-progress/:enrollmentId", authenticateToken, async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    const result = await pool.query(
      `SELECT calculate_course_progress($1::INTEGER) AS progress_percentage`,
      [enrollmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Progress not found" });
    }

    res.json({ progress: result.rows[0].progress_percentage });
  } catch (err) {
    console.error("❌ Error calculating course progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


//--------------------------------
//----------- Quizzes ------------
//--------------------------------


// Δημιουργεί quiz για lesson (only for lecturer/admin)
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


// Προσθήκη ερώτησης σε quiz (only for lecturer/admin)
app.post("/api/quizzes/:quizId/questions", authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { question_text, options, correct_answer } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can add questions" });
  }

  try {
    // Βρίσκουμε το μέγιστο order_index στο συγκεκριμένο quiz
    const maxOrderResult = await pool.query(
      `SELECT COALESCE(MAX(order_index), 0) AS max_order FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );
    const nextOrderIndex = maxOrderResult.rows[0].max_order + 1;

    // Κάνουμε το insert με το υπολογισμένο order_index
    const result = await pool.query(
      `INSERT INTO quiz_questions (quiz_id, question_text, options, correct_answer, order_index, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, quiz_id, question_text, options, correct_answer, order_index`,
      [quizId, question_text, JSON.stringify(options), correct_answer, nextOrderIndex]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error adding question:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Φέρνει quiz + ερωτήσεις για lesson
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


// Ο student απαντά σε quiz → υπολογίζεται το score
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
      `INSERT INTO quiz_attempts (id, quiz_id, score, started_at, submitted_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, id, quiz_id, score, submitted_at`,
      [req.user.id, quizId, score]
    );

    res.json({ attempt: attemptRes.rows[0], total_questions: questions.length, correct });
  } catch (err) {
    console.error("❌ Error submitting quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει όλα τα attempts του student (ή όλων αν admin/lecturer)
app.get("/api/quizzes/:quizId/attempts", authenticateToken, async (req, res) => {
  const { quizId } = req.params;

  try {
    let result;
    if (req.user.role === "student") {
      result = await pool.query(
        `SELECT id, score, completed_at FROM quiz_attempts
         WHERE quiz_id = $1 AND id = $2
         ORDER BY submitted_at DESC`,
        [quizId, req.user.id]
      );
    } else if (req.user.role === "lecturer" || req.user.role === "admin") {
      result = await pool.query(
        `SELECT qa.id, qa.score, qa.submitted_at, u.first_name, u.last_name
         FROM quiz_attempts qa
         JOIN users u ON u.id = qa.id
         WHERE qa.quiz_id = $1
         ORDER BY qa.submitted_at DESC`,
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


// Εκδίδει πιστοποιητικό αφού ο μαθητής έχει ολοκληρώσει το course (progress = 100%)
app.post("/api/courses/:courseId/certificate", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  const { enrollmentId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can request certificates" });
  }

  
  try {
    // 1. Check if progress is 100%
    // const progressRes = await pool.query(
    //   `SELECT calculate_course_progress($1, $2) AS progress_percentage`,
    //   [courseId, req.user.id]
    // );

    const progressRes = await pool.query(
      `SELECT calculate_course_progress($1::INTEGER) AS progress_percentage`,
      [enrollmentId]
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


// Λίστα με όλα τα πιστοποιητικά του μαθητή
app.get("/api/my-certificates", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have certificates" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.id, cr.title AS course_title, c.issued_at, c.certificate_path
       FROM certificates c
       JOIN courses cr ON cr.id = c.id
       WHERE c.id = $1
       ORDER BY c.issued_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching certificates:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει συγκεκριμένο πιστοποιητικό
app.get("/api/certificates/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT c.* FROM certificates c
      JOIN course_enrollments ce ON c.enrollment_id = ce.id
      WHERE c.id = $1 AND ce.student_id = $2`,
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


// --------------------------------------------------

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

// Admin/Lecturer - list enrollments for a course
// O admin ή o lecturer βλεπουν τις εγγραφές
app.get("/api/course-enrollments/:courseId", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  // Μόνο admin και lecturer επιτρέπεται να δουν τις εγγραφές
  if (req.user.role !== "admin" && req.user.role !== "lecturer") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Παίρνουμε τις εγγραφές του συγκεκριμένου course μαζί με τα στοιχεία του course
    const result = await pool.query(
      `SELECT ce.id, ce.student_id, u.first_name, u.last_name, u.email, ce.status, ce.enrolled_at,
              c.id AS course_id, c.title AS course_title, c.slug AS course_slug
       FROM course_enrollments ce
       JOIN users u ON ce.student_id = u.id
       JOIN courses c ON ce.course_id = c.id
       WHERE ce.course_id = $1 AND ce.is_deleted = FALSE`,
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching course enrollments:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



// Ο μαθητής εγγράφεται σε course
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


// Δες όλα τα courses που έχεις εγγραφεί
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


// Ο student αφήνει review (μόνο αν έχει enrollment στο course)
app.post("/api/courses/:courseId/reviews", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { rating, review_text } = req.body;

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
      `INSERT INTO course_reviews (student_id, course_id, rating, review_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (student_id, course_id)
       DO UPDATE SET rating = $3, review_text = $4
       RETURNING id, student_id, course_id, rating, review_text, created_at, updated_at`,
      [req.user.id, courseId, rating, review_text]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error adding review:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Φέρνει όλα τα reviews για course + student info
app.get("/api/courses/:courseId/reviews", async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.review_text, r.created_at,
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


// Ο student μπορεί να σβήσει το δικό του review (soft delete)
app.delete("/api/reviews/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE course_reviews
       SET is_deleted = TRUE
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


// Λίστα ημερήσιων στατιστικών
app.get("/api/admin/stats/daily", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admins only" });
  }

  try {
    const result = await pool.query(
      `SELECT created_at, active_students, active_students, new_enrollments, total_revenue
       FROM daily_stats
       ORDER BY created_at DESC
       LIMIT 30`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching stats:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Συνοπτικά στοιχεία
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
         (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='completed') AS total_revenue
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


// Ψάχνει σε courses + lessons + messages
// app.get("/api/search", authenticateToken, async (req, res) => {
//   const { q } = req.query;
//   if (!q) return res.status(400).json({ error: "Query parameter q is required" });

//   try {
//     const courses = await pool.query(
//       `SELECT id, title, description, 'course' AS type
//        FROM courses
//        WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
//        LIMIT 10`,
//       [q]
//     );

//     const lessons = await pool.query(
//       `SELECT id, title, description, 'lesson' AS type
//        FROM lessons
//        WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
//        LIMIT 10`,
//       [q]
//     );

//     const messages = await pool.query(
//       `SELECT id, subject AS title, content AS description, 'message' AS type
//        FROM messages
//        WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
//        LIMIT 10`,
//       [q]
//     );

//     res.json({
//       courses: courses.rows,
//       lessons: lessons.rows,
//       messages: messages.rows,
//     });
//   } catch (err) {
//     console.error("❌ Error performing search:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// Ψάχνει σε courses + lessons + messages
app.get("/api/search", authenticateToken, async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: "Query parameter q is required" });

  let courses = [], lessons = [], messages = [];

  try {
    if (!type || type === "all" || type === "courses") {
      const coursesResult = await pool.query(
        `SELECT id, title, description, 'course' AS type
         FROM courses
         WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
         LIMIT 10`,
        [q]
      );
      courses = coursesResult.rows;
    }

    if (!type || type === "all" || type === "lessons") {
      const lessonsResult = await pool.query(
        `SELECT id, title, description, 'lesson' AS type
         FROM lessons
         WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
         LIMIT 10`,
        [q]
      );
      lessons = lessonsResult.rows;
    }

    if (!type || type === "all" || type === "messages") {
      const messagesResult = await pool.query(
        `SELECT id, subject AS title, content AS description, 'message' AS type
         FROM messages
         WHERE search_vector @@ plainto_tsquery($1) AND NOT is_deleted
         LIMIT 10`,
        [q]
      );
      messages = messagesResult.rows;
    }

    res.json({ courses, lessons, messages });
  } catch (err) {
    console.error("❌ Error performing search:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});



//---------------------------------
//----------- Payments ------------
//---------------------------------


// Δημιουργία πληρωμής για course
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


// Ιστορικό πληρωμών του χρήστη
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


// Λίστα με όλες τις εγγραφές μαθητών σε courses
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


// Όλοι οι μαθητές για courses που έχει φτιάξει ο lecturer
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


// Όλες οι πληρωμές στην πλατφόρμα
// Admin: get all payments
app.get("/api/admin/payments", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can view all payments" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, u.email AS student_email, c.title AS course_title,
              p.amount, p.currency, p.status, p.payment_method, p.created_at
       FROM payments p
       JOIN users u ON u.id = p.id
       JOIN courses c ON c.id = p.id
       ORDER BY p.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching payments (admin):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


// Όλες οι πληρωμές που έγιναν σε courses του lecturer
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


// Μικρό dashboard με συνολικά στοιχεία
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
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
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
       SET first_name = $1, last_name = $2, role = $3, is_active = $4
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

// // Φέρνει όλες τις ειδοποιήσεις του logged-in χρήστη
// // Get my notifications
// app.get("/api/notifications", authenticateToken, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT id, type, message, is_read, created_at
//        FROM notifications
//        WHERE user_id = $1
//        ORDER BY created_at DESC`,
//       [req.user.id]
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching notifications:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Μαρκάρει notification ως διαβασμένο
// // Mark notification as read
// app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       `UPDATE notifications
//        SET is_read = TRUE
//        WHERE id = $1 AND user_id = $2
//        RETURNING id, message, is_read`,
//       [id, req.user.id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "Notification not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error updating notification:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Admin μπορεί να στείλει ειδοποίηση σε χρήστη (ή μαζικά)
// // Admin: send notification to a user
// app.post("/api/admin/notifications", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can send notifications" });
//   }

//   const { user_id, type, message } = req.body;

//   try {
//     const result = await pool.query(
//       `INSERT INTO notifications (user_id, type, message, is_read) 
//        VALUES ($1, $2, $3, FALSE)
//        RETURNING id, user_id, type, message, created_at`,
//       [user_id, type || "info", message]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error creating notification:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


//--------------------------------------------
//----------- Messaging Endpoints ------------
//--------------------------------------------


// Αποστολή νέου μηνύματος (direct ή announcement ή forum post)
// Send a message
// app.post("/api/messages", authenticateToken, async (req, res) => {
//   const { recipient_id, course_id, subject, content, message_type, parent_message_id } = req.body;

//   try {
//     const result = await pool.query(
//       `INSERT INTO messages (sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id)
//        VALUES ($1, $2, $3, $4, $5, $6, $7)
//        RETURNING id, sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id, sent_at`,
//       [req.user.id, recipient_id || null, course_id || null, subject || null, content, message_type || "direct_message", parent_message_id || null]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error sending message:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

app.post("/api/messages", authenticateToken, async (req, res) => {
  const { recipient_id, course_id, subject, content, message_type, parent_message_id } = req.body;

  try {
    if (parent_message_id) {
      const parentCheck = await pool.query(
        "SELECT id FROM messages WHERE id = $1 AND NOT is_deleted", [parent_message_id]
      );
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ error: "Invalid parent_message_id" });
      }
    }

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



// Φέρνει όλα τα μηνύματα του χρήστη (εισερχόμενα + απεσταλμένα)
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


// Φέρνει thread συζήτησης (όλα τα replies ενός parent message)
// Το endpoint δίνει όλα τα μηνύματα ενός νήματος ξεκινώντας από το αρχικό μήνυμα id
// Get a message thread (all replies)
app.get("/api/messages/thread/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;


  // WITH RECURSIVE -> ειδική δομή SQL που επιτρέπει να γράφουμε ερωτήματα που 
  // αναδρομικά "σκαρφαλώνουν" σε ιεραρχικά δεδομένα (όπως δέντρα ή νήματα μηνυμάτων)
  // επιτρέπει σε ένα query να κάνει επανάληψη (recursion) - για δεδομένα με ιεραρχική σχέση
  // UNION ALL: συνενώνει τα αποτελέσματα των δύο SELECT - ΔΕΝ αφαιρεί διπλότυπα 
  // UNION: συνενώνει αποτελέσματα ΚΑΙ αφαιρεί διπλότυπα

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


// Μαρκάρει μήνυμα ως διαβασμένο
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
         SET video_path = $1, video_filename = $2, video_size = $3
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
         SET pdf_path = $1, pdf_filename = $2, pdf_size = $3
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



// Job που τρέχει κάθε 1 ώρα
cron.schedule("1 * * * *", async () => {
  try {
    const query = `
      INSERT INTO daily_stats (date, new_users, new_enrollments,    total_revenue, active_students)
      VALUES (
          CURRENT_DATE,
          (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURRENT_DATE),
          (SELECT COUNT(*) FROM course_enrollments WHERE DATE(enrolled_at) = CURRENT_DATE),
          
          (SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE(created_at) = CURRENT_DATE AND status='completed'),
          (SELECT COUNT(DISTINCT student_id) FROM course_enrollments WHERE DATE(enrolled_at) = CURRENT_DATE)
      )
      ON CONFLICT (date)
      DO UPDATE SET
        new_users = EXCLUDED.new_users,
        new_enrollments = EXCLUDED.new_enrollments,
        
        total_revenue = EXCLUDED.total_revenue,
        active_students = EXCLUDED.active_students,
        created_at = NOW();
    `;
//completed_lessons,
//(SELECT COUNT(*) FROM lesson_completions WHERE DATE(completed_at) = CURRENT_DATE),
//completed_lessons = EXCLUDED.completed_lessons,

    await pool.query(query);
    console.log("✅ Daily stats updated at", new Date().toISOString());
  } catch (err) {
    console.error("❌ Error updating daily stats:", err.message);
  }
});

// δ. io connection (ONLY ONCE)
// ----- ΝΕΑ ΛΟΓΙΚΗ CHAT ME SOCKET.IO -----
// Αυτό τρέχει κάθε φορά που ένας νέος χρήστης συνδέεται από το React
io.on('connection', (socket) => {
  console.log(`🔌 Νέος χρήστης συνδέθηκε: ${socket.id}`);

  // 1. Ο ΧΡΗΣΤΗΣ ΜΠΑΙΝΕΙ ΣΕ ΕΝΑ "ΔΩΜΑΤΙΟ" (π.χ. σε ένα μάθημα)
  socket.on('join_room', async (courseId) => {
    const roomName = `course:${courseId}`;
    socket.join(roomName);
    console.log(`User ${socket.id} μπήκε στο δωμάτιο ${roomName}`);

    // (Προαιρετικό: Στείλτε τα 50 τελευταία μηνύματα από το cache του Redis)
    try {
      const historyKey = `chat_history:${courseId}`;
      const history = await redisClient.lRange(historyKey, 0, 49);

//       const messages = history
//   .map(m => { try { return JSON.parse(m); } catch { return null; } })
//   .filter(Boolean)
//   .reverse();

// socket.emit('chat_history', messages);

      // Στέλνουμε το ιστορικό ΜΟΝΟ στον χρήστη που μόλις μπήκε
      socket.emit('chat_history', history.map(JSON.parse).reverse());
    } catch (e) {
      console.error('Failed to get chat history from Redis', e);
    }
  });

  // 2. Ο ΧΡΗΣΤΗΣ ΣΤΕΛΝΕΙ ΕΝΑ ΜΗΝΥΜΑ
  socket.on('send_message', async (data) => {
    // data = { course_id: 123, content: "Γεια!", sender_id: 1 }
    const { course_id, content, sender_id } = data;
    const roomName = `course:${course_id}`;

    const messageObject = {
      id: null, // Θα το πάρουμε από την Postgres
      sender_id: sender_id,
      course_id: course_id,
      content: content,
      message_type: 'forum_post', // Ή 'direct_message' κλπ.
      sent_at: new Date().toISOString()
    };

    if (!content || !content.trim()) return;

    try {
      // ΒΗΜΑ 2α: ΑΠΟΘΗΚΕΥΣΗ ΣΤΗΝ POSTGRESQL (Μόνιμη Βάση)
      const dbResult = await pool.query(
        `INSERT INTO messages (sender_id, course_id, content, message_type, sent_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`, //
        [sender_id, course_id, content, messageObject.message_type, messageObject.sent_at]
      );
      
      // Αποθήκευση πρώτα σε PostgreSQL και μετά cache/publish → σωστό και “καθαρό” για διπλωματική.


      messageObject.id = dbResult.rows[0].id; // Ενημέρωση του ID

      // ΒΗΜΑ 2β: ΑΠΟΘΗΚΕΥΣΗ ΣΤΟ REDIS CACHE (Για γρήγορο ιστορικό)
      const historyKey = `chat_history:${course_id}`;
      const messageJson = JSON.stringify(messageObject);
      await redisClient.lPush(historyKey, messageJson);
      await redisClient.lTrim(historyKey, 0, 99); // Κράτα μόνο τα 100 τελευταία

      // ΒΗΜΑ 2γ: ΔΗΜΟΣΙΕΥΣΗ ΣΤΟ REDIS (Για Broadcast)
      await redisClient.publish(roomName, messageJson);

    } catch (err) {
      console.error('❌ Error saving/publishing message:', err.message);
      // Ενημέρωσε μόνο τον αποστολέα για το σφάλμα
      socket.emit('message_error', 'Το μήνυμά σας απέτυχε να σταλεί.');
    }
  });

  // 3. Ο ΧΡΗΣΤΗΣ ΑΠΟΣΥΝΔΕΕΤΑΙ
  socket.on('disconnect', () => {
    console.log(`🔌 Ο χρήστης ${socket.id} αποσυνδέθηκε.`);
    // (Εδώ μπορείτε να τον αφαιρέσετε από το HASH 'online_users' του Redis)
  });
});


// // ----- 7. ΝΕΑ ΛΟΓΙΚΗ REDIS SUBSCRIBER -----
// // Αυτή η συνάρτηση τρέχει αυτόνομα και "ακούει" για μηνύματα
// async function setupRedisSubscription() {
//   await redisSubscriber.subscribe('course:*', (message, channel) => {
//     // channel = 'course:123'
//     // message = '{"id": 5, "sender_id": 1, ...}'
    
//     console.log(`Message from Redis on channel ${channel}. Broadcasting to room...`);
    
//     // Στείλτε το μήνυμα σε ΟΛΟΥΣ τους χρήστες (React)
//     // που είναι συνδεδεμένοι στο αντίστοιχο δωμάτιο (π.χ. 'course:123')
//     io.to(channel).emit('new_message', JSON.parse(message));
//   });
// }


// ----- 8. ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ ΕΚΚΙΝΗΣΗΣ -----
// async function startServer() {
//   try {
//     // 1. Σύνδεση στον Redis
//     await redisClient.connect();
//     await redisSubscriber.connect(); // <-- Σύνδεση ΚΑΙ του subscriber
//     console.log('✅ Επιτυχής σύνδεση με τον Redis server (x2)!');

//     // 2. Ξεκίνα να "ακούς" για μηνύματα chat
//     await setupRedisSubscription();
//     console.log('🎧 O Redis Subscriber "ακούει" για μηνύματα chat.');

//     // 3. Σύνδεση στην PostgreSQL
//     await pool.query('SELECT 1');
//     console.log('✅ Επιτυχής σύνδεση με την PostgreSQL!');

//     // 4. Εκκίνηση του Express (πλέον χρησιμοποιούμε το 'server', όχι το 'app')
//     const PORT = process.env.PORT || 5000;
//     server.listen(PORT, () => { // <-- ΑΛΛΑΓΗ: server.listen αντί για app.listen
//       console.log(`🚀 Server running at: http://localhost:${PORT}`);
//     });

//   } catch (err) {
//     console.error('❌ Αποτυχία εκκίνησης του server.');
//     console.error(err);
//     process.exit(1);
//   }
// }

// β. connect redis + setup subscriber BEFORE listen
async function setupRedisSubscription() {
  await redisSubscriber.connect();

  // await redisSubscriber.pSubscribe('course:*', (message, channel) => {
  //   io.to(channel).emit('new_message', JSON.parse(message));
  // });
  await redisSubscriber.pSubscribe('course:*', (message, channel) => {
  try {
    io.to(channel).emit('new_message', JSON.parse(message));
  } catch (e) {
    console.error('Invalid Redis message', e);
  }
});


  console.log('🎧 Redis Subscriber listening on course:*');
}


// ----- ΣΥΝΑΡΤΗΣΗ ΕΚΚΙΝΗΣΗΣ SERVER -----
// Μετατρέπουμε την εκκίνηση σε async function
// για να συνδεθούμε *πρώτα* στις βάσεις μας.

// ε. startServer (ONLY ONCE)
// async function startServer() {
//   await redisClient.connect();
//   await redisSubscriber.connect();
//   await setupRedisSubscription();
//   await pool.query('SELECT 1');
//   server.listen(PORT);
// }
async function startServer() {
  try {
    await redisClient.connect();
    await setupRedisSubscription();
    console.log('✅ Redis connected');

    await pool.query('SELECT 1');
    console.log('✅ PostgreSQL connected');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('❌ Server failed to start', err);
    process.exit(1);
  }
}





//--------------------------------------------------------------------------------

// -------------------------------------------------
// -------------- REAL-TIME CHAT LOGIC -------------
// -------------------------------------------------

// io.on('connection', (socket) => {
//   console.log(`⚡ User connected: ${socket.id}`);

//   // 1. Join Room: Ο φοιτητής μπαίνει στο chat ενός μαθήματος
//   socket.on('join_room', async (courseId) => {
//     const room = `course:${courseId}`;
//     socket.join(room);
//     console.log(`User ${socket.id} joined room: ${room}`);

//     // (Προαιρετικά) Στείλε του τα 20 τελευταία μηνύματα από το Redis Cache
//     try {
//         const cachedMessages = await redisClient.lRange(`chat_history:${courseId}`, 0, 19);
//         // Τα μηνύματα είναι strings, τα κάνουμε parse σε JSON και τα αντιστρέφουμε (παλιά -> νέα)
//         const parsed = cachedMessages.map(msg => JSON.parse(msg)).reverse();
//         socket.emit('previous_messages', parsed);
//     } catch (e) {
//         console.error("Error fetching history", e);
//     }
//   });

//   // 2. Send Message: Ο φοιτητής στέλνει μήνυμα
//   socket.on('send_message', async (data) => {
//     // data = { course_id, sender_id, content, sender_name }
//     const { course_id, sender_id, content, sender_name } = data;
//     const room = `course:${course_id}`;

//     // Δημιουργία αντικειμένου μηνύματος
//     const messageData = {
//       sender_id,
//       sender_name, // Χρήσιμο για να φαίνεται το όνομα στο chat αμέσως
//       content,
//       course_id,
//       created_at: new Date().toISOString(),
//       type: 'live' // ένδειξη ότι είναι live
//     };

//     try {
//       // ΒΗΜΑ Α: Αποθήκευση στη Βάση (PostgreSQL) - Η "Αλήθεια"
//       const dbRes = await pool.query(
//         `INSERT INTO messages (sender_id, course_id, content, sent_at) 
//          VALUES ($1, $2, $3, NOW()) RETURNING id`,
//         [sender_id, course_id, content]
//       );
//       messageData.id = dbRes.rows[0].id; // Προσθέτουμε το πραγματικό ID

//       // ΒΗΜΑ Β: Αποθήκευση στο Redis Cache (Ιστορικό) - Η "Ταχύτητα"
//       // Αποθηκεύουμε ως string
//       await redisClient.lPush(`chat_history:${course_id}`, JSON.stringify(messageData));
//       await redisClient.lTrim(`chat_history:${course_id}`, 0, 99); // Κρατάμε μόνο τα 100 τελευταία

//       // ΒΗΜΑ Γ: Δημοσίευση (Publish) για να το δουν οι άλλοι
//       await redisClient.publish(room, JSON.stringify(messageData));

//     } catch (err) {
//       console.error("❌ Chat Error:", err);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected', socket.id);
//   });
// });




// --- REDIS SUBSCRIBER SETUP (Για να μοιράζει τα μηνύματα) ---
// Αυτό τρέχει μία φορά και "ακούει" όλα τα κανάλια course:*
// async function setupChatSubscriber() {
//     // await redisSubscriber.subscribe('patter', (message, channel) => {
//     //     // Προσοχή: Στην έκδοση redis v4+ το subscribe pattern είναι λίγο διαφορετικό,
//     //     // αλλά για απλότητα θα κάνουμε subscribe σε συγκεκριμένα κανάλια ή θα το χειριστούμε ως εξής:
//     // });
    
//     // Εναλλακτικά, πιο απλά για τώρα:
//     // Κάνουμε pSubscribe (Pattern Subscribe) σε όλα τα "course:*"
//     await redisSubscriber.pSubscribe('course:*', (message, channel) => {
//         // Το channel θα είναι π.χ. "course:15"
//         // Το message είναι το JSON που στείλαμε πριν
//         io.to(channel).emit('receive_message', JSON.parse(message));
//     });
//     console.log("🎧 Redis Subscriber is listening on course:* channels...");
// }

//-----------------------------------------

// ----- 4. ΚΑΛΕΣΜΑ ΤΗΣ ΕΚΚΙΝΗΣΗΣ -----
// Αφαιρέστε το παλιό "app.listen(PORT, ...)" από το τέλος του αρχείου
// και βάλτε μόνο αυτό:
startServer();



// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`🚀 Server running at: http://localhost:${PORT}`);
// });









///////////////////////////////////////////////////////////////////////////
// //________________________mynhmata_________14/2/26______________


// δ. io connection (ONLY ONCE)
// ----- ΝΕΑ ΛΟΓΙΚΗ CHAT ME SOCKET.IO -----
// Αυτό τρέχει κάθε φορά που ένας νέος χρήστης συνδέεται από το React
// io.on('connection', (socket) => {
//   console.log(`🔌 Νέος χρήστης συνδέθηκε: ${socket.id}`);

//   // 1. Ο ΧΡΗΣΤΗΣ ΜΠΑΙΝΕΙ ΣΕ ΕΝΑ "ΔΩΜΑΤΙΟ" (π.χ. σε ένα μάθημα)
//   socket.on('join_room', async (courseId) => {
//     const roomName = `course:${courseId}`;
//     socket.join(roomName);
//     console.log(`User ${socket.id} μπήκε στο δωμάτιο ${roomName}`);

//     // (Προαιρετικό: Στείλτε τα 50 τελευταία μηνύματα από το cache του Redis)
//     try {
//       const historyKey = `chat_history:${courseId}`;
//       const history = await redisClient.lRange(historyKey, 0, 49);

//       const messages = history
//   .map(m => { try { return JSON.parse(m); } catch { return null; } })
//   .filter(Boolean)
//   .reverse();

// socket.emit('chat_history', messages);

//       // Στέλνουμε το ιστορικό ΜΟΝΟ στον χρήστη που μόλις μπήκε
//       socket.emit('chat_history', history.map(JSON.parse).reverse());
//     } catch (e) {
//       console.error('Failed to get chat history from Redis', e);
//     }
//   });

//   // 2. Ο ΧΡΗΣΤΗΣ ΣΤΕΛΝΕΙ ΕΝΑ ΜΗΝΥΜΑ
//   socket.on('send_message', async (data) => {
//     // data = { course_id: 123, content: "Γεια!", sender_id: 1 }
//     const { course_id, content, sender_id } = data;
//     const roomName = `course:${course_id}`;

//     const messageObject = {
//       id: null, // Θα το πάρουμε από την Postgres
//       sender_id: sender_id,
//       course_id: course_id,
//       content: content,
//       message_type: 'forum_post', // Ή 'direct_message' κλπ.
//       sent_at: new Date().toISOString()
//     };

//     if (!content || !content.trim()) return;

//     try {
//       // ΒΗΜΑ 2α: ΑΠΟΘΗΚΕΥΣΗ ΣΤΗΝ POSTGRESQL (Μόνιμη Βάση)
//       const dbResult = await pool.query(
//         `INSERT INTO messages (sender_id, course_id, content, message_type, sent_at)
//          VALUES ($1, $2, $3, $4, $5)
//          RETURNING id`, //
//         [sender_id, course_id, content, messageObject.message_type, messageObject.sent_at]
//       );
      
//       // Αποθήκευση πρώτα σε PostgreSQL και μετά cache/publish → σωστό και “καθαρό” για διπλωματική.


//       messageObject.id = dbResult.rows[0].id; // Ενημέρωση του ID

//       // ΒΗΜΑ 2β: ΑΠΟΘΗΚΕΥΣΗ ΣΤΟ REDIS CACHE (Για γρήγορο ιστορικό)
//       const historyKey = `chat_history:${course_id}`;
//       const messageJson = JSON.stringify(messageObject);
//       await redisClient.lPush(historyKey, messageJson);
//       await redisClient.lTrim(historyKey, 0, 99); // Κράτα μόνο τα 100 τελευταία

//       // ΒΗΜΑ 2γ: ΔΗΜΟΣΙΕΥΣΗ ΣΤΟ REDIS (Για Broadcast)
//       await redisClient.publish(roomName, messageJson);

//     } catch (err) {
//       console.error('❌ Error saving/publishing message:', err.message);
//       // Ενημέρωσε μόνο τον αποστολέα για το σφάλμα
//       socket.emit('message_error', 'Το μήνυμά σας απέτυχε να σταλεί.');
//     }
//   });

//   // 3. Ο ΧΡΗΣΤΗΣ ΑΠΟΣΥΝΔΕΕΤΑΙ
//   socket.on('disconnect', () => {
//     console.log(`🔌 Ο χρήστης ${socket.id} αποσυνδέθηκε.`);
//     // (Εδώ μπορείτε να τον αφαιρέσετε από το HASH 'online_users' του Redis)
//   });
// });

// Existing course chat code...
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Join user's private room
  socket.on('join_private', (userId) => {
    socket.join(`user:${userId}`);
    console.log(`User ${userId} joined private room`);
  });

  // Existing course chat code...
  socket.on('join_room', async (courseId) => {
    // ... existing code
  });

  socket.on('send_message', async (data) => {
    // ... existing code
  });

  // NEW: Private message
  socket.on('send_private_message', async (data) => {
    const { recipient_id, content, sender_id } = data;

    try {
      const result = await pool.query(
        `INSERT INTO private_messages (sender_id, recipient_id, content, sent_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, sender_id, recipient_id, content, sent_at`,
        [sender_id, recipient_id, content]
      );

      const message = result.rows[0];

      // Send to recipient
      io.to(`user:${recipient_id}`).emit('new_private_message', message);
      
      // Confirm to sender
      socket.emit('message_sent', message);
    } catch (err) {
      console.error('Private message error:', err);
      socket.emit('message_error', 'Failed to send');
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User ${socket.id} disconnected`);
  });
});

// //___________________________mhnymata_______14/2/26__________________
// ============================================
// PRIVATE MESSAGES API
// ============================================

// 1. GET MY CONVERSATIONS (Inbox)
app.get('/api/messages/conversations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (other_user_id)
         other_user_id,
         other_user_name,
         last_message,
         last_message_time,
         unread_count,
         is_sender
       FROM (
         -- Sent messages
         SELECT 
           pm.recipient_id as other_user_id,
           u.first_name || ' ' || u.last_name as other_user_name,
           pm.content as last_message,
           pm.sent_at as last_message_time,
           0 as unread_count,
           TRUE as is_sender
         FROM private_messages pm
         JOIN users u ON u.id = pm.recipient_id
         WHERE pm.sender_id = $1
         
         UNION ALL
         
         -- Received messages
         SELECT 
           pm.sender_id as other_user_id,
           u.first_name || ' ' || u.last_name as other_user_name,
           pm.content as last_message,
           pm.sent_at as last_message_time,
           COUNT(*) FILTER (WHERE NOT pm.is_read) as unread_count,
           FALSE as is_sender
         FROM private_messages pm
         JOIN users u ON u.id = pm.sender_id
         WHERE pm.recipient_id = $1
         GROUP BY pm.sender_id, u.first_name, u.last_name, pm.content, pm.sent_at
       ) conversations
       ORDER BY other_user_id, last_message_time DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 2. GET CONVERSATION WITH USER (1-to-1 chat history)
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;

  try {
    // Get messages between current user and target user
    const messages = await pool.query(
      `SELECT 
         pm.id,
         pm.sender_id,
         pm.recipient_id,
         pm.content,
         pm.is_read,
         pm.sent_at,
         sender.first_name || ' ' || sender.last_name as sender_name
       FROM private_messages pm
       JOIN users sender ON sender.id = pm.sender_id
       WHERE (pm.sender_id = $1 AND pm.recipient_id = $2)
          OR (pm.sender_id = $2 AND pm.recipient_id = $1)
       ORDER BY pm.sent_at ASC`,
      [req.user.id, userId]
    );

    // Get other user info
    const userInfo = await pool.query(
      `SELECT id, first_name, last_name, email, role 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userInfo.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mark messages as read
    await pool.query(
      `UPDATE private_messages 
       SET is_read = TRUE 
       WHERE recipient_id = $1 AND sender_id = $2 AND NOT is_read`,
      [req.user.id, userId]
    );

    res.json({
      user: userInfo.rows[0],
      messages: messages.rows
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 3. SEND PRIVATE MESSAGE
app.post('/api/messages/send', authenticateToken, async (req, res) => {
  const { recipient_id, content } = req.body;

  if (!recipient_id || !content || !content.trim()) {
    return res.status(400).json({ error: 'Recipient and content required' });
  }

  try {
    // Check recipient exists
    const recipientCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [recipient_id]
    );

    if (recipientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO private_messages (sender_id, recipient_id, content, sent_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, sender_id, recipient_id, content, sent_at`,
      [req.user.id, recipient_id, content.trim()]
    );

    const message = result.rows[0];

    // Socket.io notification (if connected)
    io.to(`user:${recipient_id}`).emit('new_private_message', {
      ...message,
      sender_name: `${req.user.first_name} ${req.user.last_name}`
    });

    res.json({
      message: 'Message sent',
      data: message
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});


// 4. GET UNREAD COUNT
app.get('/api/messages/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM private_messages WHERE recipient_id = $1 AND NOT is_read',
      [req.user.id]
    );

    res.json({ unread: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 5. MARK MESSAGE AS READ
app.put('/api/messages/:messageId/read', authenticateToken, async (req, res) => {
  const { messageId } = req.params;

  try {
    await pool.query(
      'UPDATE private_messages SET is_read = TRUE WHERE id = $1 AND recipient_id = $2',
      [messageId, req.user.id]
    );

    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Error marking as read:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 6. GET STUDENTS IN MY COURSES (for lecturers)
app.get('/api/messages/my-students', authenticateToken, async (req, res) => {
  if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only lecturers can access this' });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT 
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         c.title as course_title
       FROM users u
       JOIN course_enrollments ce ON ce.student_id = u.id
       JOIN courses c ON c.id = ce.course_id
       WHERE c.lecturer_id = $1 
         AND ce.status = 'active'
         AND NOT ce.is_deleted
       ORDER BY u.last_name, u.first_name`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 7. GET MY LECTURERS (for students)
app.get('/api/messages/my-lecturers', authenticateToken, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can access this' });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT 
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         c.title as course_title
       FROM users u
       JOIN courses c ON c.lecturer_id = u.id
       JOIN course_enrollments ce ON ce.course_id = c.id
       WHERE ce.student_id = $1 
         AND ce.status = 'active'
         AND NOT ce.is_deleted
       ORDER BY u.last_name, u.first_name`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lecturers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 6. GET STUDENTS IN MY COURSES (for lecturers)
app.get('/api/messages/my-students', authenticateToken, async (req, res) => {
  console.log('📝 Fetching students for lecturer:', req.user.id);

  if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only lecturers can access this' });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT 
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         c.title as course_title,
         c.id as course_id
       FROM users u
       JOIN course_enrollments ce ON ce.student_id = u.id
       JOIN courses c ON c.id = ce.course_id
       WHERE c.lecturer_id = $1 
         AND ce.status = 'active'
         AND NOT ce.is_deleted
         AND u.role = 'student'
       ORDER BY u.last_name, u.first_name`,
      [req.user.id]
    );

    console.log('✅ Found students:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// 7. GET MY LECTURERS (for students)
app.get('/api/messages/my-lecturers', authenticateToken, async (req, res) => {
  console.log('📝 Fetching lecturers for student:', req.user.id);

  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can access this' });
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT 
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         c.title as course_title,
         c.id as course_id
       FROM users u
       JOIN courses c ON c.lecturer_id = u.id
       JOIN course_enrollments ce ON ce.course_id = c.id
       WHERE ce.student_id = $1 
         AND ce.status = 'active'
         AND NOT ce.is_deleted
         AND u.role = 'lecturer'
       ORDER BY u.last_name, u.first_name`,
      [req.user.id]
    );

    console.log('✅ Found lecturers:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching lecturers:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// //___________________________mhnymata_______14/2/26__________________