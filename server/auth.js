/*
  auth.js — password hashing (scrypt), session tokens, account recovery.
  Passwords are salted + hashed with scrypt; plaintext never touches the DB.
  Sessions are opaque random tokens verified server-side.
*/
const crypto = require('crypto');
const { stmts } = require('./db');

const SESSION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RESET_MS = 1000 * 60 * 30;             // 30 minutes

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  stmts.insertSession.run(token, userId, now, now + SESSION_MS);
  return token;
}

function userByToken(token) {
  if (!token || typeof token !== 'string') return null;
  const row = stmts.session.get(token);
  if (!row || row.expires_at < Date.now()) return null;
  return stmts.userById.get(row.user_id) || null;
}

function destroySession(token) {
  stmts.delSession.run(token);
}

function createResetToken(user) {
  // DEV: token returned by the API (see .env RESET_DEV).
  // PRODUCTION: replace with an email delivery (SMTP/SES/Postmark...) and
  // only ever send the token by email — never return it over the API.
  const token = crypto.randomBytes(24).toString('hex');
  stmts.insertReset.run(token, user.id, Date.now() + RESET_MS);
  return token;
}

function consumeResetToken(token) {
  const row = stmts.reset.get(String(token || ''));
  if (!row || row.used || row.expires_at < Date.now()) return null;
  stmts.useReset.run(row.token);
  return stmts.userById.get(row.user_id);
}

module.exports = {
  hashPassword, verifyPassword,
  createSession, userByToken, destroySession,
  createResetToken, consumeResetToken,
};
