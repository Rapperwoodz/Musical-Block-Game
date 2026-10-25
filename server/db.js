/*
  db.js — SQLite database layer.
  Tables: users (accounts + saved avatar), sessions, reports, reset_tokens.
  Passwords are never stored in plaintext (see auth.js).
*/
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data.db';
const dbDir = path.dirname(path.isAbsolute(DB_PATH) ? DB_PATH : path.join(process.cwd(), DB_PATH));
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.isAbsolute(DB_PATH) ? DB_PATH : path.join(process.cwd(), DB_PATH));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email         TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  avatar        TEXT,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter  TEXT NOT NULL,
  target    TEXT NOT NULL,
  reason    TEXT,
  at        INTEGER NOT NULL
);
`);

/* v2: email is now optional — migrate older databases that required it */
try {
  const cols = db.pragma('table_info(users)');
  const emailCol = Array.isArray(cols) && cols.find((c) => c.name === 'email');
  if (emailCol && emailCol.notnull) {
    db.exec(`
      BEGIN;
      CREATE TABLE users_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email         TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        avatar        TEXT,
        created_at    INTEGER NOT NULL
      );
      INSERT INTO users_new (id, username, email, password_hash, avatar, created_at)
        SELECT id, username, email, password_hash, avatar, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;
    `);
    console.log('[db] migrated users table: email is now optional');
  }
} catch (e) {
  console.error('[db] migration failed:', e.message);
}

const stmts = {
  userByName:  db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
  userById:    db.prepare('SELECT * FROM users WHERE id = ?'),
  userAny:     db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE'),
  insertUser:  db.prepare('INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)'),
  saveAvatar:  db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  session:       db.prepare('SELECT * FROM sessions WHERE token = ?'),
  delSession:    db.prepare('DELETE FROM sessions WHERE token = ?'),
  delSessionsOf: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  insertReset:   db.prepare('INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'),
  reset:         db.prepare('SELECT * FROM reset_tokens WHERE token = ?'),
  useReset:      db.prepare('UPDATE reset_tokens SET used = 1 WHERE token = ?'),
  insertReport:  db.prepare('INSERT INTO reports (reporter, target, reason, at) VALUES (?, ?, ?, ?)'),
};

module.exports = { db, stmts };
