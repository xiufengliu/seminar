import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { openDb, initialize, checkTimeConflict } from './db.js';
import { notifyRequestCoordinator, notifySubmitter, sendSeminarInvitation, verifySmtp, notifyAdmins } from './email.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
// Allow credentials for cross-origin dev and same-origin prod
app.use(cors({ origin: true, credentials: true }));
// Support clients calling the API under "/api" by rewriting the prefix
app.use((req, res, next) => {
  if (req.url === '/api') req.url = '/';
  else if (req.url && req.url.startsWith('/api/')) req.url = req.url.slice(4);
  next();
});
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
// Resolve DB path robustly with safe fallbacks.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', '..', 'seminars.db');
const envDb = process.env.SQLITE_DB_PATH;
const candidates = [];
if (envDb) {
  const p = path.isAbsolute(envDb) ? envDb : path.resolve(__dirname, '..', envDb);
  candidates.push(p);
}
// Repo-root seminars.db based on file location
candidates.push(DEFAULT_DB_PATH);
// Common absolute deployment path
candidates.push('/opt/app/seminar/seminars.db');
// Also try process CWD relative if env set and not absolute
if (envDb && !path.isAbsolute(envDb)) candidates.push(path.resolve(process.cwd(), envDb));

let DB_PATH = candidates.find(p => {
  try { return fs.existsSync(p); } catch { return false; }
});
if (!DB_PATH) {
  // Fall back to the first candidate (prefer env resolution, else default)
  DB_PATH = envDb ? (path.isAbsolute(envDb) ? envDb : path.resolve(__dirname, '..', envDb)) : DEFAULT_DB_PATH;
}

const db = openDb(DB_PATH);
initialize(db);

// Ensure uploads directory exists at repo root and serve it
// Use path relative to this file to avoid cwd differences in systemd/pm2
const uploadDir = path.resolve(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
// Serve under both /uploads (direct) and /api/uploads (for clients building under /api)
app.use('/uploads', express.static(uploadDir));
app.use('/api/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

app.get('/health', (req, res) => res.json({ ok: true }));

// SMTP verify helper
app.get('/email/verify', async (req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

function setSessionCookie(res, payload){
  const token = jwt.sign(payload, SESSION_SECRET, { expiresIn: '7d' });
  const sameSite = ['lax', 'strict', 'none'].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : 'lax';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite,
    secure: COOKIE_SECURE || sameSite === 'none',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function getSession(req){
  let raw = null;
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (auth && typeof auth === 'string' && auth.startsWith('Bearer ')) {
    raw = auth.slice(7).trim();
  } else {
    raw = req.cookies?.[COOKIE_NAME];
  }
  if (!raw) return null;
  try { return jwt.verify(raw, SESSION_SECRET); } catch { return null; }
}

// Admin login -> sets HttpOnly cookie session
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  db.get(`SELECT password FROM admin_accounts WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, row.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = setSessionCookie(res, { sub: username, role: 'admin' });
    res.json({ ok: true, username, token });
  });
});

// Return current session (if valid)
app.get('/auth/me', (req, res) => {
  const sess = getSession(req);
  if (!sess) return res.status(401).json({ ok: false });
  res.json({ ok: true, username: sess.sub });
});

// Logout -> clear cookie
app.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// List seminars
app.get('/seminars', (req, res) => {
  const scope = req.query.scope || 'all';
  const today = dayjs().format('YYYY-MM-DD');
  let query = 'SELECT * FROM seminars';
  let params = [];
  if (scope === 'future') { query += ' WHERE date >= ?'; params = [today]; }
  else if (scope === 'past') { query += ' WHERE date < ?'; params = [today]; }
  // Order: past and all => newest first; future => chronological
  if (scope === 'past' || scope === 'all') query += ' ORDER BY date DESC, start_time DESC';
  else query += ' ORDER BY date ASC, start_time ASC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    try { console.log(`[GET /seminars] scope=${scope} rows=${Array.isArray(rows) ? rows.length : 'err'}`); } catch {}
    res.json(rows);
  });
});

// Debug endpoint to verify DB path and counts
app.get('/debug/db', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  db.serialize(() => {
    db.get(`SELECT COUNT(*) as cnt FROM seminars`, (e1, r1) => {
      if (e1) return res.status(500).json({ error: e1.message });
      db.get(`SELECT COUNT(*) as cnt FROM seminars WHERE date >= ?`, [today], (e2, r2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        db.get(`SELECT COUNT(*) as cnt FROM seminars WHERE date < ?`, [today], (e3, r3) => {
          if (e3) return res.status(500).json({ error: e3.message });
          db.get(`SELECT COUNT(*) as cnt FROM admin_accounts`, (e4, r4) => {
            if (e4) return res.status(500).json({ error: e4.message });
            db.all(`SELECT username FROM admin_accounts LIMIT 5`, (e5, r5) => {
              if (e5) return res.status(500).json({ error: e5.message });
              res.json({
                db_path: DB_PATH,
                today,
                counts: { total: r1?.cnt || 0, future: r2?.cnt || 0, past: r3?.cnt || 0, admins: r4?.cnt || 0 },
                admins: (r5 || []).map(x => x.username)
              });
            });
          });
        });
      });
    });
  });
});

// Create seminar
app.post('/seminars', async (req, res) => {
  const s = req.body;
  try {
    const conflict = await checkTimeConflict(db, s);
    if (conflict) return res.status(409).json({ error: 'Time conflict in room' });
    const stmt = db.prepare(`INSERT INTO seminars (date, start_time, end_time, speaker_name, speaker_email, speaker_bio, topic, abstract, room, seminar_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run([s.date, s.start_time, s.end_time, s.speaker_name, s.speaker_email, s.speaker_bio || '', s.topic, s.abstract || '', s.room, s.seminar_type || 'Others'], function(err){
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update seminar
app.put('/seminars/:id', upload.single('speaker_photo'), async (req, res) => {
  const id = Number(req.params.id);
  const s = req.body;
  try {
    const conflict = await checkTimeConflict(db, { ...s, exclude_id: id });
    if (conflict) return res.status(409).json({ error: 'Time conflict in room' });
    const photoPath = req.file ? `/uploads/${req.file.filename}` : '';
    const stmt = db.prepare(`UPDATE seminars
      SET date=?, start_time=?, end_time=?, speaker_name=?, speaker_email=?, speaker_bio=?, topic=?, abstract=?, room=?, seminar_type=?,
          speaker_photo = CASE WHEN ? != '' THEN ? ELSE speaker_photo END
      WHERE id=?`);
    stmt.run([s.date, s.start_time, s.end_time, s.speaker_name, s.speaker_email, s.speaker_bio || '', s.topic, s.abstract || '', s.room, s.seminar_type || 'Others', photoPath, photoPath, id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete seminar
app.delete('/seminars/:id', (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM seminars WHERE id = ?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  })
});

// Send invitations
app.post('/seminars/:id/invite', (req, res) => {
  const id = Number(req.params.id);
  const { recipients } = req.body;
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'recipients required' });
  db.get(`SELECT * FROM seminars WHERE id = ?`, [id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    try {
      await sendSeminarInvitation({ recipients, seminar: row });
      res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// List requests
app.get('/requests', (req, res) => {
  const { status } = req.query || {};
  let query = 'SELECT * FROM seminar_requests';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create request
app.post('/requests', upload.single('speaker_photo'), (req, res) => {
  const r = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : '';
  db.get(`SELECT COUNT(*) as cnt FROM seminar_requests WHERE date=? AND start_time=? AND end_time=? AND speaker_name=? AND topic=? AND room=?`, [r.date, r.start_time, r.end_time, r.speaker_name, r.topic, r.room], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row.cnt > 0) return res.status(409).json({ error: 'Similar request exists' });
    const stmt = db.prepare(`INSERT INTO seminar_requests(date, start_time, end_time, speaker_name, speaker_email, speaker_photo, speaker_bio, topic, abstract, room, submitter_name, submitter_email, status, seminar_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run([r.date, r.start_time, r.end_time, r.speaker_name || '', r.speaker_email || '', photoPath || '', r.speaker_bio || '', r.topic, r.abstract || '', r.room, r.submitter_name, r.submitter_email, 'pending', r.seminar_type || 'Others'], async function(err){
      if (err) return res.status(500).json({ error: err.message });
      // notify coordinator
      try { await notifyRequestCoordinator({ speaker_name: r.speaker_name||'', speaker_email: r.speaker_email||'', topic: r.topic, date: r.date, start_time: r.start_time, end_time: r.end_time, room: r.room }); } catch {}
      // notify all admins (using admin_accounts.email)
      db.all(`SELECT email FROM admin_accounts WHERE email IS NOT NULL AND TRIM(email) != ''`, async (e2, rows) => {
        if (!e2 && Array.isArray(rows) && rows.length) {
          const recipients = rows.map(x => x.email).filter(Boolean);
          try {
            const res2 = await notifyAdmins(recipients, { speaker_name: r.speaker_name||'', speaker_email: r.speaker_email||'', topic: r.topic, date: r.date, start_time: r.start_time, end_time: r.end_time, room: r.room });
            if (!res2?.ok) console.error('notifyAdmins failed:', res2?.error);
          } catch (e3) {
            console.error('notifyAdmins exception:', e3?.message || e3);
          }
        }
      });
      res.status(201).json({ id: this.lastID });
    });
  });
});

// Update request (and optionally reject)
app.put('/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = req.body;
  const stmt = db.prepare(`UPDATE seminar_requests SET date=?, start_time=?, end_time=?, speaker_name=?, speaker_email=?, speaker_bio=?, topic=?, abstract=?, room=?, status=?, seminar_type=? WHERE id=?`);
  stmt.run([r.date, r.start_time, r.end_time, r.speaker_name||'', r.speaker_email||'', r.speaker_bio||'', r.topic, r.abstract||'', r.room, r.status||'pending', r.seminar_type || 'Others', id], async function(err){
    if (err) return res.status(500).json({ error: err.message });
    // Do not notify submitter here to avoid spamming during revisions.
    // Notifications are sent explicitly on approve/reject endpoints.
    res.json({ updated: this.changes });
  });
});

// Approve => create seminar then delete request and notify
app.post('/requests/:id/approve', (req, res) => {
  const id = Number(req.params.id);
  db.get(`SELECT * FROM seminar_requests WHERE id=?`, [id], async (err, reqRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!reqRow) return res.status(404).json({ error: 'Not found' });
    try {
      const conflict = await checkTimeConflict(db, { date: reqRow.date, start_time: reqRow.start_time, end_time: reqRow.end_time, room: reqRow.room });
      if (conflict) return res.status(409).json({ error: 'Time conflict in room' });
      const stmt = db.prepare(`INSERT INTO seminars (date, start_time, end_time, speaker_name, speaker_email, speaker_photo, speaker_bio, topic, abstract, room, seminar_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      stmt.run([reqRow.date, reqRow.start_time, reqRow.end_time, reqRow.speaker_name, reqRow.speaker_email, reqRow.speaker_photo || '', reqRow.speaker_bio, reqRow.topic, reqRow.abstract, reqRow.room, reqRow.seminar_type || 'Others'], function(err){
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM seminar_requests WHERE id=?`, [id], async function(err2){
          if (err2) return res.status(500).json({ error: err2.message });
          try { await notifySubmitter({ submitter_name: reqRow.submitter_name, submitter_email: reqRow.submitter_email, topic: reqRow.topic, status: 'approved' }); } catch {}
          res.json({ approved: true, seminar_id: stmt.lastID });
        });
      });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// Reject => delete request and notify
app.post('/requests/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  db.get(`SELECT submitter_name, submitter_email, topic FROM seminar_requests WHERE id=?`, [id], (err, info) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM seminar_requests WHERE id=?`, [id], async function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      try { await notifySubmitter({ submitter_name: info?.submitter_name || 'Submitter', submitter_email: info?.submitter_email, topic: info?.topic || '', status: 'rejected' }); } catch {}
      res.json({ rejected: true });
    });
  });
});

// Serve the exported web app if present
try {
  const clientDir = path.resolve(__dirname, '..', '..', 'mobile_app', 'dist');
  if (fs.existsSync(clientDir)) {
    // Static assets
    app.use(express.static(clientDir, { index: 'index.html' }));
    // SPA fallback for client-side routes (avoid intercepting uploads)
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path && req.path.startsWith('/uploads')) return next();
      return res.sendFile(path.join(clientDir, 'index.html'));
    });
  }
} catch {}

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
  console.log(`Using SQLite DB at: ${DB_PATH}`);
});
