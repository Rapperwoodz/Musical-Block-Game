/*
  index.js — HTTP + WebSocket server.
  Serves the static client (project root), a REST auth API, media files,
  and the WebSocket endpoint used for the shared theater room.

  Run:  cd server && npm install && npm start
*/
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { db, stmts } = require('./db');
const auth = require('./auth');
const { Room } = require('./room');

/* tiny .env loader (no dependency) */
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const PORT = Number(process.env.PORT) || 8080;
const RESET_DEV = process.env.RESET_DEV === '1';
const ROOT = path.join(__dirname, '..');
const MEDIA_DIR = path.join(__dirname, 'media');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

const room = new Room();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function tokenFrom(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, avatar: u.avatar ? JSON.parse(u.avatar) : null };
}

const USERNAME_RE = /^\S{3,20}$/u;   // any non-space characters, 3-20 long
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const route = parts.slice(1).join('/');

  try {
    if (route === 'register' && req.method === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim();
      const emailRaw = String(b.email || '').trim();
      const email = emailRaw ? emailRaw.toLowerCase() : null;
      const password = String(b.password || '');
      if (!USERNAME_RE.test(username)) return json(res, 400, { error: 'Username must be 3-20 characters (no spaces).' });
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'That email address looks invalid.' });
      if (password.length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      if (stmts.userByName.get(username)) return json(res, 409, { error: 'That username is taken.' });
      if (email && stmts.userByEmail.get(email)) return json(res, 409, { error: 'That email is already registered.' });
      const info = stmts.insertUser.run(username, email, auth.hashPassword(password), Date.now());
      const token = auth.createSession(info.lastInsertRowid);
      return json(res, 201, { token, user: publicUser(stmts.userById.get(info.lastInsertRowid)) });
    }

    if (route === 'login' && req.method === 'POST') {
      const b = await readBody(req);
      const idf = String(b.identifier || '').trim();
      const user = stmts.userAny.get(idf, idf);
      if (!user || !auth.verifyPassword(String(b.password || ''), user.password_hash)) {
        return json(res, 401, { error: 'Wrong username or password.' });
      }
      const token = auth.createSession(user.id);
      return json(res, 200, { token, user: publicUser(user) });
    }

    if (route === 'logout' && req.method === 'POST') {
      const t = tokenFrom(req);
      if (t) auth.destroySession(t);
      return json(res, 200, { ok: true });
    }

    if (route === 'me' && req.method === 'GET') {
      const user = auth.userByToken(tokenFrom(req));
      if (!user) return json(res, 401, { error: 'Not signed in.' });
      return json(res, 200, { user: publicUser(user) });
    }

    if (route === 'avatar' && req.method === 'PUT') {
      const user = auth.userByToken(tokenFrom(req));
      if (!user) return json(res, 401, { error: 'Not signed in.' });
      const b = await readBody(req);
      const a = b.avatar;
      const ok = a && Number.isInteger(a.skin) && Number.isInteger(a.hair) && Number.isInteger(a.hairColor)
        && Number.isInteger(a.top) && Number.isInteger(a.topColor) && Number.isInteger(a.pantsColor)
        && Number.isInteger(a.shoesColor) && Number.isInteger(a.face);
      if (!ok) return json(res, 400, { error: 'Invalid avatar.' });
      stmts.saveAvatar.run(JSON.stringify(a), user.id);
      return json(res, 200, { ok: true });
    }

    if (route === 'recover' && req.method === 'POST') {
      const b = await readBody(req);
      const user = stmts.userByEmail.get(String(b.email || '').trim().toLowerCase());
      // Always answer the same way so accounts can not be probed.
      if (!user) return json(res, 200, { ok: true });
      const token = auth.createResetToken(user);
      if (RESET_DEV) return json(res, 200, { ok: true, devToken: token });
      return json(res, 200, { ok: true });
    }

    if (route === 'reset' && req.method === 'POST') {
      const b = await readBody(req);
      const user = auth.consumeResetToken(String(b.token || ''));
      if (!user) return json(res, 400, { error: 'Invalid or expired reset link.' });
      if (String(b.password || '').length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
      stmts.delSessionsOf.run(user.id); // sign out everywhere
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(String(b.password)), user.id);
      return json(res, 200, { ok: true });
    }

    if (route === 'movies' && req.method === 'GET') {
      return json(res, 200, { movies: room.movies });
    }

    return json(res, 404, { error: 'Not found.' });
  } catch (e) {
    console.error('[api]', e.message);
    return json(res, 500, { error: 'Server error.' });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let file = decodeURIComponent(url.pathname);
  if (file === '/') file = '/index.html';
  let full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  // media folder lives inside server/, not the client root
  if (file.startsWith('/media/')) {
    full = path.normalize(path.join(MEDIA_DIR, file.slice(7)));
    if (!full.startsWith(MEDIA_DIR)) { res.writeHead(403); return res.end(); }
  }
  const ext = path.extname(full).toLowerCase();
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.mp4' || ext === '.m4v' || ext === '.webm') {
      // range support so video seeking works
      const range = req.headers.range;
      if (range) {
        const m = range.match(/bytes=(\d*)-(\d*)/);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        headers['Accept-Ranges'] = 'bytes';
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        return fs.createReadStream(full, { start, end }).pipe(res);
      }
      headers['Accept-Ranges'] = 'bytes';
    }
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    res.writeHead(200, headers);
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return void api(req, res);
  return serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://x').searchParams;
  const user = auth.userByToken(params.get('token'));
  if (!user) { ws.close(4001, 'auth'); return; }
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    try { room.handle(ws, JSON.parse(String(data))); } catch (e) { /* ignore bad frames */ }
  });
  ws.on('close', () => room.remove(ws));
  room.add(ws, user);
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Virtual Movie Theater running on http://localhost:${PORT}`);
  console.log(`Password recovery dev tokens: ${RESET_DEV ? 'ON (set RESET_DEV=0 for production)' : 'off'}`);
});
