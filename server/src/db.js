import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

sqlite3.verbose();

export function openDb(dbPath) {
  const db = new sqlite3.Database(dbPath);
  return db;
}

export function initialize(db) {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS seminars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      speaker_name TEXT NOT NULL,
      speaker_email TEXT NOT NULL,
      speaker_photo TEXT,
      speaker_bio TEXT,
      topic TEXT NOT NULL,
      abstract TEXT,
      room TEXT NOT NULL,
      seminar_type TEXT NOT NULL DEFAULT 'Others'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS seminar_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      speaker_name TEXT NOT NULL,
      speaker_email TEXT NOT NULL,
      speaker_photo TEXT,
      speaker_bio TEXT,
      topic TEXT NOT NULL,
      abstract TEXT,
      room TEXT NOT NULL,
      submitter_name TEXT NOT NULL,
      submitter_email TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      seminar_type TEXT NOT NULL DEFAULT 'Others'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS admin_accounts (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS emf_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL DEFAULT '13:00',
      end_time TEXT NOT NULL DEFAULT '14:30',
      room TEXT NOT NULL DEFAULT 'TBD',
      capacity INTEGER NOT NULL DEFAULT 3,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS emf_presentations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      presenter_name TEXT NOT NULL,
      presenter_email TEXT NOT NULL,
      affiliation TEXT,
      title TEXT NOT NULL,
      abstract TEXT,
      preferred_slot TEXT,
      status TEXT DEFAULT 'submitted',
      manage_token TEXT,
      reminder_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES emf_sessions(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_emf_sessions_date ON emf_sessions(session_date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_emf_presentations_session ON emf_presentations(session_id)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_emf_presentations_token ON emf_presentations(manage_token)`);

    // Seed default admin if table empty
    db.get(`SELECT COUNT(*) as cnt FROM admin_accounts`, (err, row) => {
      if (err) return;
      if (row && row.cnt === 0) {
        const hashed = bcrypt.hashSync('nimda1234', 10);
        db.run(`INSERT INTO admin_accounts(username, password) VALUES(?, ?)`, ['admin', hashed]);
      }
    });

    // Migration: add email column to admin_accounts if missing
    db.all(`PRAGMA table_info(admin_accounts)`, (err, cols) => {
      if (err) return;
      const hasEmail = Array.isArray(cols) && cols.some(c => c.name === 'email');
      const ensureEmail = () => {
        // Set default email for seeded admin
        db.run(`UPDATE admin_accounts SET email = ? WHERE username = 'admin'`, ['xiufeng@ieee.org']);
      };
      if (!hasEmail) {
        db.run(`ALTER TABLE admin_accounts ADD COLUMN email TEXT`, [], (e2) => {
          if (!e2) ensureEmail();
        });
      } else {
        ensureEmail();
      }
    });

    // Migration: add speaker_photo columns if missing
    db.all(`PRAGMA table_info(seminars)`, (err, cols) => {
      if (!err && Array.isArray(cols) && !cols.some(c => c.name === 'speaker_photo')) {
        db.run(`ALTER TABLE seminars ADD COLUMN speaker_photo TEXT`);
      }
    });
    db.all(`PRAGMA table_info(seminar_requests)`, (err, cols) => {
      if (!err && Array.isArray(cols) && !cols.some(c => c.name === 'speaker_photo')) {
        db.run(`ALTER TABLE seminar_requests ADD COLUMN speaker_photo TEXT`);
      }
    });
  });
}

export function checkTimeConflict(db, { date, start_time, end_time, room, exclude_id }) {
  return new Promise((resolve, reject) => {
    let query = `SELECT COUNT(*) as cnt FROM seminars WHERE date = ? AND room = ? AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?) OR (start_time >= ? AND end_time <= ?))`;
    const params = [date, room, end_time, start_time, start_time, start_time, start_time, end_time];
    if (exclude_id) {
      query += ' AND id != ?';
      params.push(exclude_id);
    }
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row.cnt > 0);
    });
  });
}
