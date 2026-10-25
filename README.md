# Virtual Movie Theater

A social 2D isometric virtual movie theater: create an account, design a
cartoon avatar, join one shared theater with friends, sit together, chat,
and watch movies on the giant screen with server-synchronized playback.

## Stack

- **Client**: HTML/CSS/JS, Canvas 2D isometric renderer (no frameworks).
- **Server**: Node.js + `ws` (WebSockets) + `better-sqlite3` (SQLite).
- **Auth**: server-side scrypt-hashed passwords, opaque session tokens.
- **Media**: HTML5 `<video>` rendered onto the in-game screen, synced by a
  server-controlled playback timeline.

## Project layout

```
index.html, css/, js/     client (served by the server)
server/
  index.js                HTTP + REST API + WebSocket server
  auth.js                 scrypt hashing, sessions, reset tokens
  db.js                   SQLite schema + queries
  room.js                 room state: players, seats, chat, playback, host
  config/movies.json      movie catalog (edit to add titles)
  media/                  drop MP4/WebM files you have rights to stream
```

## Database schema

- `users(id, username UNIQUE, email UNIQUE, password_hash, avatar JSON, created_at)`
- `sessions(token PK, user_id, created_at, expires_at)`
- `reset_tokens(token PK, user_id, expires_at, used)`
- `reports(id, reporter, target, reason, at)`

## Run it (local)

```
cd server
npm install
cp .env.example .env      # RESET_DEV=1 shows recovery codes in the app
npm start
```

Open `http://localhost:8080` on any device on the network. Register → design
your avatar → enter the theater. Controls: tap a floor tile to walk there,
tap a seat to sit; drag to pan the view; pinch (or ➕/➖) to zoom.

## Deploy

- Any Node 18+ host (a $5 VPS is plenty): copy the project, `npm install`,
  set `PORT`/`DB_PATH` in `.env`, run `npm start` behind a process manager
  (`systemd`, `pm2`) or a container. Put HTTPS in front (Caddy/nginx) —
  required for WebSockets from https pages.
- Set `RESET_DEV=0` in production and wire an email provider into
  `auth.js → createResetToken()` before enabling account recovery.
- Add movies you are licensed to screen into `server/media/` and/or edit
  `server/config/movies.json`.

## Testing

1. **Auth**: register with a short password (should fail), valid details
   (should succeed), duplicate username (409), log out, log back in.
2. **Avatar**: change each option, relog — the avatar persists.
3. **Movement/collision**: walk into walls, seats, the counter — you stop.
   Tap a seat from a distance: you walk, then sit.
4. **Multiplayer**: open two browsers/devices, register two accounts, move —
   both clients update within ~100 ms; chat, emotes, snacks sync.
5. **Seats**: sit in the same seat from two clients — the second is refused.
6. **Movie night**: the first player in the room is host; pick a CC-licensed
   film (Big Buck Bunny/Sintel) and press Play — both clients show the same
   frame; pause/resume/skip sync; a mid-movie joiner syncs to the position.
7. **Reconnect**: kill the server, watch the "Reconnecting…" banner, restart
   it — the client rejoins and re-syncs seats and playback.
8. **Spam**: paste 10 messages quickly — the 6th+ are rate-limited.

## Feature status

Works out of the box once the server runs: accounts + sessions (username +
password — **email optional**, only needed if you ever want self-serve
recovery; usernames accept any characters except spaces), avatar creator
(saved per account), tap-to-move with collision and seats, **drag to pan the
view, pinch or the ➕/➖ buttons to zoom** (no joystick), real multiplayer +
chat + emotes + snacks, join/leave notices, host role, rate limits,
reports/mutes (host), blocks (local), movie playback of direct files with
server-timeline sync, announcements, **house lights that dim while a movie
plays**, fullscreen, and a bigger screen.

Needs configuration/attention: email delivery for password recovery
(dev-mode codes work without it), your own licensed media files, and
streaming-service playback — Peacock and similar services authorize **no**
third-party embed API, so they appear as an external "Open Streaming
Service" button (official site in a new tab). Never bypass DRM or region
rules; host only content you have the rights to screen.

## Offline preview

The welcome screen has "Preview the theater (offline)" — renders the full
scene with your local avatar only (no fake players, no simulated chat) and
lets you test the screen locally: the ▶ button at the top right (or the
Movies menu) plays the included CC-licensed demo films with local playback.
Light dimming, the bigger screen, pan/zoom all work here; synced playback
across players needs the server.

## Highrise Metaverse port

`highrise-studio/` contains a Unity/Lua port of the theater for Highrise
Studio (create.highrise.game): movie nights with voting + host commands,
Anchor-based seats, and an optional countdown HUD — published as an official
Highrise world. See `highrise-studio/README.md` for the ~20-minute setup.
(Highrise doesn't allow video streaming in worlds, so real synced films stay
here in the web game.)

`highrise-bot/` contains **MUSICAL BLOCK**, a Highrise game bot (official
Python SDK) for your 20×20 block room: randomized safe/dangerous colored
blocks, position-based block detection, eliminations with spectator
teleports, rounds with difficulty ramp, and winner announcements. See
`highrise-bot/README.md`.
