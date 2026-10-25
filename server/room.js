/*
  room.js — the one shared movie-theater room.
  Players, seat occupancy, chat (rate-limited, muteable), emotes, snacks,
  host role, and the server-controlled movie playback timeline.
*/
const fs = require('fs');
const path = require('path');

/* Seat layout — must mirror the client (js/theater.js). 5 rows x 8 seats. */
const SEAT_ROWS = 5;
const SEATS_PER_ROW = 8;
const SEAT_XS = [7, 8, 9, 10, 12, 13, 14, 15]; // aisle between 10 and 12
function seatList() {
  const seats = [];
  for (let r = 0; r < SEAT_ROWS; r++) {
    for (let c = 0; c < SEAT_XS.length; c++) {
      seats.push({ id: `s${r}-${c}`, x: SEAT_XS[c], y: 5 + r * 2 });
    }
  }
  return seats;
}
const SEATS = seatList();

function loadMovies() {
  try {
    const file = path.join(__dirname, 'config', 'movies.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('[room] movies.json unreadable:', e.message);
    return [];
  }
}

class Room {
  constructor() {
    this.players = new Map();   // playerId -> player
    this.sockets = new Map();   // playerId -> ws
    this.seatOf = new Map();    // seatId -> playerId
    this.chatTimes = new Map(); // playerId -> [timestamps]
    this.muted = new Set();     // userIds muted by the host
    this.reports = [];
    this.movies = loadMovies();
    this.playback = { movieId: null, playing: false, position: 0, at: Date.now(), announce: null };
    this.hostId = null;
    this.nextId = 1;
  }

  isHost(player) { return player && player.id === this.hostId; }
  byUserId(userId) { for (const p of this.players.values()) if (p.userId === userId) return p; return null; }

  add(ws, user) {
    const player = {
      id: this.nextId++,
      userId: user.id,
      name: user.username,
      avatar: user.avatar ? JSON.parse(user.avatar) : null,
      x: 12.5, y: 17.5, facing: 1, seat: null, prop: null,
    };
    this.players.set(player.id, player);
    this.sockets.set(player.id, ws);

    // Seat occupancy snapshot (userId of each occupied seat)
    const seats = {};
    for (const [seatId, pid] of this.seatOf) {
      const p = this.players.get(pid);
      if (p) seats[seatId] = { userId: p.userId, name: p.name };
    }
    this.send(ws, 'init', {
      you: player.id,
      host: this.hostId,
      players: [...this.players.values()].map(this.publicPlayer),
      seats,
      playback: this.playbackState(),
      movies: this.movies,
    });
    this.broadcast('playerJoin', { player: this.publicPlayer(player) }, player.id);
    this.systemChat(`${player.name} entered the theater.`);
    if (!this.hostId) this.setHost(player.id);
    return player;
  }

  remove(ws) {
    const player = this.findPlayer(ws);
    if (!player) return;
    if (player.seat) { this.seatOf.delete(player.seat); player.seat = null; }
    this.broadcast('playerLeave', { id: player.id });
    this.systemChat(`${player.name} left the theater.`);
    this.players.delete(player.id);
    this.sockets.delete(player.id);
    if (this.hostId === player.id) {
      const next = this.players.values().next().value;
      this.setHost(next ? next.id : null);
    }
  }

  findPlayer(ws) {
    for (const [id, s] of this.sockets) if (s === ws) return this.players.get(id);
    return null;
  }

  setHost(id) {
    this.hostId = id;
    if (id != null) this.broadcast('hostChanged', { host: id });
  }

  publicPlayer(p) {
    return { id: p.id, userId: p.userId, name: p.name, avatar: p.avatar, x: p.x, y: p.y, facing: p.facing, seat: p.seat, prop: p.prop };
  }

  playbackState() {
    return { ...this.playback };
  }

  send(ws, type, data) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...data }));
  }

  broadcast(type, data, exceptId) {
    const msg = JSON.stringify({ type, ...data });
    for (const [id, ws] of this.sockets) {
      if (id === exceptId) continue;
      if (ws.readyState === 1) ws.send(msg);
    }
  }

  systemChat(text) {
    this.broadcast('chat', { system: true, text, at: Date.now() });
  }

  handle(ws, msg) {
    const player = this.findPlayer(ws);
    if (!player || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'move': {
        // Trust but bound: max ~0.4 tiles per message (client sends at ~10 Hz)
        const dx = Number(msg.x) - player.x, dy = Number(msg.y) - player.y;
        const d = Math.hypot(dx, dy);
        if (Number.isFinite(dx) && Number.isFinite(dy) && d < 0.5) {
          if (player.seat) return; // sitting players don't move
          player.x = Math.max(0, Math.min(25, msg.x));
          player.y = Math.max(0, Math.min(19, msg.y));
          if (msg.facing === 1 || msg.facing === -1) player.facing = msg.facing;
          this.broadcast('playerMove', {
            id: player.id, x: player.x, y: player.y, facing: player.facing,
          }, player.id);
        }
        break;
      }
      case 'sit': {
        const seat = SEATS.find((s) => s.id === msg.seatId);
        if (!seat || this.seatOf.has(seat.id)) {
          this.send(ws, 'error', { code: 'seat', message: 'Seat taken.' });
          return;
        }
        if (Math.hypot(player.x - seat.x, player.y - seat.y) > 2.6) {
          this.send(ws, 'error', { code: 'far', message: 'Walk closer to the seat first.' });
          return;
        }
        if (player.seat) this.seatOf.delete(player.seat);
        player.seat = seat.id;
        player.x = seat.x; player.y = seat.y;
        this.seatOf.set(seat.id, player.id);
        this.broadcast('playerSit', { id: player.id, seatId: seat.id, x: seat.x, y: seat.y });
        break;
      }
      case 'stand': {
        if (!player.seat) return;
        const seat = SEATS.find((s) => s.id === player.seat);
        const freed = player.seat;
        this.seatOf.delete(freed);
        player.seat = null;
        if (seat) { player.x = seat.x; player.y = seat.y + 1; }
        this.broadcast('playerStand', { id: player.id, seatId: freed, x: player.x, y: player.y });
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 200).trim();
        if (!text) return;
        if (this.muted.has(player.userId)) {
          this.send(ws, 'error', { code: 'muted', message: 'You are muted by the host.' });
          return;
        }
        if (!this.rateOk(player.id)) {
          this.send(ws, 'error', { code: 'rate', message: 'Slow down — too many messages.' });
          return;
        }
        this.broadcast('chat', { id: player.id, name: player.name, text, at: Date.now() });
        break;
      }
      case 'emote': this.broadcast('emote', { id: player.id, emote: String(msg.emote || '').slice(0, 8) }); break;
      case 'prop': this.broadcast('prop', { id: player.id, prop: msg.prop === 'popcorn' || msg.prop === 'drink' ? msg.prop : null }); break;
      case 'report': {
        this.reports.push({ reporter: player.name, target: String(msg.target || '').slice(0, 40), reason: String(msg.reason || '').slice(0, 300), at: Date.now() });
        const { stmts } = require('./db');
        stmts.insertReport.run(player.name, String(msg.target || ''), String(msg.reason || ''), Date.now());
        this.send(ws, 'notice', { message: 'Report sent to the moderators. Thank you.' });
        break;
      }
      case 'host': if (!this.isHost(player)) { this.send(ws, 'error', { code: 'host', message: 'Only the theater host can do that.' }); return; } this.hostAction(player, msg); break;
      default: break;
    }
  }

  rateOk(id) {
    const now = Date.now();
    const arr = (this.chatTimes.get(id) || []).filter((t) => now - t < 5000);
    if (arr.length >= 5) { this.chatTimes.set(id, arr); return false; }
    arr.push(now);
    this.chatTimes.set(id, arr);
    return true;
  }

  hostAction(player, msg) {
    const movie = this.movies.find((m) => m.id === msg.movieId);
    switch (msg.action) {
      case 'select':
        if (!movie) return;
        this.playback = { movieId: movie.id, playing: false, position: 0, at: Date.now(), announce: null };
        break;
      case 'play':
        if (!movie) return;
        this.playback = { movieId: movie.id, playing: true, position: Number(msg.at) || 0, at: Date.now(), announce: null };
        this.systemChat(`${player.name} started "${movie.title}". Enjoy!`);
        break;
      case 'pause':
        if (this.playback.playing) {
          this.playback.position = this.playback.position + (Date.now() - this.playback.at) / 1000;
          this.playback.playing = false;
          this.playback.at = Date.now();
        }
        break;
      case 'resume':
        if (!this.playback.playing && this.playback.movieId) {
          this.playback.playing = true;
          this.playback.at = Date.now();
        }
        break;
      case 'skip':
        if (movie) {
          this.playback = { movieId: movie.id, playing: false, position: 0, at: Date.now(), announce: null };
        }
        break;
      case 'announce': {
        if (!movie) return;
        const startAt = Date.now() + (Number(msg.inSeconds) || 60) * 1000;
        this.playback.announce = { movieId: movie.id, title: movie.title, startAt, permitted: movie.type === 'file' };
        this.systemChat(`Up next: "${movie.title}" — starts in ${Math.round((Number(msg.inSeconds) || 60))}s.`);
        break;
      }
      case 'mute':   this.muted.add(Number(msg.userId)); this.systemChat(`${player.name} muted a player.`); break;
      case 'unmute': this.muted.delete(Number(msg.userId)); break;
      case 'transfer': {
        const target = this.players.get(Number(msg.userId));
        if (target) { this.setHost(target.id); this.systemChat(`${target.name} is now the theater host.`); }
        return;
      }
      default: return;
    }
    this.broadcast('playback', this.playbackState());
  }
}

module.exports = { Room, SEATS };
