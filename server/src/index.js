import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import cron from 'node-cron';
import crypto from 'crypto';
import { openDb, initialize, checkTimeConflict } from './db.js';
import { notifyRequestCoordinator, notifySubmitter, sendSeminarInvitation, verifySmtp, notifyAdmins, sendEmfReminder, sendEmfConfirmation } from './email.js';
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
const EMF_DEFAULT_ROOM = process.env.EMF_DEFAULT_ROOM || 'R025, B424';
const EMF_MAX_PRESENTERS = Number(process.env.EMF_MAX_PRESENTERS || 3);
const EMF_START_TIME = process.env.EMF_START_TIME || '13:00';
const EMF_END_TIME = process.env.EMF_END_TIME || '14:30';
const EMF_REMINDER_CRON = process.env.EMF_REMINDER_CRON || '0 10 * * *';
const EMF_REMINDER_TZ = process.env.EMF_REMINDER_TZ || undefined;
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

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve(this);
  });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const EMF_SLOT_LABELS = {
  slot1: '1:00 – 1:10 PM',
  slot2: '1:10 – 1:20 PM',
  slot3: '1:20 – 1:30 PM',
};
const EMF_SLOT_KEYS = Object.keys(EMF_SLOT_LABELS);

const normalizeSlot = (slot) => (slot && EMF_SLOT_KEYS.includes(slot)) ? slot : null;
const slotLabel = (slot) => (slot && EMF_SLOT_LABELS[slot]) || '';
const normalizeEmail = (value) => (value || '').trim().toLowerCase();
const EMF_SUPER_EMAIL = normalizeEmail(process.env.EMF_SUPER_EMAIL || '');
const isSuperEmail = (email) => !!email && normalizeEmail(email) === EMF_SUPER_EMAIL;

const firstTuesdayOfMonth = (dayjsInstance) => {
  let cursor = dayjsInstance.startOf('month');
  const guard = cursor.add(10, 'day');
  while (cursor.day() !== 2 && cursor.isBefore(guard, 'day')) {
    cursor = cursor.add(1, 'day');
  }
  return cursor;
};

async function ensureSessionForDate(dateStr) {
  const existing = await dbGet(`SELECT * FROM emf_sessions WHERE session_date = ?`, [dateStr]);
  if (existing) {
    const needsUpdate = existing.start_time !== EMF_START_TIME
      || existing.end_time !== EMF_END_TIME
      || existing.room !== EMF_DEFAULT_ROOM
      || (existing.capacity || 0) !== EMF_MAX_PRESENTERS;
    if (needsUpdate) {
      await dbRun(`UPDATE emf_sessions SET start_time=?, end_time=?, room=?, capacity=? WHERE id=?`,
        [EMF_START_TIME, EMF_END_TIME, EMF_DEFAULT_ROOM, EMF_MAX_PRESENTERS, existing.id]);
      return dbGet(`SELECT * FROM emf_sessions WHERE id = ?`, [existing.id]);
    }
    return existing;
  }
  const insert = await dbRun(`INSERT INTO emf_sessions (session_date, start_time, end_time, room, capacity)
    VALUES (?, ?, ?, ?, ?)` , [dateStr, EMF_START_TIME, EMF_END_TIME, EMF_DEFAULT_ROOM, EMF_MAX_PRESENTERS]);
  return dbGet(`SELECT * FROM emf_sessions WHERE id = ?`, [insert.lastID]);
}

async function ensureUpcomingSessions(count = 3) {
  const today = dayjs().startOf('day');
  const upcoming = [];
  let cursor = today.startOf('month');
  let attempts = 0;
  while (upcoming.length < count && attempts < 12) {
    const firstTuesday = firstTuesdayOfMonth(cursor);
    if (firstTuesday.isAfter(today) || firstTuesday.isSame(today, 'day')) {
      // create session
      const session = await ensureSessionForDate(firstTuesday.format('YYYY-MM-DD'));
      upcoming.push(session);
    }
    cursor = cursor.add(1, 'month');
    attempts += 1;
  }
  if (upcoming.length === 0) {
    const fallbackDate = firstTuesdayOfMonth(today.add(1, 'month')).format('YYYY-MM-DD');
    const session = await ensureSessionForDate(fallbackDate);
    upcoming.push(session);
  }
  return upcoming;
}

async function loadSession(sessionId) {
  const session = await dbGet(`SELECT * FROM emf_sessions WHERE id = ?`, [sessionId]);
  if (!session) {
    const err = new Error('Session not found');
    err.statusCode = 404;
    throw err;
  }
  return session;
}

async function assertSessionCapacity(sessionId, slotKey, excludePresentationId) {
  const session = await loadSession(sessionId);
  const capacity = session.capacity || EMF_MAX_PRESENTERS;
  const params = [sessionId];
  let countQuery = `SELECT COUNT(*) as cnt FROM emf_presentations WHERE session_id = ?`;
  if (excludePresentationId) {
    countQuery += ' AND id != ?';
    params.push(excludePresentationId);
  }
  const countRow = await dbGet(countQuery, params);
  if ((countRow?.cnt || 0) >= capacity) {
    const err = new Error('Session is full');
    err.statusCode = 409;
    throw err;
  }
  if (slotKey) {
    const slotParams = excludePresentationId ? [sessionId, slotKey, excludePresentationId] : [sessionId, slotKey];
    let slotQuery = `SELECT id FROM emf_presentations WHERE session_id = ? AND preferred_slot = ?`;
    if (excludePresentationId) slotQuery += ' AND id != ?';
    const slotRow = await dbGet(slotQuery, slotParams);
    if (slotRow) {
      const err = new Error('Preferred slot already taken');
      err.statusCode = 409;
      throw err;
    }
  }
  return session;
}

async function loadSessionsWithPresentations(query, params) {
  const sessions = await dbAll(query, params);
  if (!sessions.length) return [];
  const ids = sessions.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  const presentations = await dbAll(`SELECT * FROM emf_presentations WHERE session_id IN (${placeholders}) ORDER BY CASE preferred_slot
    WHEN 'slot1' THEN 1 WHEN 'slot2' THEN 2 WHEN 'slot3' THEN 3 ELSE 4 END, created_at`, ids);
  const grouped = presentations.reduce((acc, p) => {
    acc[p.session_id] = acc[p.session_id] || [];
    acc[p.session_id].push({ ...p, slot_label: slotLabel(p.preferred_slot) });
    return acc;
  }, {});
  return sessions.map(s => ({ ...s, presentations: grouped[s.id] || [] }));
}

async function sendEmfReminders() {
  const targetDate = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const rows = await dbAll(`SELECT p.*, s.session_date, s.start_time, s.end_time FROM emf_presentations p
    JOIN emf_sessions s ON s.id = p.session_id
    WHERE s.session_date = ? AND p.reminder_sent = 0`, [targetDate]);
  let sent = 0;
  for (const row of rows) {
    try {
      await sendEmfReminder({
        to: row.presenter_email,
        presenter_name: row.presenter_name,
        title: row.title,
        session_date: row.session_date,
        start_time: row.start_time,
        end_time: row.end_time,
        slot_label: slotLabel(row.preferred_slot),
      });
      await dbRun(`UPDATE emf_presentations SET reminder_sent = 1 WHERE id = ?`, [row.id]);
      sent += 1;
    } catch (err) {
      console.error('Failed to send EMF reminder', row.id, err?.message || err);
    }
  }
  return sent;
}

const getPresentationWithSession = async (id, byToken = false) => {
  const where = byToken ? 'p.manage_token = ?' : 'p.id = ?';
  const row = await dbGet(`SELECT p.*, s.session_date, s.start_time, s.end_time, s.room FROM emf_presentations p
    JOIN emf_sessions s ON s.id = p.session_id WHERE ${where}`, [id]);
  if (!row) {
    const err = new Error('Presentation not found');
    err.statusCode = 404;
    throw err;
  }
  return row;
};

const hasPresentationAccess = (req, presentation, requesterEmail) => {
  if (isAdminRequest(req)) return true;
  const normalized = normalizeEmail(requesterEmail);
  if (!normalized) return false;
  if (isSuperEmail(normalized)) return true;
  return normalized === normalizeEmail(presentation.presenter_email);
};

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

function setSessionCookie(res, payload) {
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

function getSession(req) {
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

const isAdminRequest = (req) => {
  const sess = getSession(req);
  return !!(sess && sess.role === 'admin');
};

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
    try { console.log(`[GET /seminars] scope=${scope} rows=${Array.isArray(rows) ? rows.length : 'err'}`); } catch { }
    res.json(rows);
  });
});

app.get('/emf/sessions', async (req, res) => {
  try {
    await ensureUpcomingSessions(3);
    const include = (req.query.include || '').toString();
    const scope = (req.query.scope || 'future').toString();
    const today = dayjs().format('YYYY-MM-DD');
    let query = 'SELECT * FROM emf_sessions';
    let params = [];
    if (scope === 'past') {
      query += ' WHERE session_date < ? ORDER BY session_date DESC';
      params = [today];
    } else if (scope === 'all') {
      query += ' ORDER BY session_date DESC';
    } else {
      query += ' WHERE session_date >= ? ORDER BY session_date ASC';
      params = [today];
    }
    const rows = include.includes('presentations')
      ? await loadSessionsWithPresentations(query, params)
      : await dbAll(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/emf/sessions/ensure-next', async (req, res) => {
  try {
    const [session] = await ensureUpcomingSessions(1);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/emf/presentations', async (req, res) => {
  try {
    const { session_id, presenter_name, presenter_email, affiliation, title, abstract, preferred_slot } = req.body || {};
    if (!presenter_name || !presenter_email || !title) return res.status(400).json({ error: 'Missing presenter name, email or title' });
    let session;
    if (session_id) {
      session = await loadSession(Number(session_id));
    } else {
      const upcoming = await ensureUpcomingSessions(1);
      session = upcoming[0];
    }
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const slotKey = normalizeSlot(preferred_slot);
    await assertSessionCapacity(session.id, slotKey);
    const insert = await dbRun(`INSERT INTO emf_presentations (session_id, presenter_name, presenter_email, affiliation, title, abstract, preferred_slot, manage_token, reminder_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)`, [session.id, presenter_name, presenter_email, affiliation || '', title, abstract || '', slotKey]);
    const presentation = await dbGet(`SELECT * FROM emf_presentations WHERE id = ?`, [insert.lastID]);
    try {
      await sendEmfConfirmation({
        to: presenter_email,
        presenter_name,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        slot_label: slotLabel(slotKey),
      });
    } catch (err) {
      console.error('Failed to send EMF confirmation email:', err?.message || err);
    }
    res.status(201).json({
      presentation: { ...presentation, slot_label: slotLabel(presentation.preferred_slot) },
      session,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/emf/presentations/:id', async (req, res) => {
  try {
    const row = await getPresentationWithSession(Number(req.params.id));
    res.json({ ...row, slot_label: slotLabel(row.preferred_slot) });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/emf/presentations/lookup', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.presenter_email || req.body?.email || '');
    if (!normalizedEmail) return res.status(400).json({ error: 'Email required' });
    const fetchRows = async () => dbAll(`SELECT p.*, s.session_date, s.start_time, s.end_time, s.room FROM emf_presentations p
      JOIN emf_sessions s ON s.id = p.session_id
      ORDER BY s.session_date DESC, p.created_at DESC`);
    if (isSuperEmail(normalizedEmail)) {
      const rows = await fetchRows();
      const mapped = rows.map(r => ({ ...r, slot_label: slotLabel(r.preferred_slot) }));
      return res.json({ presentations: mapped, super: true });
    }
    const rows = await dbAll(`SELECT p.*, s.session_date, s.start_time, s.end_time, s.room FROM emf_presentations p
      JOIN emf_sessions s ON s.id = p.session_id
      WHERE LOWER(p.presenter_email) = ?
      ORDER BY s.session_date DESC, p.created_at DESC`, [normalizedEmail]);
    if (!rows.length) return res.status(404).json({ error: 'No presentations found for that email' });
    const mapped = rows.map(r => ({ ...r, slot_label: slotLabel(r.preferred_slot) }));
    if (mapped.length === 1) return res.json({ presentation: mapped[0] });
    return res.json({ presentations: mapped });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.put('/emf/presentations/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPresentationWithSession(id);
    const requesterEmail = req.body?.manage_email || req.body?.presenter_email;
    if (!hasPresentationAccess(req, existing, requesterEmail)) return res.status(403).json({ error: 'Not authorized' });
    const updates = {
      presenter_name: req.body?.presenter_name ?? existing.presenter_name,
      presenter_email: req.body?.presenter_email ?? existing.presenter_email,
      affiliation: req.body?.affiliation ?? (existing.affiliation || ''),
      title: req.body?.title ?? existing.title,
      abstract: req.body?.abstract ?? (existing.abstract || ''),
      preferred_slot: normalizeSlot(req.body?.preferred_slot) || existing.preferred_slot,
      session_id: req.body?.session_id ? Number(req.body.session_id) : existing.session_id,
    };
    const session = await assertSessionCapacity(updates.session_id, updates.preferred_slot, id);
    await dbRun(`UPDATE emf_presentations SET session_id=?, presenter_name=?, presenter_email=?, affiliation=?, title=?, abstract=?, preferred_slot=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [session.id, updates.presenter_name, updates.presenter_email, updates.affiliation || '', updates.title, updates.abstract || '', updates.preferred_slot, id]);
    const fresh = await getPresentationWithSession(id);
    res.json({ presentation: { ...fresh, slot_label: slotLabel(fresh.preferred_slot) } });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    if (e.statusCode === 409) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/emf/presentations/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPresentationWithSession(id);
    const requesterEmail = req.body?.manage_email || req.query?.email;
    if (!hasPresentationAccess(req, existing, requesterEmail)) return res.status(403).json({ error: 'Not authorized' });
    await dbRun(`DELETE FROM emf_presentations WHERE id = ?`, [id]);
    res.json({ deleted: true });
  } catch (e) {
    if (e.statusCode === 404) return res.status(404).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/emf/reminders/run', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Admin session required' });
  try {
    const sent = await sendEmfReminders();
    res.json({ ok: true, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    stmt.run([s.date, s.start_time, s.end_time, s.speaker_name, s.speaker_email, s.speaker_bio || '', s.topic, s.abstract || '', s.room, s.seminar_type || 'Others'], function (err) {
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
    stmt.run([s.date, s.start_time, s.end_time, s.speaker_name, s.speaker_email, s.speaker_bio || '', s.topic, s.abstract || '', s.room, s.seminar_type || 'Others', photoPath, photoPath, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete seminar
app.delete('/seminars/:id', (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM seminars WHERE id = ?`, [id], function (err) {
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
    } catch (e) { res.status(500).json({ error: e.message }); }
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
    stmt.run([r.date, r.start_time, r.end_time, r.speaker_name || '', r.speaker_email || '', photoPath || '', r.speaker_bio || '', r.topic, r.abstract || '', r.room, r.submitter_name, r.submitter_email, 'pending', r.seminar_type || 'Others'], async function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // notify coordinator
      try { await notifyRequestCoordinator({ speaker_name: r.speaker_name || '', speaker_email: r.speaker_email || '', topic: r.topic, date: r.date, start_time: r.start_time, end_time: r.end_time, room: r.room }); } catch { }
      // notify all admins (using admin_accounts.email)
      db.all(`SELECT email FROM admin_accounts WHERE email IS NOT NULL AND TRIM(email) != ''`, async (e2, rows) => {
        if (!e2 && Array.isArray(rows) && rows.length) {
          const recipients = rows.map(x => x.email).filter(Boolean);
          try {
            const res2 = await notifyAdmins(recipients, { speaker_name: r.speaker_name || '', speaker_email: r.speaker_email || '', topic: r.topic, date: r.date, start_time: r.start_time, end_time: r.end_time, room: r.room });
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
  stmt.run([r.date, r.start_time, r.end_time, r.speaker_name || '', r.speaker_email || '', r.speaker_bio || '', r.topic, r.abstract || '', r.room, r.status || 'pending', r.seminar_type || 'Others', id], async function (err) {
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
      stmt.run([reqRow.date, reqRow.start_time, reqRow.end_time, reqRow.speaker_name, reqRow.speaker_email, reqRow.speaker_photo || '', reqRow.speaker_bio, reqRow.topic, reqRow.abstract, reqRow.room, reqRow.seminar_type || 'Others'], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM seminar_requests WHERE id=?`, [id], async function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          try { await notifySubmitter({ submitter_name: reqRow.submitter_name, submitter_email: reqRow.submitter_email, topic: reqRow.topic, status: 'approved' }); } catch { }
          res.json({ approved: true, seminar_id: stmt.lastID });
        });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// Reject => delete request and notify
app.post('/requests/:id/reject', (req, res) => {
  const id = Number(req.params.id);
  db.get(`SELECT submitter_name, submitter_email, topic FROM seminar_requests WHERE id=?`, [id], (err, info) => {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM seminar_requests WHERE id=?`, [id], async function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      try { await notifySubmitter({ submitter_name: info?.submitter_name || 'Submitter', submitter_email: info?.submitter_email, topic: info?.topic || '', status: 'rejected' }); } catch { }
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
} catch { }

try {
  cron.schedule(EMF_REMINDER_CRON, () => {
    sendEmfReminders().then((count) => {
      if (count) console.log(`[EMF reminders] sent ${count} reminder(s)`);
    }).catch((err) => console.error('EMF reminder job failed', err?.message || err));
  }, EMF_REMINDER_TZ ? { timezone: EMF_REMINDER_TZ } : undefined);
} catch (err) {
  console.error('Failed to schedule EMF reminder cron job:', err?.message || err);
}

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
  console.log(`Using SQLite DB at: ${DB_PATH}`);
});
