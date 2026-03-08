import express from "express";  // Εισαγωγή Express framework για να δημιουργήσουμε το server
import dotenv from "dotenv";    // Εισαγωγή της βιβλιοθήκης για να διαβάσουμε μεταβλητές από το .env αρχείο
import cors from "cors";        // Εισαγωγή της βιβλιοθήκης για requests από διαφορετικά domains
import pkg from "pg";           // Εισαγωγή του PostgreSQL client για να συνδεθούμε με τη βάση δεδομένων
import bcrypt from "bcrypt";    // Εισαγωγή της βιβλιοθήκης για κρυπτογράφηση κωδικών
import jwt from "jsonwebtoken"; // Εισαγωγή της βιβλιοθήκης για δημιουργία και επαλήθευση JWT tokens

import { google } from 'googleapis';
//import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Utilities
import crypto from "crypto";
import cron from "node-cron";

// Redis & Realtime
import { createClient } from 'redis';
import http from 'http';
import { Server } from 'socket.io';
import { unlink } from 'fs/promises';

// Sessions
import session from 'express-session';      // Διαχείριση sessions
import { RedisStore } from 'connect-redis'; // Αποθήκευση sessions στο Redis

const { Pool } = pkg;
dotenv.config();

// ---------------------
// Express & HTTP Server
// ---------------------
const app = express();
const server = http.createServer(app); // <-- Δημιουργία του http server εδώ, // Απαραίτητο για Socket.io

// --------------------
// CORS & Body Parsing
// --------------------
app.use(cors({ 
  origin: "http://localhost:3000", 
  credentials: true 
}));
app.use(express.json());

// --------------------
// Redis Clients (a.)
// --------------------
const redisClient = createClient(); // Main Redis client (sessions, caching, etc.) createClient({ url: 'redis://localhost:6379' });
const redisSubscriber = redisClient.duplicate(); // Separate client for Pub/Sub (καλή πρακτική)// <-- Ένας κλώνος ΜΟΝΟ για subscribe

// 3️⃣ Redis clients - CREATE BOTH FIRST

const redisSub = redisClient.duplicate();  // ✅ Create BEFORE using

// Error handling
redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisSubscriber.on('error', (err) => console.error('❌ Redis Subscriber Error', err));
// ⚠️ ΑΠΑΡΑΙΤΗΤΟ: σύνδεση στο Redis
// 4️⃣ Connect Redis - AWAIT BOTH
try {
  await redisClient.connect();
  await redisSub.connect();
  console.log('✅ Redis connected');
} catch (err) {
  console.error('❌ Redis connection failed:', err);
  process.exit(1);
}

// Helper: Generate room name (sorted IDs)
function getRoomName(userId1, userId2) {
  const sorted = [userId1, userId2].sort((a, b) => a - b);
  return `private:${sorted[0]}_${sorted[1]}`;
}

// --------------------
// Session Middleware
// --------------------

// Session Middleware (γ.) 
// session middleware AFTER redisClient is defined (Το "Login που αντέχει")/(Σύνδεση Login με Redis) - ΠΡΟΣΟΧΗ: Αυτό ΠΡΙΝ από τα routes (/api/...)
app.use(session({
    store: new RedisStore({ client: redisClient }),                      // Αποθήκευση στο Redis
    secret: process.env.SESSION_SECRET || "super_secret_key_change_me",  // Κλειδί κρυπτογράφησης
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,               // false για localhost (http), true αν βγεις production (https)
      httpOnly: true,              // Προστασία από XSS attacks
      maxAge: 1000 * 60 * 60 * 24  // Το login διαρκεί 1 μέρα
    },
  })
);

// --------------------
// Socket.io Setup
// --------------------
const io = new Server(server, {      // Setup Socket.io (CORS: Επέτρεψε το Frontend να συνδεθεί)
  cors: {
    origin: "http://localhost:3000", // Βάλε εδώ το URL του React app σου
    methods: ["GET", "POST"],
    credentials: true                // Σημαντικό για τα sessions/cookies
  }
});

// ---------------------
// PostgreSQL Connection
// ---------------------
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});


// ====================================
// SOCKET.IO - PRIVATE MESSAGING
// ====================================

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Join private room
  socket.on('join_private_room', ({ userId, otherUserId }) => {
    const room = getRoomName(userId, otherUserId);
    socket.join(room);
    console.log(`👥 User ${userId} joined room: ${room}`);
  });

  // Send private message
  socket.on('send_private_message', async ({ senderId, recipientId, content }) => {
    if (!content || !content.trim()) {
      return socket.emit('message_error', 'Message cannot be empty');
    }

    if (senderId === recipientId) {
      return socket.emit('message_error', 'Cannot message yourself');
    }

    try {
      // Save to PostgreSQL
      const result = await pool.query(
        `INSERT INTO messages (sender_id, recipient_id, content, sent_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING 
           id, 
           sender_id, 
           recipient_id, 
           content, 
           sent_at`,
        [senderId, recipientId, content.trim()]
      );

      const message = result.rows[0];

      // Get sender/recipient names
      const usersResult = await pool.query(
        `SELECT id, first_name, last_name FROM users WHERE id IN ($1, $2)`,
        [senderId, recipientId]
      );

      const sender = usersResult.rows.find(u => u.id === senderId);
      const recipient = usersResult.rows.find(u => u.id === recipientId);

      const fullMessage = {
        ...message,
        sender_first_name: sender.first_name,
        sender_last_name: sender.last_name,
        recipient_first_name: recipient.first_name,
        recipient_last_name: recipient.last_name
      };

      // Publish to Redis (for multi-server support)
      const room = getRoomName(senderId, recipientId);
      await redisClient.publish(room, JSON.stringify(fullMessage));

      console.log(`✅ Message saved: ${senderId} → ${recipientId}`);

    } catch (err) {
      console.error('❌ Error saving message:', err);
      socket.emit('message_error', 'Failed to send message');
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// Redis Pub/Sub: Forward messages to Socket.io clients
redisSub.pSubscribe('private:*', (message, channel) => {
  const parsedMessage = JSON.parse(message);
  io.to(channel).emit('new_message', parsedMessage);
  console.log(`📨 Forwarded message to room: ${channel}`);
});

// Use server.listen instead of app.listen
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io ready`);
  console.log(`🔴 Redis pub/sub active`);
});


// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`🚀 Server running at: http://localhost:${PORT}`);
// });

//-----------------------------
//----Google Drive Config -----
//-----------------------------
// Google Drive Setup
import multer from 'multer';

const upload = multer({
  dest: 'uploads/temp/',
  limits: { fileSize: 500 * 1024 * 1024 }
});


console.log("CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET);
console.log("REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI);

// OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Scopes (what permissions we need)
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// ============================================
// STEP 1: Get Authorization URL
// ============================================
app.get('/api/auth/google/url', authenticateToken, (req, res) => {
  if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only lecturers can connect Drive' });
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // Get refresh token
    prompt: "consent",       // ΥΠΟΧΡΕΩΤΙΚΟ
    scope: SCOPES,
    state: req.user.id  // Pass user ID for callback
  });

  res.json({ auth_url: authUrl });
});

  // const authUrl = oauth2Client.generateAuthUrl({
  //   access_type: "offline",   // ΥΠΟΧΡΕΩΤΙΚΟ
  //   prompt: "consent",        // ΥΠΟΧΡΕΩΤΙΚΟ
  //   scope: [
  //     "https://www.googleapis.com/auth/drive.file"
  //   ],
  // });

// ============================================
// STEP 2: Handle OAuth Callback
// ============================================
// STEP 2: Handle OAuth Callback
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query; // state = user_id

  if (!code) {
    return res.redirect(`http://localhost:3000/lecturer?drive=error`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    await pool.query(
      `UPDATE users 
       SET google_access_token = $1, google_refresh_token = $2
       WHERE id = $3`,
      [tokens.access_token, tokens.refresh_token, state]
    );

    // Κλείνει το popup και ενημερώνει το parent window
    res.send(`
      <script>
        window.opener?.postMessage('drive_connected', 'http://localhost:3000');
        window.close();
      </script>
    `);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`http://localhost:3000/lecturer?drive=error`);
  }
});

//     res.redirect(`${process.env.FRONTEND_URL}/settings?connected=true`);
//     res.send("Google auth success");
//   } catch (err) {
//     console.error('OAuth error:', err);
//     res.redirect(`${process.env.FRONTEND_URL}/error?msg=oauth_failed`);
//   }

//   console.log(tokens);
// });

// app.get("/auth/google", (req, res) => {
//   const authUrl = oauth2Client.generateAuthUrl({
//     access_type: "offline",
//     prompt: "consent",
//     scope: [
//       "https://www.googleapis.com/auth/drive.file"
//     ],
//   });

//   res.redirect(authUrl);
// });

// app.get("/auth/google/callback", async (req, res) => {
  
//   const { code } = req.query;
// console.log("CODE:", code);
//   const { tokens } = await oauth2Client.getToken(code);

//   console.log("TOKENS:", tokens);

//   await pool.query(
//     `UPDATE users
//      SET google_access_token = $1,
//          google_refresh_token = $2
//      WHERE id = $3`,
//     [
//       tokens.access_token,
//       tokens.refresh_token,
//       /* βάλε το σωστό user id εδώ */
//     ]
//   );

//   res.send("Drive connected successfully!");
// });

// ============================================
// STEP 3: Upload Video (using user's token!)            *DOYLEYEI POSTMAN*
// ============================================
// app.post('/api/lessons/:lessonId/upload-video',    
//   authenticateToken,
//   upload.single('video'),
//   async (req, res) => {
//     const { lessonId } = req.params;

//     if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
//       return res.status(403).json({ error: 'Forbidden' });
//     }

//     if (!req.file) {
//       return res.status(400).json({ error: 'No file' });
//     }

//     try {
//       // Get user's tokens from DB
//       const userTokens = await pool.query(
//         `SELECT google_access_token, google_refresh_token 
//          FROM users WHERE id = $1`,
//         [req.user.id]
//       );

//       if (!userTokens.rows[0]?.google_access_token) {
//         return res.status(401).json({ 
//           error: 'Google Drive not connected',
//           action: 'connect_drive'
//         });
//       }

//       // Set user's tokens
//       oauth2Client.setCredentials({
//         access_token: userTokens.rows[0].google_access_token,
//         refresh_token: userTokens.rows[0].google_refresh_token
//       });

//             // ✅ AUTO-REFRESH: Listen for token refresh
//       oauth2Client.on('tokens', async (tokens) => {
//         console.log('🔄 Refreshing tokens...');
        
//         if (tokens.refresh_token) {
//           // Google sometimes returns a new refresh token
//           await pool.query(
//             'UPDATE users SET google_refresh_token = $1 WHERE id = $2',
//             [tokens.refresh_token, req.user.id]
//           );
//         }
        
//         // Always update access token
//         await pool.query(
//           'UPDATE users SET google_access_token = $1 WHERE id = $2',
//           [tokens.access_token, req.user.id]
//         );
        
//         console.log('✅ Tokens refreshed and saved');
//       });

//       const drive = google.drive({ version: 'v3', auth: oauth2Client });

//       // Upload to LECTURER'S Drive
//       const { data } = await drive.files.create({
//         requestBody: {
//           name: `lesson_${lessonId}_${Date.now()}.mp4`,
//           mimeType: req.file.mimetype,
//           parents: [process.env.FOLDER_ID]
//         },
//         media: {
//           mimeType: req.file.mimetype,
//           body: fs.createReadStream(req.file.path)
//         },
//         fields: 'id, webViewLink'
//       });

//       // Make public
//       await drive.permissions.create({
//         fileId: data.id,
//         requestBody: { role: 'reader', type: 'anyone' }
//       });

//       const videoUrl = `https://drive.google.com/file/d/${data.id}/view`;

//       // Save to DB
//       await pool.query(
//         `UPDATE lessons 
//          SET video_url = $1, drive_file_id = $2, 
//              video_filename = $3, video_size = $4
//          WHERE id = $5`,
//         [videoUrl, data.id, req.file.originalname, req.file.size, lessonId]
//       );

//       // Cleanup temp file
//       await unlink(req.file.path);

//       res.json({ 
//         message: 'Video uploaded',
//         video_url: videoUrl
//       });

//     } catch (err) {
//       console.error('Upload error:', err);
      
//       // Token expired? Ask to reconnect
//       if (err.code === 401) {
//         return res.status(401).json({ 
//           error: 'Google token expired',
//           action: 'reconnect_drive'
//         });
//       }

//       res.status(500).json({ error: 'Upload failed' });
//     }
//   }
// );

app.post('/api/lessons/:lessonId/upload-video',
  authenticateToken,
  upload.single('video'),
  async (req, res) => {
    const { lessonId } = req.params;

    if (req.user.role !== 'lecturer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file' });
    }

    try {
      // Get tokens from DB
      const userTokens = await pool.query(
        'SELECT google_refresh_token FROM users WHERE id = $1',
        [req.user.id]
      );

      if (!userTokens.rows[0]?.google_refresh_token) {
        await unlink(req.file.path);
        return res.status(401).json({ 
          error: 'Google Drive not connected',
          action: 'connect_drive'
        });
      }

      // ✅ FORCE REFRESH BEFORE UPLOAD
      console.log('🔄 Refreshing token...');
      
      oauth2Client.setCredentials({
        refresh_token: userTokens.rows[0].google_refresh_token
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      // Save new access token
      await pool.query(
        'UPDATE users SET google_access_token = $1 WHERE id = $2',
        [credentials.access_token, req.user.id]
      );

      // Use fresh token for upload
      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: userTokens.rows[0].google_refresh_token
      });

      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Upload
      const { data } = await drive.files.create({
        requestBody: {
          name: `lesson_${lessonId}_${Date.now()}.mp4`,
         // mimeType: req.file.mimetype,
          parents: [process.env.FOLDER_ID] //Upload to my Drive file
        },
        media: {
          mimeType: req.file.mimetype,
          body: fs.createReadStream(req.file.path),
        },
        fields: 'id'
      });

// Upload to LECTURER'S Drive
//       const { data } = await drive.files.create({
//         requestBody: {
//           name: `lesson_${lessonId}_${Date.now()}.mp4`,
//           mimeType: req.file.mimetype,
//           parents: [process.env.FOLDER_ID]
//         },
//         media: {
//           mimeType: req.file.mimetype,
//           body: fs.createReadStream(req.file.path)
//         },
//         fields: 'id, webViewLink'
//       });

      // Make public
      await drive.permissions.create({
        fileId: data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      const videoUrl = `https://drive.google.com/file/d/${data.id}/preview`;

      // Save to DB
      await pool.query(
        'UPDATE lessons SET video_url = $1, drive_file_id = $2, video_filename = $3, video_size = $4 WHERE id = $5',
        [videoUrl, data.id, req.file.originalname, req.file.size, lessonId]
      );

      await unlink(req.file.path);

      res.json({ 
        message: 'Video uploaded',
        video_url: videoUrl
      });

    } catch (err) {
      console.error('Upload error:', err);
      if (req.file?.path) await unlink(req.file.path).catch(() => {});
      
      res.status(500).json({ error: 'Upload failed: ' + err.message });
    }
  }
);

// ============================================
// STEP 4: Check Connection Status                           *DOYLEYEI POSTMAN*
// ============================================
app.get('/api/auth/google/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT google_access_token IS NOT NULL as connected 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    res.json({ 
      connected: result.rows[0]?.connected || false 
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// STEP 5: Disconnect Drive
// ============================================
app.post('/api/auth/google/disconnect', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE users 
       SET google_access_token = NULL, google_refresh_token = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ message: 'Disconnected from Google Drive' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

//---------------------------------
// ----- ΟΛΑ ΤΑ API ENDPOINTS -----
//---------------------------------

// Root endpoint – έλεγχος ότι ο server τρέχει
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

    // Hash κωδικού
    const passwordHash = await bcrypt.hash(password, 10);

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

// ❗ ΣΩΣΤΟ πεδίο: password_hash 
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

  //   if (!name) {
  //   return res.status(400).json({ error: "Institution name is required" });
  // }

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

// 1. GET ALL COURSES (με φίλτρα)           *DOYLEYEI POSTMAN*
app.get("/api/courses", async (req, res) => {
  const { category_id, institution_id, difficulty, status } = req.query;
  
  try {
    let query = `
      SELECT c.id, c.title, c.slug, c.short_description, c.description,
             c.price, c.currency, c.difficulty, c.status, c.created_at,
             c.duration_minutes, c.max_students,
             u.id AS lecturer_id,
             u.first_name || ' ' || u.last_name AS lecturer_name,
             i.id AS institution_id,
             i.name AS institution_name,
             cat.id AS category_id,
             cat.name AS category_name,
             (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrolled_count
      FROM courses c
      LEFT JOIN users u ON c.lecturer_id = u.id
      LEFT JOIN institutions i ON c.institution_id = i.id
      LEFT JOIN course_categories cat ON c.category_id = cat.id
      WHERE NOT c.is_deleted
    `;
    
    const params = [];
    let paramCount = 1;
    
    // Φίλτρα
    if (category_id) {
      query += ` AND c.category_id = $${paramCount}`;
      params.push(category_id);
      paramCount++;
    }
    
    if (institution_id) {
      query += ` AND c.institution_id = $${paramCount}`;
      params.push(institution_id);
      paramCount++;
    }
    
    if (difficulty) {
      query += ` AND c.difficulty = $${paramCount}`;
      params.push(difficulty);
      paramCount++;
    }
    
    if (status) {
      query += ` AND c.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    } else {
      // Default: μόνο published courses
      query += ` AND c.status = 'published'`;
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching courses:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// GET all categories
app.get("/api/categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM course_categories WHERE is_active = TRUE AND NOT is_deleted ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// 2. GET SINGLE COURSE (με πλήρη στοιχεία)      *DOYLEYEI POSTMAN*
app.get("/api/courses/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Κύριο course
    const courseResult = await pool.query(
      `SELECT c.*, 
              u.first_name || ' ' || u.last_name AS lecturer_name,
              u.email AS lecturer_email,
              i.name AS institution_name,
              i.website_url AS institution_url,
              cat.name AS category_name,
              (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrolled_count,
              (SELECT AVG(rating) FROM course_reviews WHERE course_id = c.id) AS avg_rating,
              (SELECT COUNT(*) FROM course_reviews WHERE course_id = c.id) AS review_count
       FROM courses c
       LEFT JOIN users u ON c.lecturer_id = u.id
       LEFT JOIN institutions i ON c.institution_id = i.id
       LEFT JOIN course_categories cat ON c.category_id = cat.id
       WHERE c.id = $1 AND NOT c.is_deleted`,
      [id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const course = courseResult.rows[0];

    // Sections + Lessons
    const sectionsResult = await pool.query(
      `SELECT cs.*, 
              (SELECT COUNT(*) FROM lessons WHERE section_id = cs.id AND NOT is_deleted) AS lesson_count
       FROM course_sections cs
       WHERE cs.course_id = $1 AND NOT cs.is_deleted
       ORDER BY cs.order_index ASC`,
      [id]
    );

    course.sections = sectionsResult.rows;

    // Για κάθε section, πάρε τα lessons
    for (let section of course.sections) {
      const lessonsResult = await pool.query(
        `SELECT id, title, description, lesson_type, order_index, 
                is_free, video_duration, created_at
         FROM lessons
         WHERE section_id = $1 AND NOT is_deleted
         ORDER BY order_index ASC`,
        [section.id]
      );
      section.lessons = lessonsResult.rows;
    }

    res.json(course);
  } catch (err) {
    console.error("❌ Error fetching course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. CREATE COURSE (Lecturer/Admin)            *DOYLEYEI POSTMAN*
app.post("/api/courses", authenticateToken, async (req, res) => {
  const { 
    title, slug, description, short_description, 
    price, difficulty, category_id, institution_id,
    duration_minutes, max_students, prerequisites, learning_objectives, tags
  } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can create courses" });
  }

  if (!title || !slug) {
    return res.status(400).json({ error: "Title and slug are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses (
        title, slug, description, short_description, 
        price, currency, lecturer_id, difficulty, status,
        category_id, institution_id, duration_minutes, max_students,
        prerequisites, learning_objectives, tags
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
       RETURNING id, title, slug, status, created_at`,
      [
        title, slug, description, short_description,
        price || 0, 'EUR', req.user.id, difficulty || 'beginner', 'draft',
        category_id || null, institution_id || null, 
        duration_minutes || null, max_students || null,
        prerequisites || null, learning_objectives || null, tags || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating course:", err.message);
    
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: "A course with this slug already exists" });
    }
    
    res.status(500).json({ error: "Database error" });
  }
});

// 4. UPDATE COURSE (Lecturer/Admin)     *doyleyei POSTMAN*
app.put("/api/courses/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { 
    title, slug, description, short_description, 
    price, status, category_id, institution_id,
    duration_minutes, max_students, prerequisites, learning_objectives, tags
  } = req.body;

  try {
    // Έλεγχος δικαιωμάτων
    const courseCheck = await pool.query(
      `SELECT lecturer_id FROM courses WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const isOwner = courseCheck.rows[0].lecturer_id === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "You don't have permission to edit this course" });
    }

    // Update
    const result = await pool.query(
      `UPDATE courses
       SET title = $1, slug = $2, description = $3, short_description = $4,
           price = $5, status = $6, category_id = $7, 
           institution_id = $8, duration_minutes = $9, max_students = $10,
           prerequisites = $11, learning_objectives = $12, tags = $13,
           updated_at = NOW()
       WHERE id = $14 AND NOT is_deleted
       RETURNING id, title, slug, status, updated_at`,
      [
        title, slug, description, short_description,
        price, status, category_id, institution_id,
        duration_minutes, max_students, prerequisites, learning_objectives, tags,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. DELETE COURSE (Soft delete)                        *doyleyei POSTMAN*
app.delete("/api/courses/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const courseCheck = await pool.query(
      `SELECT lecturer_id FROM courses WHERE id = $1 AND NOT is_deleted`,
      [id]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const isOwner = courseCheck.rows[0].lecturer_id === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "You don't have permission to delete this course" });
    }

    const result = await pool.query(
      `UPDATE courses
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1
       RETURNING id, title`,
      [id]
    );

    res.json({ message: "Course deleted successfully", course: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting course:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 6. GET LECTURER'S COURSES                    *doyleyei POSTMAN*
app.get("/api/lecturer/courses", authenticateToken, async (req, res) => {
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers can view their courses" });
  }

  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.slug, c.status, c.price, c.difficulty,
              c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id) AS enrolled_count,
              (SELECT COUNT(*) FROM course_sections WHERE course_id = c.id AND NOT is_deleted) AS section_count
       FROM courses c
       WHERE c.lecturer_id = $1 AND NOT c.is_deleted
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching lecturer courses:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ========================================
// COURSE - SECTIONS ENDPOINTS
// ========================================

// 1. GET ALL SECTIONS για ένα course            *doyleyei POSTMAN*
app.get("/api/courses/:courseId/sections", async (req, res) => {
  const { courseId } = req.params;

  try {
    const result = await pool.query(
      `SELECT cs.id, cs.title, cs.description, cs.order_index, cs.is_free, cs.created_at,
              (SELECT COUNT(*) FROM lessons WHERE section_id = cs.id AND NOT is_deleted) AS lesson_count
       FROM course_sections cs
       WHERE cs.course_id = $1 AND NOT cs.is_deleted
       ORDER BY cs.order_index ASC`,
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching sections:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. CREATE SECTION                              *doyleyei POSTMAN*
app.post("/api/courses/:courseId/sections", authenticateToken, async (req, res) => {
  const { courseId } = req.params;
  const { title, description, is_free } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can add sections" });
  }

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  try {
    // Υπολογισμός επόμενου order_index
    const maxOrderResult = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) as max_order 
       FROM course_sections 
       WHERE course_id = $1`,
      [courseId]
    );
    const nextOrderIndex = maxOrderResult.rows[0].max_order + 1;

    const result = await pool.query(
      `INSERT INTO course_sections (course_id, title, description, order_index, is_free)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, description, order_index, is_free, created_at`,
      [courseId, title, description || null, nextOrderIndex, is_free || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating section:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. UPDATE SECTION                               *doyleyei POSTMAN*
app.put("/api/sections/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, description, order_index, is_free } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can update sections" });
  }

  try {
    const result = await pool.query(
      `UPDATE course_sections
       SET title = $1, description = $2, order_index = $3, is_free = $4
       WHERE id = $5 AND NOT is_deleted
       RETURNING id, title, description, order_index, is_free`,
      [title, description, order_index, is_free, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating section:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. DELETE SECTION                                   *doyleyei POSTMAN*
app.delete("/api/sections/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can delete sections" });
  }

  try {
    const result = await pool.query(
      `UPDATE course_sections
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1
       RETURNING id, title`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Section not found" });
    }

    res.json({ message: "Section deleted", section: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting section:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ========================================
// LESSONS ENDPOINTS                 
// ========================================

// 1. GET ALL LESSONS σε ένα section                  *DOYLEYEI POSTMAN*
app.get("/api/sections/:sectionId/lessons", async (req, res) => {
  const { sectionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, description, lesson_type, order_index, 
              is_free, is_downloadable, video_path, video_duration, 
              pdf_path, created_at
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

// 2. GET SINGLE LESSON                           *doyleyei POSTMAN* 
app.get("/api/lessons/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT l.*, cs.course_id
       FROM lessons l
       JOIN course_sections cs ON l.section_id = cs.id
       WHERE l.id = $1 AND NOT l.is_deleted`,
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
   
// 3. CREATE LESSON                               *DOYLEYEI POSTMAN*
app.post("/api/sections/:sectionId/lessons", authenticateToken, async (req, res) => {
  const { sectionId } = req.params;
  const { 
    title, description, content, lesson_type, 
    is_free, is_downloadable, video_path, video_duration, pdf_path 
  } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can add lessons" });
  }

  if (!title || !lesson_type) {
    return res.status(400).json({ error: "Title and lesson_type are required" });
  }

  try {
    // Υπολογισμός order_index
    const maxOrderResult = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) AS max_order 
       FROM lessons 
       WHERE section_id = $1`,
      [sectionId]
    );
    const nextOrderIndex = maxOrderResult.rows[0].max_order + 1;

    const result = await pool.query(
      `INSERT INTO lessons (
        section_id, title, description, content, lesson_type, order_index,
        is_free, is_downloadable, video_path, video_duration, pdf_path
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, lesson_type, order_index, created_at`,
      [
        sectionId, title, description || null, content || null, 
        lesson_type, nextOrderIndex,
        is_free || false, is_downloadable || false,
        video_path || null, video_duration || null, pdf_path || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. UPDATE LESSON                                *doyleyei POSTMAN*
app.put("/api/lessons/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { 
    title, description, content, lesson_type,
    is_free, is_downloadable, video_path, video_duration, pdf_path 
  } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can update lessons" });
  }

  try {
    const result = await pool.query(
      `UPDATE lessons
       SET title = $1, description = $2, content = $3, lesson_type = $4,
           is_free = $5, is_downloadable = $6,
           video_path = $7, video_duration = $8, pdf_path = $9
       WHERE id = $10 AND NOT is_deleted
       RETURNING id, title, lesson_type, updated_at`,
      [
        title, description, content, lesson_type,
        is_free, is_downloadable, video_path, video_duration, pdf_path,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error updating lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. DELETE LESSON                            *doyleyei POSTMAN*
app.delete("/api/lessons/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can delete lessons" });
  }

  try {
    const result = await pool.query(
      `UPDATE lessons
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1
       RETURNING id, title`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json({ message: "Lesson deleted", lesson: result.rows[0] });
  } catch (err) {
    console.error("❌ Error deleting lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ========================================
// PROGRESS TRACKING 
// ========================================


// 1. MARK LESSON AS COMPLETED                     *doyleyei POSTMAN*
app.post("/api/lessons/:lessonId/complete", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can complete lessons" });
  }

  try {
    // 1. Έλεγχος: Υπάρχει το lesson;
    const lessonCheck = await pool.query(
      `SELECT l.id, l.section_id, cs.course_id
       FROM lessons l
       JOIN course_sections cs ON l.section_id = cs.id
       WHERE l.id = $1 AND NOT l.is_deleted`,
      [lessonId]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const lesson = lessonCheck.rows[0];

    // 2. Έλεγχος: Είναι εγγεγραμμένος στο course;
    const enrollmentCheck = await pool.query(
      `SELECT id FROM course_enrollments
       WHERE student_id = $1 AND course_id = $2 
       AND status = 'active' AND NOT is_deleted`,
      [req.user.id, lesson.course_id]
    );

    if (enrollmentCheck.rows.length === 0) {
      return res.status(403).json({ error: "You must be enrolled to complete lessons" });
    }

    const enrollmentId = enrollmentCheck.rows[0].id;

    // 3. Mark as completed (ή update αν υπάρχει ήδη)
    const completion = await pool.query(
      `INSERT INTO lesson_completions (enrollment_id, lesson_id, completed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (enrollment_id, lesson_id)
       DO UPDATE SET completed_at = NOW()
       RETURNING id, enrollment_id, lesson_id, completed_at`,
      [enrollmentId, lessonId]
    );

    // 4. Υπολογισμός νέου progress
    const progressResult = await pool.query(
      `SELECT calculate_course_progress($1::INTEGER) AS progress`,
      [enrollmentId]
    );

    const newProgress = progressResult.rows[0].progress || 0;

    // 5. Update enrollment progress
    await pool.query(
      `UPDATE course_enrollments
       SET progress_percentage = $1, completed_at = NOW()
       WHERE id = $2`,
      [newProgress, enrollmentId]
    );

    res.json({
      message: "Lesson marked as completed",
      completion: completion.rows[0],
      progress: newProgress
    });

  } catch (err) {
    console.error("❌ Error completing lesson:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. MARK LESSON AS INCOMPLETE (Undo)               *doyleyei POSTMAN*
app.post("/api/lessons/:lessonId/incomplete", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can mark lessons" });
  }

  try {
    // Βρες το course_id
    const lessonCheck = await pool.query(
      `SELECT l.id, cs.course_id
       FROM lessons l
       JOIN course_sections cs ON l.section_id = cs.id
       WHERE l.id = $1`,
      [lessonId]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const courseId = lessonCheck.rows[0].course_id;

    // Mark as incomplete
    await pool.query(
      `UPDATE lesson_completions
       SET completed_at = NULL
       WHERE enrollment_id = $1 AND lesson_id = $2`,
      [req.user.id, lessonId]
    );

    // Recalculate progress
    const enrollmentCheck = await pool.query(
      `SELECT id FROM course_enrollments
       WHERE student_id = $1 AND course_id = $2`,
      [req.user.id, courseId]
    );

    if (enrollmentCheck.rows.length > 0) {
      const enrollmentId = enrollmentCheck.rows[0].id;
      
      const progressResult = await pool.query(
        `SELECT calculate_course_progress($1::INTEGER) AS progress`,
        [enrollmentId]
      );

      const newProgress = progressResult.rows[0].progress || 0;

      await pool.query(
        `UPDATE course_enrollments
         SET progress_percentage = $1, completed_at = NOW()
         WHERE id = $2`,
        [newProgress, enrollmentId]
      );

      res.json({
        message: "Lesson marked as incomplete",
        progress: newProgress
      });
    } else {
      res.json({ message: "Lesson marked as incomplete" });
    }

  } catch (err) {
    console.error("❌ Error marking lesson incomplete:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. GET MY PROGRESS για ένα course                  *doyleyei POSTMAN*
app.get("/api/courses/:courseId/my-progress", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have progress" });
  }

  try {
    // 1. Enrollment info
    const enrollment = await pool.query(
      `SELECT id, status, enrolled_at, progress_percentage, final_grade
       FROM course_enrollments
       WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
      [req.user.id, courseId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ error: "Not enrolled in this course" });
    }

    const enrollmentData = enrollment.rows[0];

    // 2. Sections με progress
    const sections = await pool.query(
      `SELECT 
         cs.id,
         cs.title,
         cs.order_index,
         COUNT(l.id) as total_lessons,
         COUNT(lc.id) FILTER (WHERE lc.enrollment_id = $1) as completed_lessons
       FROM course_sections cs
       LEFT JOIN lessons l ON l.section_id = cs.id AND NOT l.is_deleted
       LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.enrollment_id = $1
       WHERE cs.course_id = $2 AND NOT cs.is_deleted
       GROUP BY cs.id
       ORDER BY cs.order_index ASC`,
      [req.user.id, courseId]
    );

    // 3. Για κάθε section, πάρε τα lessons με completion status
    for (let section of sections.rows) {
      const lessons = await pool.query(
        `SELECT 
           l.id,
           l.title,
           l.lesson_type,
           l.order_index,
           l.video_duration,
           COALESCE(lc.completed_at) as is_completed,
           lc.completed_at
         FROM lessons l
         LEFT JOIN lesson_completions lc 
           ON lc.lesson_id = l.id AND lc.enrollment_id = $1
         WHERE l.section_id = $2 AND NOT l.is_deleted
         ORDER BY l.order_index ASC`,
        [req.user.id, section.id]
      );

      section.lessons = lessons.rows;
    }

    res.json({
      enrollment: enrollmentData,
      sections: sections.rows
    });

  } catch (err) {
    console.error("❌ Error fetching progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. GET OVERALL STATS (Dashboard)              *doyleyei postman*
app.get("/api/my-learning-stats", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have learning stats" });
  }

  try {
    const stats = await pool.query(
      `SELECT 
         -- Enrollments
         COUNT(DISTINCT ce.id) as total_enrollments,
         COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'active') as active_courses,
         COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'completed') as completed_courses,
         
         -- Progress
         ROUND(AVG(ce.progress_percentage), 1) as avg_progress,
         
         -- Lessons
         COUNT(DISTINCT lc.id) as total_completed_lessons,
         
         -- Grades
         ROUND(AVG(ce.final_grade), 1) as avg_grade,
         
         -- Certificates
         COUNT(DISTINCT cert.id) as certificates_earned
         
       FROM course_enrollments ce
       LEFT JOIN lesson_completions lc 
         ON lc.enrollment_id = ce.student_id
       LEFT JOIN certificates cert 
         ON cert.enrollment_id = ce.id
       WHERE ce.student_id = $1 AND NOT ce.is_deleted`,
      [req.user.id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching stats:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. LECTURER: Student Progress σε course          *doyleyei postman*
app.get("/api/courses/:courseId/student-progress/:studentId", authenticateToken, async (req, res) => {
  const { courseId, studentId } = req.params;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can view student progress" });
  }

  try {
    // Έλεγχος ότι το course ανήκει στον lecturer
    if (req.user.role === "lecturer") {
      const courseCheck = await pool.query(
        `SELECT id FROM courses WHERE id = $1 AND lecturer_id = $2`,
        [courseId, req.user.id]
      );

      if (courseCheck.rows.length === 0) {
        return res.status(403).json({ error: "You can only view progress from your own courses" });
      }
    }

    // Student info & enrollment
    const enrollment = await pool.query(
      `SELECT 
         ce.id as enrollment_id,
         ce.enrolled_at,
         ce.progress_percentage,
         ce.final_grade,
         ce.status,
         u.first_name,
         u.last_name,
         u.email
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.student_id
       WHERE ce.student_id = $1 AND ce.course_id = $2 AND NOT ce.is_deleted`,
      [studentId, courseId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ error: "Student not enrolled in this course" });
    }

    const studentData = enrollment.rows[0];

    // Detailed progress
    const sections = await pool.query(
      `SELECT 
         cs.id,
         cs.title,
         cs.order_index,
         COUNT(l.id) as total_lessons,
         COUNT(lc.id) as completed_lessons,
         ARRAY_AGG(
           JSON_BUILD_OBJECT(
             'id', l.id,
             'title', l.title,
             'completed', (lc.id IS NOT NULL),
             'completed_at', lc.completed_at
           ) ORDER BY l.order_index
         ) as lessons
       FROM course_sections cs
       LEFT JOIN lessons l ON l.section_id = cs.id AND NOT l.is_deleted
       LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.enrollment_id = $1
       WHERE cs.course_id = $2 AND NOT cs.is_deleted
       GROUP BY cs.id
       ORDER BY cs.order_index ASC`,
      [studentId, courseId]
    );

    res.json({
      student: studentData,
      sections: sections.rows
    });

  } catch (err) {
    console.error("❌ Error fetching student progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 6. RECALCULATE PROGRESS (Utility endpoint)         *doyleyei postman*
app.post("/api/enrollments/:enrollmentId/recalculate-progress", authenticateToken, async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    // Έλεγχος δικαιωμάτων
    const enrollment = await pool.query(
      `SELECT student_id FROM course_enrollments WHERE id = $1`,
      [enrollmentId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    if (req.user.role === "student" && enrollment.rows[0].student_id !== req.user.id) {
      return res.status(403).json({ error: "You can only recalculate your own progress" });
    }

    // Recalculate
    const progressResult = await pool.query(
      `SELECT calculate_course_progress($1::INTEGER) AS progress`,
      [enrollmentId]
    );

    const newProgress = progressResult.rows[0].progress || 0;

    // Update
    await pool.query(
      `UPDATE course_enrollments
       SET progress_percentage = $1, updated_at = NOW()
       WHERE id = $2`,
      [newProgress, enrollmentId]
    );

    res.json({
      message: "Progress recalculated",
      progress: newProgress
    });

  } catch (err) {
    console.error("❌ Error recalculating progress:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ========================================
// ENROLLMENT SYSTEM - ΑΠΛΟ & ΛΕΙΤΟΥΡΓΙΚΟ
// ========================================

// 1. ΦΟΙΤΗΤΗΣ ΓΡΑΦΕΤΑΙ ΣΕ ΜΑΘΗΜΑ (Enroll)          *doyleyei POSTMAN*
app.post("/api/courses/:courseId/enroll", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  // Μόνο students μπορούν να γραφτούν
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can enroll in courses" });
  }

  try {
    // 1. Έλεγχος: Υπάρχει το course;
    const courseCheck = await pool.query(
      `SELECT id, title, price, status, max_students
       FROM courses 
       WHERE id = $1 AND NOT is_deleted AND status = 'published'`,
      [courseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({ error: "Course not found or not published" });
    }

    const course = courseCheck.rows[0];

    // 2. Έλεγχος: Είναι ήδη εγγεγραμμένος;
    const existingEnrollment = await pool.query(
      `SELECT id, status FROM course_enrollments
       WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
      [req.user.id, courseId]
    );

    if (existingEnrollment.rows.length > 0) {
      return res.status(400).json({ 
        error: "Already enrolled in this course",
        enrollment: existingEnrollment.rows[0]
      });
    }

    // 3. Έλεγχος: Είναι γεμάτο το μάθημα;
    if (course.max_students) {
      const enrolledCount = await pool.query(
        `SELECT COUNT(*) as count FROM course_enrollments
         WHERE course_id = $1 AND status = 'active' AND NOT is_deleted`,
        [courseId]
      );

      if (parseInt(enrolledCount.rows[0].count) >= course.max_students) {
        return res.status(400).json({ error: "Course is full" });
      }
    }

    // 4. Δημιουργία εγγραφής
    const enrollment = await pool.query(
      `INSERT INTO course_enrollments (student_id, course_id, status, enrolled_at)
       VALUES ($1, $2, 'active', NOW())
       RETURNING id, student_id, course_id, status, enrolled_at, progress_percentage`,
      [req.user.id, courseId]
    );

    res.status(201).json({
      message: "Successfully enrolled in course",
      enrollment: enrollment.rows[0],
      course: {
        id: course.id,
        title: course.title
      }
    });

  } catch (err) {
    console.error("❌ Enrollment error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. ΤΑ ΜΑΘΗΜΑΤΑ ΜΟΥ (My Enrollments)              *doyleyei POSTMAN*
app.get("/api/my-enrollments", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can view enrollments" });
  }

  try {
    const result = await pool.query(
      `SELECT 
         ce.id as enrollment_id,
         ce.status,
         ce.enrolled_at,
         ce.progress_percentage,
         ce.final_grade,
         c.id as course_id,
         c.title,
         c.slug,
         c.short_description,
         c.difficulty,
         u.first_name || ' ' || u.last_name AS lecturer_name,
         (SELECT COUNT(*) FROM course_sections WHERE course_id = c.id AND NOT is_deleted) as section_count,
         (SELECT COUNT(*) FROM lessons l 
          JOIN course_sections cs ON l.section_id = cs.id 
          WHERE cs.course_id = c.id AND NOT l.is_deleted) as lesson_count
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       JOIN users u ON u.id = c.lecturer_id
       WHERE ce.student_id = $1 AND NOT ce.is_deleted
       ORDER BY ce.enrolled_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching enrollments:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. ENROLLMENT DETAILS (με progress)            *doyleyei POSTMAN*
app.get("/api/enrollments/:enrollmentId", authenticateToken, async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    // Πάρε το enrollment
    const enrollment = await pool.query(
      `SELECT ce.*, 
              c.title as course_title,
              c.slug,
              c.description
       FROM course_enrollments ce
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.id = $1 AND NOT ce.is_deleted`,
      [enrollmentId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    const enrollmentData = enrollment.rows[0];

    // Έλεγχος δικαιωμάτων
    if (req.user.role === "student" && enrollmentData.student_id !== req.user.id) {
      return res.status(403).json({ error: "You can only view your own enrollments" });
    }

    // Πάρε τα sections με το progress
    const sections = await pool.query(
      `SELECT 
         cs.id,
         cs.title,
         cs.order_index,

         --Συνολικά lessons στο section
         (SELECT COUNT(*) FROM lessons WHERE section_id = cs.id AND NOT is_deleted) as total_lessons,
         
         --Ολοκληρωμένα lessons για το συγκεκριμένο enrollment
         (SELECT COUNT(*) FROM lesson_completions lc
          JOIN lessons l ON l.id = lc.lesson_id
          WHERE l.section_id = cs.id 
            AND lc.enrollment_id = $1)
       FROM course_sections cs
       WHERE cs.course_id = $2 AND NOT cs.is_deleted
       ORDER BY cs.order_index ASC`,
      [enrollmentData.id, enrollmentData.course_id]
    );

    enrollmentData.sections = sections.rows;

    res.json(enrollmentData);
  } catch (err) {
    console.error("❌ Error fetching enrollment details:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. UNENROLL (Διαγραφή εγγραφής)                  *DOYLEYEI POSTMAN*
app.delete("/api/enrollments/:enrollmentId", authenticateToken, async (req, res) => {
  const { enrollmentId } = req.params;

  try {
    // Έλεγχος δικαιωμάτων
    const enrollment = await pool.query(
      `SELECT student_id FROM course_enrollments WHERE id = $1`,
      [enrollmentId]
    );

    if (enrollment.rows.length === 0) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    if (req.user.role === "student" && enrollment.rows[0].student_id !== req.user.id) {
      return res.status(403).json({ error: "You can only unenroll yourself" });
    }

    // Soft delete
    await pool.query(
      `UPDATE course_enrollments
       SET is_deleted = TRUE, deleted_at = NOW()
       WHERE id = $1`,
      [enrollmentId]
    );

    res.json({ message: "Successfully unenrolled from course" });
  } catch (err) {
    console.error("❌ Error unenrolling:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. LECTURER: Φοιτητές του μαθήματος             *DOYLEYEI POSTMAN (?)*
app.get("/api/courses/:courseId/students", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers/admins can view students" });
  }

  try {
    // Έλεγχος ότι το course ανήκει στον lecturer
    if (req.user.role === "lecturer") {
      const courseCheck = await pool.query(
        `SELECT id FROM courses WHERE id = $1 AND lecturer_id = $2`,
        [courseId, req.user.id]
      );

      if (courseCheck.rows.length === 0) {
        return res.status(403).json({ error: "You can only view students from your own courses" });
      }
    }

    const result = await pool.query(
      `SELECT 
         ce.id as enrollment_id,
         ce.enrolled_at,
         ce.status,
         ce.progress_percentage,
         ce.final_grade,
         u.id as student_id,
         u.first_name,
         u.last_name,
         u.email,
         (SELECT COUNT(*) FROM lesson_completions lc
          JOIN lessons l ON l.id = lc.lesson_id
          JOIN course_sections cs ON cs.id = l.section_id
          WHERE cs.course_id = $1 AND lc.enrollment_id = u.id AND ce.status = 'completed') as completed_lessons
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.student_id
       WHERE ce.course_id = $1 AND NOT ce.is_deleted
       ORDER BY ce.enrolled_at DESC`,
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching students:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 6. ΕΛΕΓΧΟΣ: Είμαι εγγεγραμμένος;                 *doyleyei POSTMAN*
app.get("/api/courses/:courseId/check-enrollment", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "student") {
    return res.json({ enrolled: false });
  }

  try {
    const result = await pool.query(
      `SELECT id, status, enrolled_at, progress_percentage
       FROM course_enrollments
       WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
      [req.user.id, courseId]
    );

    if (result.rows.length === 0) {
      return res.json({ enrolled: false });
    }

    res.json({
      enrolled: true,
      enrollment: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Error checking enrollment:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ========================================
// QUIZZES & CERTIFICATES - ΑΠΛΟ & ΛΕΙΤΟΥΡΓΙΚΟ
// ========================================

// -----------------------------------------------
// QUIZZES
// -----------------------------------------------

// 1. LECTURER: Create Quiz για lesson              *DOYLEYEI POSTMAN*
app.post("/api/lessons/:lessonId/quiz", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { title, description, passing_score } = req.body;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers can create quizzes" });
  }

  const lessonCheck = await pool.query(
  "SELECT id FROM lessons WHERE id = $1 AND NOT is_deleted",
  [lessonId]
);

if (lessonCheck.rows.length === 0) {
  return res.status(404).json({ error: "Lesson not found" });
}

  try {
    const result = await pool.query(
      `INSERT INTO quizzes (lesson_id, title, description, passing_grade)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lesson_id, title, description, passing_grade, created_at`,
      [lessonId, title, description || null, passing_score || 70]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error creating quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. LECTURER: Add Questions to Quiz          *doyleyei postMAN*
app.post("/api/quizzes/:quizId/questions", authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { questions } = req.body; // Array of questions

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers can add questions" });
  }

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: "Questions array is required" });
  }

  const maxOrderResult = await pool.query(
  `SELECT COALESCE(MAX(order_index), -1) AS max_order
   FROM quiz_questions
   WHERE quiz_id = $1`,
  [quizId]
);

let startIndex = maxOrderResult.rows[0].max_order + 1;


  try {
    const insertedQuestions = [];

    for (let i = 0; i < questions.length; i++) {
      const { question_text, options, correct_answer } = questions[i];

      const result = await pool.query(
        `INSERT INTO quiz_questions (quiz_id, question_text, options, correct_answer, order_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, question_text, options, correct_answer, order_index`,
        [quizId, question_text, JSON.stringify(options), correct_answer, startIndex + i]
      );

      insertedQuestions.push(result.rows[0]);
    }

    res.status(201).json({
      message: `${insertedQuestions.length} questions added`,
      questions: insertedQuestions
    });
  } catch (err) {
    console.error("❌ Error adding questions:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. STUDENT: Get Quiz (χωρίς τις σωστές απαντήσεις)        *DOYLEYEI POSTMAN*
app.get("/api/quizzes/:quizId", authenticateToken, async (req, res) => {
  const { quizId } = req.params;

  try {
    // Quiz info
    const quiz = await pool.query(
      `SELECT q.id, q.title, q.description, q.passing_grade, q.lesson_id,
              l.title as lesson_title
       FROM quizzes q
       JOIN lessons l ON l.id = q.lesson_id
       WHERE q.id = $1`,
      [quizId]
    );

    if (quiz.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const quizData = quiz.rows[0];

    // Questions (χωρίς correct_answer για students)
    const questions = await pool.query(
      `SELECT id, question_text, options, order_index
       FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY order_index ASC`,
      [quizId]
    );

    quizData.questions = questions.rows.map(q => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options, // JSON array
      order_index: q.order_index
    }));

    res.json(quizData);
  } catch (err) {
    console.error("❌ Error fetching quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. STUDENT: Submit Quiz & Get Grade                *doyleyei postman*
app.post("/api/quizzes/:quizId/submit", authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { answers } = req.body; // { question_id: answer, ... }

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students can submit quizzes" });
  }

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: "Answers object is required" });
  }

  try {
    // 1. Πάρε τις σωστές απαντήσεις
    const questions = await pool.query(
      `SELECT id, correct_answer FROM quiz_questions WHERE quiz_id = $1`,
      [quizId]
    );

    if (questions.rows.length === 0) {
      return res.status(404).json({ error: "No questions found" });
    }

    // 2. Υπολογισμός score
    let correct = 0;
    const totalQuestions = questions.rows.length;

    questions.rows.forEach(q => {
      if (answers[q.id] && answers[q.id] === q.correct_answer) {
        correct++;
      }
    });

    const score = Math.round((correct / totalQuestions) * 100);

    // 3. Πάρε το lesson_id & course_id
    const quizInfo = await pool.query(
      `SELECT q.lesson_id, q.passing_grade, l.section_id, cs.course_id
       FROM quizzes q
       JOIN lessons l ON l.id = q.lesson_id
       JOIN course_sections cs ON cs.id = l.section_id
       WHERE q.id = $1`,
      [quizId]
    );

    const { lesson_id, passing_score, course_id } = quizInfo.rows[0];


    const enrollmentRes = await pool.query(
  `SELECT id 
   FROM course_enrollments
   WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
  [req.user.id, course_id]
);

if (enrollmentRes.rows.length === 0) {
  return res.status(403).json({ error: "Student is not enrolled in this course" });
}

const enrollmentId = enrollmentRes.rows[0].id;



    // 4. Αποθήκευση attempt
    const attempt = await pool.query(
      `INSERT INTO quiz_attempts 
       (enrollment_id, quiz_id, score, started_at, submitted_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING id, enrollment_id, quiz_id, score, submitted_at`,
      [enrollmentId, quizId, score]
    );

    // 5. Update final_grade στο enrollment (αν είναι ο τελικός βαθμός)
    const enrollment = await pool.query(
      `UPDATE course_enrollments
       SET final_grade = $1, updated_at = NOW()
       WHERE student_id = $2 AND course_id = $3
       RETURNING id, final_grade`,
      [score, req.user.id, course_id]
    );

    // 6. Αν score >= passing_score, έκδοση certificate
    let certificate = null;
    if (score >= passing_score && enrollment.rows.length > 0) {
      const certResult = await pool.query(
        `INSERT INTO certificates (enrollment_id, issued_at, certificate_url)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (enrollment_id) DO NOTHING
         RETURNING id, enrollment_id, issued_at, certificate_url`,
        [enrollment.rows[0].id, `/certificates/${enrollment.rows[0].id}.pdf`]
      );

      if (certResult.rows.length > 0) {
        certificate = certResult.rows[0];

        // Update enrollment
        await pool.query(
          `UPDATE course_enrollments
           SET certificate_issued = true, completed_at = NOW(), status = 'completed'
           WHERE id = $1`,
          [enrollment.rows[0].id]
        );
      }
    }

    res.json({
      message: score >= passing_score ? "Quiz passed! 🎉" : "Quiz failed. Try again!",
      attempt: attempt.rows[0],
      score: score,
      correct_answers: correct,
      total_questions: totalQuestions,
      passing_score: passing_score,
      passed: score >= passing_score,
      certificate: certificate
    });

  } catch (err) {
    console.error("❌ Error submitting quiz:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. STUDENT: My Quiz Attempts                           *doyeleyei postman*
app.get("/api/my-quiz-attempts", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have quiz attempts" });
  }

  try {
    const result = await pool.query(
      `SELECT 
         qa.id,
         qa.quiz_id,
         qa.score,
         qa.submitted_at,
         q.title as quiz_title,
         q.passing_grade,
         l.title as lesson_title,
         c.title as course_title
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       JOIN course_sections cs ON cs.id = l.section_id
       JOIN courses c ON c.id = cs.course_id
       WHERE qa.enrollment_id = $1
       ORDER BY qa.submitted_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching attempts:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// -----------------------------------------------
// CERTIFICATES
// -----------------------------------------------

// 1. STUDENT: My Certificates                        *DOYLEYEI POSTMAN*
app.get("/api/my-certificates", authenticateToken, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Only students have certificates" });
  }

  try {
    const result = await pool.query(
      `SELECT 
         cert.id,
         cert.enrollment_id,
         cert.issued_at,
         cert.certificate_path,
         c.id as course_id,
         c.title as course_title,
         ce.final_grade,
         ce.completed_at
       FROM certificates cert
       JOIN course_enrollments ce ON ce.id = cert.enrollment_id
       JOIN courses c ON c.id = ce.course_id
       WHERE ce.student_id = $1
       ORDER BY cert.issued_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching certificates:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. GET Certificate (Public - για verification)            *DOYLEYEI POSTMAN*
app.get("/api/certificates/:certificateId/verify", async (req, res) => {
  const { certificateId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
         cert.id,
         cert.issued_at,
         u.first_name,
         u.last_name,
         c.title as course_title,
         ce.final_grade,
         ce.completed_at,
         i.name as institution_name
       FROM certificates cert
       JOIN course_enrollments ce ON ce.id = cert.enrollment_id
       JOIN users u ON u.id = ce.student_id
       JOIN courses c ON c.id = ce.course_id
       LEFT JOIN institutions i ON i.id = c.institution_id
       WHERE cert.id = $1`,
      [certificateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    res.json({
      valid: true,
      certificate: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Error verifying certificate:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. Download Certificate (Generate PDF)          *postman DOYLEYEI*
app.get("/api/certificates/:certificateId/download", authenticateToken, async (req, res) => {
  const { certificateId } = req.params;

  try {
    // Έλεγχος δικαιωμάτων
    const cert = await pool.query(
      `SELECT cert.*, ce.student_id
       FROM certificates cert
       JOIN course_enrollments ce ON ce.id = cert.enrollment_id
       WHERE cert.id = $1`,
      [certificateId]
    );

    if (cert.rows.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    if (req.user.role === "student" && cert.rows[0].student_id !== req.user.id) {
      return res.status(403).json({ error: "You can only download your own certificates" });
    }

    // Εδώ θα έπρεπε να generate το PDF
    // Για τώρα, στέλνουμε το URL
    res.json({
      message: "Certificate ready for download",
      download_url: cert.rows[0].certificate_url,
      note: "In production, this would generate a PDF"
    });

  } catch (err) {
    console.error("❌ Error downloading certificate:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. LECTURER: View Course Certificates            *doyleyei postman*
app.get("/api/courses/:courseId/certificates", authenticateToken, async (req, res) => {
  const { courseId } = req.params;

  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    return res.status(403).json({ error: "Only lecturers can view course certificates" });
  }

  try {
    // Έλεγχος ownership
    if (req.user.role === "lecturer") {
      const courseCheck = await pool.query(
        `SELECT id FROM courses WHERE id = $1 AND lecturer_id = $2`,
        [courseId, req.user.id]
      );

      if (courseCheck.rows.length === 0) {
        return res.status(403).json({ error: "You can only view certificates from your own courses" });
      }
    }

    const result = await pool.query(
      `SELECT 
         cert.id,
         cert.issued_at,
         u.first_name,
         u.last_name,
         u.email,
         ce.final_grade,
         ce.completed_at
       FROM certificates cert
       JOIN course_enrollments ce ON ce.id = cert.enrollment_id
       JOIN users u ON u.id = ce.student_id
       WHERE ce.course_id = $1
       ORDER BY cert.issued_at DESC`,
      [courseId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching course certificates:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

//__________________________21/2/26________________________________
// //--------------------------------------
// // -------------- Video ----------------
// //--------------------------------------
// //----------- Upload Routes ------------
// //--------------------------------------

// // Upload video για ένα lesson
// app.post("/api/lessons/:lessonId/upload-video", 
//   authenticateToken,
//   upload.single('video'),
//   async (req, res) => {
    
//     // 1. Role check
//     if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     if (!req.file) {
//       return res.status(400).json({ error: "No file" });
//     }

//     try {
//       // 2. Upload to Drive
//       const { data } = await drive.files.create({
//         resource: {
//           name: `lesson_${req.params.lessonId}_${Date.now()}.mp4`,
//           parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
//         },
//         media: {
//           mimeType: req.file.mimetype,
//           body: fs.createReadStream(req.file.path)
//         },
//         fields: 'id'
//       });

//       // 3. Make public
//       await drive.permissions.create({
//         fileId: data.id,
//         requestBody: { role: 'reader', type: 'anyone' }
//       });

//       // 4. Save to DB
//       const videoUrl = `https://drive.google.com/file/d/${data.id}/view`;
      
//       await pool.query(
//         `UPDATE lessons 
//          SET video_url = $1, drive_file_id = $2, 
//              video_filename = $3, video_size = $4
//          WHERE id = $5`,
//         [videoUrl, data.id, req.file.originalname, req.file.size, req.params.lessonId]
//       );

//       // 5. Cleanup
//       await unlink(req.file.path);

//       res.json({ 
//         message: "Video uploaded",
//         video_url: videoUrl 
//       });

//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ error: "Upload failed" });
//     }
//   }
// );

// //--------------------------------------------------------
// //-- Get Video Link - Get Video (with enrollment check) --
// //--------------------------------------------------------
// // Πάρε το video URL για ένα lesson
// app.get("/api/lessons/:lessonId/video", authenticateToken, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT l.video_url, l.is_free, cs.course_id
//        FROM lessons l
//        JOIN course_sections cs ON cs.id = l.section_id
//        WHERE l.id = $1`,
//       [req.params.lessonId]
//     );

//     if (!result.rows[0]?.video_url) {
//       return res.status(404).json({ error: "No video" });
//     }

//     const lesson = result.rows[0];

//     // Application-level access control
//     if (!lesson.is_free) {
//       const enrolled = await pool.query(
//         `SELECT 1 FROM course_enrollments 
//          WHERE student_id = $1 AND course_id = $2 AND status = 'active'`,
//         [req.user.id, lesson.course_id]
//       );

//       if (enrolled.rows.length === 0) {
//         return res.status(403).json({ error: "Must enroll" });
//       }
//     }

//     res.json({ video_url: lesson.video_url });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Error" });
//   }
// });

// //---------deletevideo----------
// // Διαγραφή video από Google Drive
// app.delete("/api/lessons/:lessonId/video", authenticateToken, async (req, res) => {
//   if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//     return res.status(403).json({ error: "Forbidden" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT drive_file_id FROM lessons WHERE id = $1`,
//       [req.params.lessonId]
//     );

//     if (result.rows[0]?.drive_file_id) {
//       await drive.files.delete({ fileId: result.rows[0].drive_file_id });
//     }

//     await pool.query(
//       `UPDATE lessons 
//        SET video_url = NULL, drive_file_id = NULL, 
//            video_filename = NULL, video_size = NULL
//        WHERE id = $1`,
//       [req.params.lessonId]
//     );

//     res.json({ message: "Video deleted" });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Delete failed" });
//   }
// });

//__________________________14/2/26________________________________




//----------------------------------------------------------------------------------------------------------------------

// // Admin/Lecturer - list enrollments for a course
// // O admin ή o lecturer βλεπουν τις εγγραφές
// app.get("/api/course-enrollments/:courseId", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;

//   // Μόνο admin και lecturer επιτρέπεται να δουν τις εγγραφές
//   if (req.user.role !== "admin" && req.user.role !== "lecturer") {
//     return res.status(403).json({ error: "Forbidden" });
//   }

//   try {
//     // Παίρνουμε τις εγγραφές του συγκεκριμένου course μαζί με τα στοιχεία του course
//     const result = await pool.query(
//       `SELECT ce.id, ce.student_id, u.first_name, u.last_name, u.email, ce.status, ce.enrolled_at,
//               c.id AS course_id, c.title AS course_title, c.slug AS course_slug
//        FROM course_enrollments ce
//        JOIN users u ON ce.student_id = u.id
//        JOIN courses c ON ce.course_id = c.id
//        WHERE ce.course_id = $1 AND ce.is_deleted = FALSE`,
//       [courseId]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching course enrollments:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Ο μαθητής εγγράφεται σε course
// // Enroll student in a course
// app.post("/api/enroll/:courseId", authenticateToken, async (req, res) => {
//   const { courseId } = req.params;

//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can enroll in courses" });
//   }

//   try {
//     // Check if course exists
//     const course = await pool.query(
//       `SELECT id, price FROM courses WHERE id = $1 AND NOT is_deleted AND status = 'published'`,
//       [courseId]
//     );
//     if (course.rows.length === 0) {
//       return res.status(404).json({ error: "Course not found" });
//     }

//     // Check if already enrolled
//     const existing = await pool.query(
//       `SELECT id FROM course_enrollments WHERE student_id = $1 AND course_id = $2 AND NOT is_deleted`,
//       [req.user.id, courseId]
//     );
//     if (existing.rows.length > 0) {
//       return res.status(400).json({ error: "Already enrolled" });
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
//     console.error("❌ Error enrolling:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Δες όλα τα courses που έχεις εγγραφεί
// // Get all enrolled courses for logged-in student
// app.get("/api/my-enrollments", authenticateToken, async (req, res) => {
//   if (req.user.role !== "student") {
//     return res.status(403).json({ error: "Only students can view enrollments" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT c.id, c.title, c.short_description, ce.status, ce.enrolled_at
//        FROM course_enrollments ce
//        JOIN courses c ON c.id = ce.course_id
//        WHERE ce.student_id = $1 AND NOT ce.is_deleted`,
//       [req.user.id]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching enrollments:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

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

// //-----------------------------------------------------
// //----------- Admin Endpoints για Payments ------------
// //-----------------------------------------------------

// // Όλες οι πληρωμές στην πλατφόρμα
// // Admin: get all payments
// app.get("/api/admin/payments", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can view all payments" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT p.id, u.email AS student_email, c.title AS course_title,
//               p.amount, p.currency, p.status, p.payment_method, p.created_at
//        FROM payments p
//        JOIN users u ON u.id = p.id
//        JOIN courses c ON c.id = p.id
//        ORDER BY p.created_at DESC`
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching payments (admin):", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Όλες οι πληρωμές που έγιναν σε courses του lecturer
// // Lecturer: get payments for my courses
// app.get("/api/lecturer/payments", authenticateToken, async (req, res) => {
//   if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only lecturers or admins can view payments" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT p.id, u.email AS student_email, c.title AS course_title,
//               p.amount, p.currency, p.payment_status, p.payment_method, p.created_at
//        FROM payments p
//        JOIN users u ON u.id = p.user_id
//        JOIN courses c ON c.id = p.course_id
//        WHERE c.lecturer_id = $1
//        ORDER BY p.created_at DESC`,
//       [req.user.id]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching payments (lecturer):", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Μικρό dashboard με συνολικά στοιχεία
// // Admin: stats overview
// app.get("/api/admin/stats", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can view stats" });
//   }

//   try {
//     const stats = await pool.query(`
//       SELECT 
//         (SELECT COUNT(*) FROM users WHERE NOT is_deleted) AS total_users,
//         (SELECT COUNT(*) FROM courses WHERE NOT is_deleted) AS total_courses,
//         (SELECT COUNT(*) FROM payments) AS total_payments,
//         (SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_status = 'completed') AS total_revenue
//     `);

//     res.json(stats.rows[0]);
//   } catch (err) {
//     console.error("❌ Error fetching stats:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// //------------------------------------------------------
// //----------- Endpoints για User Management ------------
// //------------------------------------------------------

// // Λίστα με όλους τους χρήστες
// // Admin: get all users
// app.get("/api/admin/users", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can view users" });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT id, email, first_name, last_name, role, is_active, created_at 
//        FROM users 
//        WHERE NOT is_deleted 
//        ORDER BY created_at DESC`
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching users:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Admin: get single user
// app.get("/api/admin/users/:id", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can view users" });
//   }

//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
//        FROM users 
//        WHERE id = $1 AND NOT is_deleted`,
//       [id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error fetching user:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Admin: create new user
// app.post("/api/admin/users", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can create users" });
//   }

//   const { email, password, first_name, last_name, role } = req.body;

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);

//     const result = await pool.query(
//       `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
//        VALUES ($1, $2, $3, $4, $5, TRUE)
//        RETURNING id, email, first_name, last_name, role, created_at`,
//       [email, hashedPassword, first_name, last_name, role || "student"]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error creating user:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Admin: update user
// app.put("/api/admin/users/:id", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can update users" });
//   }

//   const { id } = req.params;
//   const { first_name, last_name, role, is_active } = req.body;

//   try {
//     const result = await pool.query(
//       `UPDATE users
//        SET first_name = $1, last_name = $2, role = $3, is_active = $4
//        WHERE id = $5 AND NOT is_deleted
//        RETURNING id, email, first_name, last_name, role, is_active, updated_at`,
//       [first_name, last_name, role, is_active, id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error updating user:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// // Admin: delete (soft delete) user
// app.delete("/api/admin/users/:id", authenticateToken, async (req, res) => {
//   if (req.user.role !== "admin") {
//     return res.status(403).json({ error: "Only admins can delete users" });
//   }

//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       `UPDATE users
//        SET is_deleted = TRUE, deleted_at = NOW()
//        WHERE id = $1 AND NOT is_deleted
//        RETURNING id, email`,
//       [id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json({ message: "User deleted", user: result.rows[0] });
//   } catch (err) {
//     console.error("❌ Error deleting user:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });

// //------------------------------------------------
// //----------- Notifications Endpoints ------------
// //------------------------------------------------

// // // Φέρνει όλες τις ειδοποιήσεις του logged-in χρήστη
// // // Get my notifications
// // app.get("/api/notifications", authenticateToken, async (req, res) => {
// //   try {
// //     const result = await pool.query(
// //       `SELECT id, type, message, is_read, created_at
// //        FROM notifications
// //        WHERE user_id = $1
// //        ORDER BY created_at DESC`,
// //       [req.user.id]
// //     );
// //     res.json(result.rows);
// //   } catch (err) {
// //     console.error("❌ Error fetching notifications:", err.message);
// //     res.status(500).json({ error: "Database error" });
// //   }
// // });

// // // Μαρκάρει notification ως διαβασμένο
// // // Mark notification as read
// // app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
// //   const { id } = req.params;

// //   try {
// //     const result = await pool.query(
// //       `UPDATE notifications
// //        SET is_read = TRUE
// //        WHERE id = $1 AND user_id = $2
// //        RETURNING id, message, is_read`,
// //       [id, req.user.id]
// //     );

// //     if (result.rows.length === 0) {
// //       return res.status(404).json({ error: "Notification not found" });
// //     }

// //     res.json(result.rows[0]);
// //   } catch (err) {
// //     console.error("❌ Error updating notification:", err.message);
// //     res.status(500).json({ error: "Database error" });
// //   }
// // });

// // // Admin μπορεί να στείλει ειδοποίηση σε χρήστη (ή μαζικά)
// // // Admin: send notification to a user
// // app.post("/api/admin/notifications", authenticateToken, async (req, res) => {
// //   if (req.user.role !== "admin") {
// //     return res.status(403).json({ error: "Only admins can send notifications" });
// //   }

// //   const { user_id, type, message } = req.body;

// //   try {
// //     const result = await pool.query(
// //       `INSERT INTO notifications (user_id, type, message, is_read) 
// //        VALUES ($1, $2, $3, FALSE)
// //        RETURNING id, user_id, type, message, created_at`,
// //       [user_id, type || "info", message]
// //     );

// //     res.status(201).json(result.rows[0]);
// //   } catch (err) {
// //     console.error("❌ Error creating notification:", err.message);
// //     res.status(500).json({ error: "Database error" });
// //   }
// // });


// //--------------------------------------------
// //----------- Messaging Endpoints ------------
// //--------------------------------------------


// // Αποστολή νέου μηνύματος (direct ή announcement ή forum post)
// // Send a message
// // app.post("/api/messages", authenticateToken, async (req, res) => {
// //   const { recipient_id, course_id, subject, content, message_type, parent_message_id } = req.body;

// //   try {
// //     const result = await pool.query(
// //       `INSERT INTO messages (sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id)
// //        VALUES ($1, $2, $3, $4, $5, $6, $7)
// //        RETURNING id, sender_id, recipient_id, course_id, subject, content, message_type, parent_message_id, sent_at`,
// //       [req.user.id, recipient_id || null, course_id || null, subject || null, content, message_type || "direct_message", parent_message_id || null]
// //     );

// //     res.status(201).json(result.rows[0]);
// //   } catch (err) {
// //     console.error("❌ Error sending message:", err.message);
// //     res.status(500).json({ error: "Database error" });
// //   }
// // });

// app.post("/api/messages", authenticateToken, async (req, res) => {
//   const { recipient_id, course_id, subject, content, message_type, parent_message_id } = req.body;

//   try {
//     if (parent_message_id) {
//       const parentCheck = await pool.query(
//         "SELECT id FROM messages WHERE id = $1 AND NOT is_deleted", [parent_message_id]
//       );
//       if (parentCheck.rows.length === 0) {
//         return res.status(400).json({ error: "Invalid parent_message_id" });
//       }
//     }

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



// // Φέρνει όλα τα μηνύματα του χρήστη (εισερχόμενα + απεσταλμένα)
// // Get my messages (inbox + sent)
// app.get("/api/messages", authenticateToken, async (req, res) => {
//   try {
//     const result = await pool.query(
//       `SELECT m.id, m.sender_id, s.email AS sender_email,
//               m.recipient_id, r.email AS recipient_email,
//               m.course_id, c.title AS course_title,
//               m.subject, m.content, m.message_type,
//               m.parent_message_id, m.is_read, m.is_important, m.sent_at
//        FROM messages m
//        LEFT JOIN users s ON s.id = m.sender_id
//        LEFT JOIN users r ON r.id = m.recipient_id
//        LEFT JOIN courses c ON c.id = m.course_id
//        WHERE m.sender_id = $1 OR m.recipient_id = $1
//        ORDER BY m.sent_at DESC`,
//       [req.user.id]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching messages:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Φέρνει thread συζήτησης (όλα τα replies ενός parent message)
// // Το endpoint δίνει όλα τα μηνύματα ενός νήματος ξεκινώντας από το αρχικό μήνυμα id
// // Get a message thread (all replies)
// app.get("/api/messages/thread/:id", authenticateToken, async (req, res) => {
//   const { id } = req.params;


//   // WITH RECURSIVE -> ειδική δομή SQL που επιτρέπει να γράφουμε ερωτήματα που 
//   // αναδρομικά "σκαρφαλώνουν" σε ιεραρχικά δεδομένα (όπως δέντρα ή νήματα μηνυμάτων)
//   // επιτρέπει σε ένα query να κάνει επανάληψη (recursion) - για δεδομένα με ιεραρχική σχέση
//   // UNION ALL: συνενώνει τα αποτελέσματα των δύο SELECT - ΔΕΝ αφαιρεί διπλότυπα 
//   // UNION: συνενώνει αποτελέσματα ΚΑΙ αφαιρεί διπλότυπα

//   try {
//     const result = await pool.query(
//       `WITH RECURSIVE thread AS (
//          SELECT * FROM messages WHERE id = $1
//          UNION ALL
//          SELECT m.* FROM messages m
//          JOIN thread t ON m.parent_message_id = t.id
//        )
//        SELECT t.id, t.sender_id, s.email AS sender_email,
//               t.recipient_id, r.email AS recipient_email,
//               t.subject, t.content, t.message_type,
//               t.is_read, t.sent_at
//        FROM thread t
//        LEFT JOIN users s ON s.id = t.sender_id
//        LEFT JOIN users r ON r.id = t.recipient_id
//        ORDER BY t.sent_at ASC`,
//       [id]
//     );

//     res.json(result.rows);
//   } catch (err) {
//     console.error("❌ Error fetching thread:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Μαρκάρει μήνυμα ως διαβασμένο
// // Mark message as read
// app.put("/api/messages/:id/read", authenticateToken, async (req, res) => {
//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       `UPDATE messages
//        SET is_read = TRUE, read_at = NOW()
//        WHERE id = $1 AND recipient_id = $2
//        RETURNING id, subject, is_read, read_at`,
//       [id, req.user.id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "Message not found" });
//     }

//     res.json(result.rows[0]);
//   } catch (err) {
//     console.error("❌ Error marking message as read:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });


// // Soft delete message
// app.delete("/api/messages/:id", authenticateToken, async (req, res) => {
//   const { id } = req.params;

//   try {
//     const result = await pool.query(
//       `UPDATE messages
//        SET is_deleted = TRUE, deleted_at = NOW()
//        WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)
//        RETURNING id, subject`,
//       [id, req.user.id]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: "Message not found or not yours" });
//     }

//     res.json({ message: "Message deleted", messageData: result.rows[0] });
//   } catch (err) {
//     console.error("❌ Error deleting message:", err.message);
//     res.status(500).json({ error: "Database error" });
//   }
// });







// // Upload video for lesson
// app.post("/api/lessons/:lessonId/upload/video", authenticateToken, uploadVideo.single("video"), async (req, res) => {
//     if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//       return res.status(403).json({ error: "Only lecturers/admins can upload videos" });
//     }

//     const { lessonId } = req.params;
//     const file = req.file;

//     try {
//       await pool.query(
//         `UPDATE lessons
//          SET video_path = $1, video_filename = $2, video_size = $3
//          WHERE id = $4 AND NOT is_deleted
//          RETURNING id, title, video_filename, video_size, video_path`,
//         [file.path, file.originalname, file.size, lessonId]
//       );

//       res.json({ message: "Video uploaded successfully", file });
//     } catch (err) {
//       console.error("❌ Error uploading video:", err.message);
//       res.status(500).json({ error: "Database error" });
//     }
//   }
// );


// // Upload PDF for lesson
// app.post(
//   "/api/lessons/:lessonId/upload/pdf",
//   authenticateToken,
//   uploadPDF.single("pdf"),
//   async (req, res) => {
//     if (req.user.role !== "lecturer" && req.user.role !== "admin") {
//       return res.status(403).json({ error: "Only lecturers/admins can upload PDFs" });
//     }

//     const { lessonId } = req.params;
//     const file = req.file;

//     try {
//       await pool.query(
//         `UPDATE lessons
//          SET pdf_path = $1, pdf_filename = $2, pdf_size = $3
//          WHERE id = $4 AND NOT is_deleted
//          RETURNING id, title, pdf_filename, pdf_size, pdf_path`,
//         [file.path, file.originalname, file.size, lessonId]
//       );

//       res.json({ message: "PDF uploaded successfully", file });
//     } catch (err) {
//       console.error("❌ Error uploading PDF:", err.message);
//       res.status(500).json({ error: "Database error" });
//     }
//   }
// );

// // Serve Files (static)
// // Για να μπορεί το frontend να τα κατεβάζει:
// // Έτσι ένα video που αποθηκεύτηκε στο uploads/videos/12345.mp4 θα είναι προσβάσιμο στο: http://localhost:5000/uploads/videos/12345.mp4
// app.use("/uploads", express.static("uploads")); // στατικό σερβίρισμα αρχείων


// //-------------------------------------------
// //----------- Authenticate Token ------------
// //-------------------------------------------

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


// //-------------------------------------------
// //----------- Messages 7/03/2026 ------------
// //-------------------------------------------

// Get message history between two users
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
  const currentUserId = req.user.id;
  const otherUserId = parseInt(req.params.userId);

  if (isNaN(otherUserId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (currentUserId === otherUserId) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  try {
    const result = await pool.query(
      `SELECT 
         m.id, 
         m.sender_id, 
         m.recipient_id, 
         m.content, 
         m.sent_at,
         sender.first_name as sender_first_name,
         sender.last_name as sender_last_name,
         recipient.first_name as recipient_first_name,
         recipient.last_name as recipient_last_name
       FROM messages m
       JOIN users sender ON m.sender_id = sender.id
       JOIN users recipient ON m.recipient_id = recipient.id
       WHERE 
         (m.sender_id = $1 AND m.recipient_id = $2)
         OR
         (m.sender_id = $2 AND m.recipient_id = $1)
       ORDER BY m.sent_at ASC
       LIMIT 100`,
      [currentUserId, otherUserId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});


// Get list of users I can chat with
// Get users to chat with (sorted by last message)
app.get('/api/users/chat-list', authenticateToken, async (req, res) => {
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  try {
    let query;
    
    if (currentUserRole === 'student') {
      // Students see lecturers, sorted by last message
      query = `
        SELECT 
          u.id, 
          u.first_name, 
          u.last_name, 
          u.email, 
          u.role,
          MAX(m.sent_at) as last_message_at
        FROM users u
        LEFT JOIN messages m ON 
          (m.sender_id = u.id AND m.recipient_id = $1) OR
          (m.recipient_id = u.id AND m.sender_id = $1)
        WHERE u.role IN ('lecturer', 'admin')
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
        ORDER BY last_message_at DESC NULLS LAST, u.first_name ASC
      `;
    } else if (currentUserRole === 'lecturer' || currentUserRole === 'admin') {
      // Lecturers see students, sorted by last message
      query = `
        SELECT 
          u.id, 
          u.first_name, 
          u.last_name, 
          u.email, 
          u.role,
          MAX(m.sent_at) as last_message_at
        FROM users u
        LEFT JOIN messages m ON 
          (m.sender_id = u.id AND m.recipient_id = $1) OR
          (m.recipient_id = u.id AND m.sender_id = $1)
        WHERE u.role = 'student'
        GROUP BY u.id, u.first_name, u.last_name, u.email, u.role
        ORDER BY last_message_at DESC NULLS LAST, u.first_name ASC
      `;
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }

    const result = await pool.query(query, [currentUserId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching chat list:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});



// // Job που τρέχει κάθε 1 ώρα
// cron.schedule("1 * * * *", async () => {
//   try {
//     const query = `
//       INSERT INTO daily_stats (date, new_users, new_enrollments,    total_revenue, active_students)
//       VALUES (
//           CURRENT_DATE,
//           (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURRENT_DATE),
//           (SELECT COUNT(*) FROM course_enrollments WHERE DATE(enrolled_at) = CURRENT_DATE),
          
//           (SELECT COALESCE(SUM(amount),0) FROM payments WHERE DATE(created_at) = CURRENT_DATE AND status='completed'),
//           (SELECT COUNT(DISTINCT student_id) FROM course_enrollments WHERE DATE(enrolled_at) = CURRENT_DATE)
//       )
//       ON CONFLICT (date)
//       DO UPDATE SET
//         new_users = EXCLUDED.new_users,
//         new_enrollments = EXCLUDED.new_enrollments,
        
//         total_revenue = EXCLUDED.total_revenue,
//         active_students = EXCLUDED.active_students,
//         created_at = NOW();
//     `;
// //completed_lessons,
// //(SELECT COUNT(*) FROM lesson_completions WHERE DATE(completed_at) = CURRENT_DATE),
// //completed_lessons = EXCLUDED.completed_lessons,

//     await pool.query(query);
//     console.log("✅ Daily stats updated at", new Date().toISOString());
//   } catch (err) {
//     console.error("❌ Error updating daily stats:", err.message);
//   }
// });





// // // ----- 7. ΝΕΑ ΛΟΓΙΚΗ REDIS SUBSCRIBER -----
// // // Αυτή η συνάρτηση τρέχει αυτόνομα και "ακούει" για μηνύματα
// // async function setupRedisSubscription() {
// //   await redisSubscriber.subscribe('course:*', (message, channel) => {
// //     // channel = 'course:123'
// //     // message = '{"id": 5, "sender_id": 1, ...}'
    
// //     console.log(`Message from Redis on channel ${channel}. Broadcasting to room...`);
    
// //     // Στείλτε το μήνυμα σε ΟΛΟΥΣ τους χρήστες (React)
// //     // που είναι συνδεδεμένοι στο αντίστοιχο δωμάτιο (π.χ. 'course:123')
// //     io.to(channel).emit('new_message', JSON.parse(message));
// //   });
// // }


// ----- 8. ΕΝΗΜΕΡΩΜΕΝΗ ΣΥΝΑΡΤΗΣΗ ΕΚΚΙΝΗΣΗΣ -----
async function startServer() {
  try {
    // 1. Σύνδεση στον Redis
    await redisClient.connect();
    await redisSubscriber.connect(); // <-- Σύνδεση ΚΑΙ του subscriber
    console.log('✅ Επιτυχής σύνδεση με τον Redis server (x2)!');

    // 2. Ξεκίνα να "ακούς" για μηνύματα chat
    await setupRedisSubscription();
    console.log('🎧 O Redis Subscriber "ακούει" για μηνύματα chat.');

    // 3. Σύνδεση στην PostgreSQL
    await pool.query('SELECT 1');
    console.log('✅ Επιτυχής σύνδεση με την PostgreSQL!');

    // 4. Εκκίνηση του Express (πλέον χρησιμοποιούμε το 'server', όχι το 'app')
    // const PORT = process.env.PORT || 5000;
    // server.listen(PORT, () => { // <-- ΑΛΛΑΓΗ: server.listen αντί για app.listen
    //   console.log(`🚀 Server running at: http://localhost:${PORT}`);
    // });

//     server.listen(PORT, () => {
//   console.log(`🚀 Server running at: http://localhost:${PORT}`);
// });

  } catch (err) {
    console.error('❌ Αποτυχία εκκίνησης του server.');
    console.error(err);
    process.exit(1);
  }
}

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
// async function startServer() {
//   try {
//     await redisClient.connect();
//     await setupRedisSubscription();
//     console.log('✅ Redis connected');

//     await pool.query('SELECT 1');
//     console.log('✅ PostgreSQL connected');

//     const PORT = process.env.PORT || 5000;
//     server.listen(PORT, () => {
//       console.log(`🚀 Server running at http://localhost:${PORT}`);
//     });

//   } catch (err) {
//     console.error('❌ Server failed to start', err);
//     process.exit(1);
//   }
// }





// //--------------------------------------------------------------------------------

// // -------------------------------------------------
// // -------------- REAL-TIME CHAT LOGIC -------------
// // -------------------------------------------------

// // io.on('connection', (socket) => {
// //   console.log(`⚡ User connected: ${socket.id}`);

// //   // 1. Join Room: Ο φοιτητής μπαίνει στο chat ενός μαθήματος
// //   socket.on('join_room', async (courseId) => {
// //     const room = `course:${courseId}`;
// //     socket.join(room);
// //     console.log(`User ${socket.id} joined room: ${room}`);

// //     // (Προαιρετικά) Στείλε του τα 20 τελευταία μηνύματα από το Redis Cache
// //     try {
// //         const cachedMessages = await redisClient.lRange(`chat_history:${courseId}`, 0, 19);
// //         // Τα μηνύματα είναι strings, τα κάνουμε parse σε JSON και τα αντιστρέφουμε (παλιά -> νέα)
// //         const parsed = cachedMessages.map(msg => JSON.parse(msg)).reverse();
// //         socket.emit('previous_messages', parsed);
// //     } catch (e) {
// //         console.error("Error fetching history", e);
// //     }
// //   });

// //   // 2. Send Message: Ο φοιτητής στέλνει μήνυμα
// //   socket.on('send_message', async (data) => {
// //     // data = { course_id, sender_id, content, sender_name }
// //     const { course_id, sender_id, content, sender_name } = data;
// //     const room = `course:${course_id}`;

// //     // Δημιουργία αντικειμένου μηνύματος
// //     const messageData = {
// //       sender_id,
// //       sender_name, // Χρήσιμο για να φαίνεται το όνομα στο chat αμέσως
// //       content,
// //       course_id,
// //       created_at: new Date().toISOString(),
// //       type: 'live' // ένδειξη ότι είναι live
// //     };

// //     try {
// //       // ΒΗΜΑ Α: Αποθήκευση στη Βάση (PostgreSQL) - Η "Αλήθεια"
// //       const dbRes = await pool.query(
// //         `INSERT INTO messages (sender_id, course_id, content, sent_at) 
// //          VALUES ($1, $2, $3, NOW()) RETURNING id`,
// //         [sender_id, course_id, content]
// //       );
// //       messageData.id = dbRes.rows[0].id; // Προσθέτουμε το πραγματικό ID

// //       // ΒΗΜΑ Β: Αποθήκευση στο Redis Cache (Ιστορικό) - Η "Ταχύτητα"
// //       // Αποθηκεύουμε ως string
// //       await redisClient.lPush(`chat_history:${course_id}`, JSON.stringify(messageData));
// //       await redisClient.lTrim(`chat_history:${course_id}`, 0, 99); // Κρατάμε μόνο τα 100 τελευταία

// //       // ΒΗΜΑ Γ: Δημοσίευση (Publish) για να το δουν οι άλλοι
// //       await redisClient.publish(room, JSON.stringify(messageData));

// //     } catch (err) {
// //       console.error("❌ Chat Error:", err);
// //     }
// //   });

// //   socket.on('disconnect', () => {
// //     console.log('User disconnected', socket.id);
// //   });
// // });




// // --- REDIS SUBSCRIBER SETUP (Για να μοιράζει τα μηνύματα) ---
// // Αυτό τρέχει μία φορά και "ακούει" όλα τα κανάλια course:*
// // async function setupChatSubscriber() {
// //     // await redisSubscriber.subscribe('patter', (message, channel) => {
// //     //     // Προσοχή: Στην έκδοση redis v4+ το subscribe pattern είναι λίγο διαφορετικό,
// //     //     // αλλά για απλότητα θα κάνουμε subscribe σε συγκεκριμένα κανάλια ή θα το χειριστούμε ως εξής:
// //     // });
    
// //     // Εναλλακτικά, πιο απλά για τώρα:
// //     // Κάνουμε pSubscribe (Pattern Subscribe) σε όλα τα "course:*"
// //     await redisSubscriber.pSubscribe('course:*', (message, channel) => {
// //         // Το channel θα είναι π.χ. "course:15"
// //         // Το message είναι το JSON που στείλαμε πριν
// //         io.to(channel).emit('receive_message', JSON.parse(message));
// //     });
// //     console.log("🎧 Redis Subscriber is listening on course:* channels...");
// // }

// //-----------------------------------------

// // ----- 4. ΚΑΛΕΣΜΑ ΤΗΣ ΕΚΚΙΝΗΣΗΣ -----
// // Αφαιρέστε το παλιό "app.listen(PORT, ...)" από το τέλος του αρχείου
// // και βάλτε μόνο αυτό:
// startServer();