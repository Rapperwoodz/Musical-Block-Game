/* main.js — boot, auth flow, movement + collision, network wiring, video sync */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const theater = new window.THEATER.Theater(canvas);
  const video = $('movie-video');
  let net = null;
  let user = null;
  let offline = false;
  let target = null;      // tap-to-move target {x,y}
  let pendingSeat = null; // walk here, then sit
  let lastSent = 0;
  let lastDriftCheck = 0;
  let announceTimer = null;
  const keys = { left: false, right: false, up: false, down: false };

  /* ---------------- helpers ---------------- */
  function blockedAt(x, y) {
    return !window.THEATER.walkable(x, y);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }
  window.addEventListener('resize', resize);

  function myPlayer() { return theater.me(); }
  function isHost() { return theater.state.meId != null && theater.state.hostId === theater.state.meId; }

  function currentMovie() {
    const pb = theater.state.playback;
    if (!pb || !pb.movieId) return null;
    return theater.state.movies.find((m) => m.id === pb.movieId) || null;
  }

  /* ---------------- video / playback sync ---------------- */
  function syncPlayback(pb) {
    theater.state.playback = pb;
    const movie = currentMovie();
    const announce = pb && pb.announce;
    if (announce) {
      const mins = Math.round((announce.startAt - Date.now()) / 6000) / 10;
      UI.announce('🎬 Up next: ' + announce.title + ' — starting in ' + Math.max(1, Math.round((announce.startAt - Date.now()) / 1000)) + 's');
      clearInterval(announceTimer);
      announceTimer = setInterval(() => {
        const s = Math.ceil((announce.startAt - Date.now()) / 1000);
        if (s <= 0) { clearInterval(announceTimer); UI.announce(null); }
        else UI.announce('🎬 Up next: ' + announce.title + ' — starting in ' + s + 's');
      }, 1000);
    } else {
      UI.announce(null);
    }
    if (!movie) { video.pause(); video.removeAttribute('src'); video.dataset.src = ''; return; }
    if (movie.type === 'file') {
      if (video.dataset.src !== movie.src) {
        video.dataset.src = movie.src;
        video.src = movie.src;
        video.load();
      }
      const desired = pb.position + (pb.playing ? (Date.now() - pb.at) / 1000 : 0);
      if (pb.playing) {
        if (Math.abs((video.currentTime || 0) - desired) > 2 && video.readyState >= 1) {
          try { video.currentTime = desired; } catch (e) { /* seeking before metadata */ }
        }
        video.play().catch(() => UI.toast('Tap anywhere to allow video sound.'));
      } else {
        video.pause();
      }
    } else {
      // external / embed sources: no synchronized playback — show the announcement on screen
      video.pause();
      if (video.dataset.src) { video.removeAttribute('src'); video.dataset.src = ''; }
    }
    const playBtn = $('btn-play-top');
    if (playBtn) playBtn.textContent = (pb && pb.playing) ? '⏸' : '▶';
  }

  video.addEventListener('error', () => {
    if (video.dataset.src) UI.toast('Video failed to load — the host can pick another title.');
  });

  setInterval(() => {
    const pb = theater.state.playback;
    const movie = currentMovie();
    if (!movie || movie.type !== 'file' || !pb || !pb.playing) return;
    if (video.readyState < 1) return;
    const desired = pb.position + (Date.now() - pb.at) / 1000;
    if (Math.abs(video.currentTime - desired) > 1.5) {
      try { video.currentTime = desired; } catch (e) { /* ignore */ }
    }
  }, 5000);

  /* ---------------- network ---------------- */
  function wireNet() {
    net = new window.Net({
      onOpen: () => { UI.banner('net-banner', false); },
      onClose: () => { if (!offline) UI.banner('net-banner', true); },
      onMessage(m) {
        const st = theater.state;
        switch (m.type) {
          case 'init': {
            st.meId = m.you; st.hostId = m.host; st.playback = m.playback; st.movies = m.movies;
            for (const p of m.players) theater.addPlayer(p);
            for (const [seatId, occ] of Object.entries(m.seats)) st.seatOf.set(seatId, occ.userId);
            UI.online(st.players.size);
            UI.hostPanel(isHost());
            UI.chatClear();
            enterTheaterHud();
            break;
          }
          case 'playerJoin':
            theater.addPlayer(m.player);
            UI.online(st.players.size);
            break;
          case 'playerLeave':
            theater.removePlayer(m.id);
            UI.online(st.players.size);
            break;
          case 'playerMove': {
            const p = st.players.get(m.id);
            if (p) { p.tx = m.x; p.ty = m.y; p.facing = m.facing; }
            break;
          }
          case 'playerSit': {
            const p = st.players.get(m.id);
            if (p) { p.seat = m.seatId; p.x = p.tx = m.x; p.y = p.ty = m.y; }
            st.seatOf.set(m.seatId, p ? p.userId : null);
            break;
          }
          case 'playerStand': {
            const p = st.players.get(m.id);
            if (p) { p.seat = null; p.x = p.tx = m.x; p.y = p.ty = m.y; }
            st.seatOf.delete(m.seatId);
            break;
          }
          case 'chat': {
            const p = m.id != null ? st.players.get(m.id) : null;
            if (p && blocked.has(p.userId)) break;
            UI.chatAdd(m, st.meId);
            if (p) { p.bubble = m.text; p.bubbleUntil = theater.t + 4.5; }
            break;
          }
          case 'emote': {
            const p = st.players.get(m.id);
            if (p) { p.emote = m.emote; p.emoteUntil = theater.t + 3; }
            break;
          }
          case 'prop': {
            const p = st.players.get(m.id);
            if (p) p.prop = m.prop;
            break;
          }
          case 'hostChanged':
            st.hostId = m.host;
            UI.hostPanel(isHost());
            if (st.meId === m.host) UI.toast('👑 You are now the theater host.');
            break;
          case 'playback':
            syncPlayback(m);
            UI.moviesRender(st.movies, st.playback, isHost(), movieCbs);
            break;
          case 'error': UI.toast(m.message || 'Something went wrong.'); break;
          case 'notice': UI.toast(m.message || ''); break;
        }
      },
    });
  }

  /* ---------------- avatar + theater entry ---------------- */
  let myAvatar = null;

  function enterTheaterHud() {
    for (const id of ['screen-welcome', 'screen-register', 'screen-login', 'screen-recover', 'screen-avatar'])
      $(id).classList.add('hidden');
    UI.hud(true);
  }

  function enterTheater(u, isOffline) {
    user = u;
    offline = !!isOffline;
    myAvatar = u.avatar || window.AV.randomAvatar();
    theater.state.offline = offline;
    if (offline) {
      /* offline preview: local playback of the CC-licensed demo films only */
      theater.state.movies = FALLBACK_MOVIES;
      theater.state.meId = 'you';
      theater.state.hostId = 'you';
      theater.addPlayer({ id: 'you', userId: 'local-' + u.id, name: u.username, avatar: myAvatar, x: 12.5, y: 17.5, facing: 1, seat: null, prop: null });
      UI.hostPanel(true);
      UI.banner('offline-banner', true);
      enterTheaterHud();
    } else {
      UI.banner('offline-banner', false);
      net.connect(API.token);
    }
    requestAnimationFrame(loop);
  }

  /* host commands: via the server when online, local when previewing */
  function hostCmd(action, movie, extra) {
    if (!offline) { net.host(action, movie ? Object.assign({ movieId: movie.id }, extra || {}) : extra); return; }
    const pb = theater.state.playback || { movieId: null, playing: false, position: 0, at: Date.now(), announce: null };
    switch (action) {
      case 'select':
        theater.state.playback = { ...pb, movieId: movie.id, playing: false, position: 0, at: Date.now(), announce: null };
        break;
      case 'play':
        theater.state.playback = { movieId: movie.id, playing: true, position: pb.movieId === movie.id ? pb.position : 0, at: Date.now(), announce: null };
        break;
      case 'pause':
        if (pb.playing) theater.state.playback = { ...pb, playing: false, position: pb.position + (Date.now() - pb.at) / 1000, at: Date.now() };
        break;
      case 'resume':
        if (pb.movieId) theater.state.playback = { ...pb, playing: true, at: Date.now() };
        break;
      case 'skip':
        theater.state.playback = { movieId: movie.id, playing: false, position: 0, at: Date.now(), announce: null };
        break;
      default: return;
    }
    syncPlayback(theater.state.playback);
    UI.moviesRender(theater.state.movies, theater.state.playback, true, movieCbs);
  }

  /* ---------------- movement ---------------- */
  function update(dt) {
    const p = myPlayer();
    if (!p || p.seat) { if (p) p.moving = false; return; }

    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    let fromKeys = dx !== 0 || dy !== 0;

    if (!fromKeys && target) {
      const tx = target.x - p.x, ty = target.y - p.y;
      const d = Math.hypot(tx, ty);
      if (d < 0.12) {
        target = null;
        if (pendingSeat) { const s = pendingSeat; pendingSeat = null; trySit(seatById(s), true); }
      } else {
        dx = tx / d; dy = ty / d;
      }
    }

    const moving = (dx !== 0 || dy !== 0);
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const speed = 3.2 * dt;
      const nx = p.x + (dx / len) * speed;
      const ny = p.y + (dy / len) * speed;
      if (!blockedAt(nx, p.y)) p.x = nx;
      if (!blockedAt(p.x, ny)) p.y = ny;
      p.facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : -1) : (dy > 0 ? -1 : 1);
      p.phase = (p.phase || 0) + dt * 11;
    }
    p.moving = moving;

    // interpolate remote players toward their last known position
    for (const o of theater.state.players.values()) {
      if (o.id === theater.state.meId || o.seat) continue;
      const k = Math.min(1, dt * 8);
      o.x += (o.tx - o.x) * k;
      o.y += (o.ty - o.y) * k;
      const d = Math.hypot(o.tx - o.x, o.ty - o.y);
      o.moving = d > 0.04;
      if (o.moving) o.phase = (o.phase || 0) + dt * 11;
    }

    // send our position ~10x per second
    const now = performance.now();
    if (!offline && moving && now - lastSent > 110) {
      lastSent = now;
      net.move(p.x, p.y, p.facing);
    }
  }

  let loopStarted = false;
  function loop(ts) {
    const dt = Math.min(0.05, ((ts || 0) - (main.last || 0)) / 1000 || 0.016);
    main.last = ts || 0;
    theater.t += dt;
    update(dt);
    theater.draw(theater.t);
    requestAnimationFrame(loop);
  }
  const main = { last: 0 };

  /* ---------------- seats ---------------- */
  function seatById(id) { return window.THEATER.SEATS.find((s) => s.id === id); }

  function trySit(seat, viaWalk) {
    const p = myPlayer();
    if (!seat || !p) return;
    const occupied = theater.state.seatOf.has(seat.id);
    if (occupied) { UI.toast('That seat is taken.'); return; }
    const dist = Math.hypot(p.x - seat.x, p.y - (seat.y + 1));
    if (dist > 1.6 && !viaWalk) { pendingSeat = seat.id; target = { x: seat.x, y: seat.y + 1 }; return; }
    if (offline) {
      p.seat = seat.id; p.x = seat.x; p.y = seat.y;
      theater.state.seatOf.set(seat.id, p.userId);
    } else {
      net.sit(seat.id);
    }
  }

  function stand() {
    const p = myPlayer();
    if (!p || !p.seat) return;
    const seatId = p.seat;
    if (offline) {
      const seat = seatById(seatId);
      theater.state.seatOf.delete(seatId);
      p.seat = null; p.x = seat.x; p.y = seat.y + 1;
    } else {
      net.stand();
    }
  }

  /* ---------------- input ---------------- */
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  };
  window.addEventListener('keydown', (e) => { const k = KEYMAP[e.code]; if (k) { keys[k] = true; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) { keys[k] = false; e.preventDefault(); } });

  /* tap = walk/sit · drag = pan the view · pinch (or ➕/➖) = zoom */
  const pointers = new Map();     // pointerId -> {x, y}
  let drag = null;                // {x, y, moved}
  let pinch = null;               // {dist}

  function pinchDist() {
    const pts = [...pointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, moved: false };
    } else if (pointers.size === 2) {
      pinch = { dist: pinchDist() };
      if (drag) drag.moved = true; // two fingers: no tap
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const d = pinchDist();
      if (d > 0 && pinch.dist > 0) theater.zoomBy(d / pinch.dist);
      pinch.dist = d;
      return;
    }
    if (drag && pointers.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 10) drag.moved = true;
      if (drag.moved) {
        theater.panBy(dx, dy);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    }
  });

  function endPointer(e) {
    const wasDrag = drag;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (wasDrag && !wasDrag.moved) handleTap(e);
      drag = null;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function handleTap(e) {
    const rect = canvas.getBoundingClientRect();
    const tile = theater.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (!myPlayer()) return;
    const tx = Math.round(tile.x), ty = Math.round(tile.y);
    const seat = window.THEATER.seatNear(tx, ty);
    if (seat) {
      const p = myPlayer();
      if (p.seat) { if (p.seat !== seat.id) stand(); return; }
      trySit(seat, false);
      return;
    }
    if (myPlayer().seat) { stand(); return; }
    if (tx >= 0 && tx < 26 && ty >= 0 && ty < 20 && !blockedAt(tx, ty)) {
      target = { x: tx + 0.5, y: ty + 0.5 };
      pendingSeat = null;
    }
  }

  /* ---------------- auth UI ---------------- */
  function bindAuth() {
    $('btn-go-register').addEventListener('click', () => { UI.msg('welcome-msg', ''); UI.show('register'); });
    $('btn-go-login').addEventListener('click', () => { UI.msg('welcome-msg', ''); UI.show('login'); });
    $('reg-tologin').addEventListener('click', () => UI.show('login'));
    $('log-toreg').addEventListener('click', () => UI.show('register'));
    $('log-forgot').addEventListener('click', () => UI.show('recover'));
    $('rec-back').addEventListener('click', () => UI.show('login'));

    $('reg-go').addEventListener('click', async () => {
      const username = $('reg-user').value.trim();
      const email = $('reg-email').value.trim();
      const pass = $('reg-pass').value;
      const pass2 = $('reg-pass2').value;
      if (!/^\S{3,20}$/u.test(username)) return UI.msg('reg-err', 'Username: 3-20 characters, no spaces (any letters, symbols or emoji).', true);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return UI.msg('reg-err', "That email doesn't look valid (email is optional).", true);
      if (pass.length < 8) return UI.msg('reg-err', 'Password must be at least 8 characters.', true);
      if (pass !== pass2) return UI.msg('reg-err', 'Passwords do not match.', true);
      try {
        const r = await API.register(username, email || undefined, pass);
        API.token = r.token;
        user = r.user;
        openAvatarCreator();
      } catch (err) { UI.msg('reg-err', err.message, true); }
    });

    $('log-go').addEventListener('click', async () => {
      try {
        const r = await API.login($('log-id').value.trim(), $('log-pass').value);
        API.token = r.token;
        user = r.user;
        if (user.avatar) enterTheater(user, false);
        else openAvatarCreator();
      } catch (err) { UI.msg('log-err', err.message, true); }
    });

    $('rec-go').addEventListener('click', async () => {
      try {
        const r = await API.recover($('rec-email').value.trim());
        UI.msg('rec-msg', 'If that email is registered, a recovery code has been created.'
          + (r.devToken ? ' (DEV MODE) code: ' + r.devToken : ' Check your inbox.'), false);
        if (r.devToken) { $('rec-reset').classList.remove('hidden'); $('rec-token').value = r.devToken; }
      } catch (err) { UI.msg('rec-msg', err.message, true); }
    });

    $('rec-resetgo').addEventListener('click', async () => {
      try {
        await API.reset($('rec-token').value.trim(), $('rec-newpass').value);
        UI.msg('rec-msg', 'Password updated — you can log in now.', false);
        UI.show('login');
      } catch (err) { UI.msg('rec-msg', err.message, true); }
    });

    $('btn-preview').addEventListener('click', () => {
      enterTheater({ id: 0, username: 'Guest', avatar: window.AV.randomAvatar() }, true);
    });
  }

  /* ---------------- avatar creator ---------------- */
  function openAvatarCreator() {
    myAvatar = user.avatar || window.AV.randomAvatar();
    UI.show('avatar');
    UI.setUsername(user.username);
    UI.buildAvatarOptions(myAvatar, () => UI.renderAvatarPreview(myAvatar));
    UI.renderAvatarPreview(myAvatar);
  }

  $('av-random').addEventListener('click', () => {
    myAvatar = window.AV.randomAvatar();
    UI.buildAvatarOptions(myAvatar, () => UI.renderAvatarPreview(myAvatar));
    UI.renderAvatarPreview(myAvatar);
  });

  $('av-go').addEventListener('click', async () => {
    try {
      await API.saveAvatar(myAvatar);
      user.avatar = myAvatar;
      enterTheater(user, false);
    } catch (err) {
      UI.msg('av-err', err.message + ' — you can still preview offline.', true);
      enterTheater({ ...user, avatar: myAvatar }, true);
    }
  });

  /* ---------------- HUD wiring ---------------- */
  const blocked = new Set(JSON.parse(localStorage.getItem('vmt_block') || '[]'));
  let modTarget = null;
  let queuedMovieId = null;

  /* demo films (CC-licensed) so the screen can be tested without the server */
  const FALLBACK_MOVIES = [
    { id: 'big-buck-bunny', title: 'Big Buck Bunny (CC-BY)', type: 'file',
      src: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v',
      note: 'Creative Commons demo film — plays locally in offline preview.' },
    { id: 'sintel', title: 'Sintel (CC-BY)', type: 'file',
      src: 'https://download.blender.org/durian/movies/Sintel.2010.720p.mp4',
      note: 'Creative Commons demo film — plays locally in offline preview.' },
  ];

  const movieCbs = {
    onSelect: (m) => { queuedMovieId = m.id; hostCmd('select', m); },
    onPlay: (m) => { queuedMovieId = m.id; hostCmd('play', m); },
    onFolder: (m) => {
      // list local media files the host can play (server exposes /media/)
      fetch('/media/').catch(() => {});
      UI.toast('Drop MP4/WebM files into server/media — they stream from /media/<name>.');
    },
  };

  function bindHud() {
    $('btn-logout').addEventListener('click', async () => {
      net.close();
      try { await API.logout(); } catch (e) { /* ignore */ }
      API.token = null; user = null;
      theater.state.players.clear(); theater.state.seatOf.clear();
      video.pause(); video.removeAttribute('src'); video.dataset.src = '';
      UI.hud(false); UI.show('welcome');
    });

    $('btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    });

    $('btn-zoom-in').addEventListener('click', () => theater.zoomBy(1.25));
    $('btn-zoom-out').addEventListener('click', () => theater.zoomBy(0.8));

    const togglePanel = (id) => {
      const el = $(id);
      const showing = !el.classList.contains('hidden');
      for (const p of ['panel-chat', 'panel-players', 'panel-movies', 'panel-emotes', 'panel-snack'])
        $(p).classList.add('hidden');
      if (!showing) el.classList.remove('hidden');
      if (id === 'panel-players') UI.playersRender([...theater.state.players.values()], theater.state.meId, theater.state.hostId, openMod);
      if (id === 'panel-movies') UI.moviesRender(theater.state.movies, theater.state.playback, isHost(), movieCbs);
    };

    $('btn-chat').addEventListener('click', () => togglePanel('panel-chat'));
    $('btn-players').addEventListener('click', () => togglePanel('panel-players'));
    $('btn-movies').addEventListener('click', () => togglePanel('panel-movies'));
    $('btn-emote').addEventListener('click', () => togglePanel('panel-emotes'));
    $('btn-snack').addEventListener('click', () => togglePanel('panel-snack'));
    $('chat-close').addEventListener('click', () => $('panel-chat').classList.add('hidden'));
    $('players-close').addEventListener('click', () => $('panel-players').classList.add('hidden'));
    $('movies-close').addEventListener('click', () => $('panel-movies').classList.add('hidden'));
    $('emotes-close').addEventListener('click', () => $('panel-emotes').classList.add('hidden'));
    $('snack-close').addEventListener('click', () => $('panel-snack').classList.add('hidden'));
    $('mod-close').addEventListener('click', () => $('panel-mod').classList.add('hidden'));

    const offlineGuard = (msg) => { UI.toast(msg); };

    const sendChat = () => {
      const text = UI.chatInput().trim();
      if (!text) return;
      if (offline) return offlineGuard('Chat needs the multiplayer server (see README).');
      net.chat(text);
      UI.chatClearInput();
    };
    $('chat-send').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

    for (const btn of document.querySelectorAll('[data-emote]')) {
      btn.addEventListener('click', () => {
        if (offline) return offlineGuard('Emotes need the multiplayer server.');
        net.emote(btn.dataset.emote);
      });
    }
    $('sn-popcorn').addEventListener('click', () => offline ? offlineGuard('Snacks need the server.') : net.prop('popcorn'));
    $('sn-drink').addEventListener('click', () => offline ? offlineGuard('Snacks need the server.') : net.prop('drink'));
    $('sn-none').addEventListener('click', () => offline ? offlineGuard('Snacks need the server.') : net.prop(null));

    const hostPlay = () => {
      const cur = currentMovie();
      if (cur) { hostCmd('play', cur); return; }
      const m = theater.state.movies.find((x) => x.id === queuedMovieId);
      if (m) hostCmd('play', m);
      else UI.toast('Queue a movie first.');
    };
    const hostPause = () => currentMovie() ? hostCmd('pause') : UI.toast('Nothing is playing.');
    const hostResume = () => currentMovie() ? hostCmd('resume') : UI.toast('Nothing is selected.');
    const hostSkip = () => {
      const m = theater.state.movies.find((x) => x.id === queuedMovieId);
      if (m) hostCmd('skip', m);
      else UI.toast('Queue a movie first.');
    };
    $('hp-play').addEventListener('click', hostPlay);
    $('hp-pause').addEventListener('click', hostPause);
    $('hp-resume').addEventListener('click', hostResume);
    $('hp-skip').addEventListener('click', hostSkip);
    $('hp-announce').addEventListener('click', () => {
      if (offline) return offlineGuard('Announcements need the multiplayer server.');
      queuedMovieId
        ? net.host('announce', { movieId: queuedMovieId, inSeconds: 60 })
        : UI.toast('Queue a movie first.');
    });

    /* top-right play button: plays/pauses whatever is selected or queued,
       and opens the movie menu if nothing is chosen yet */
    $('btn-play-top').addEventListener('click', () => {
      const pb = theater.state.playback;
      const cur = currentMovie();
      if (cur && pb && pb.playing) {
        hostCmd('pause');
        $('btn-play-top').textContent = '▶';
        return;
      }
      if (cur && pb && pb.position > 0) {
        hostCmd('resume');
        $('btn-play-top').textContent = '⏸';
        return;
      }
      const m = theater.state.movies.find((x) => x.id === queuedMovieId);
      if (m) {
        hostCmd('play', m);
        $('btn-play-top').textContent = '⏸';
        return;
      }
      $('panel-movies').classList.remove('hidden');
      UI.moviesRender(theater.state.movies, theater.state.playback, isHost(), movieCbs);
      UI.toast('Pick a movie, then hit ▶ to start.');
    });

    function openMod(p) {
      modTarget = p;
      const muted = false; // host sees mute/unmute; server state is authoritative on action
      UI.modShow(p.name, isHost(), muted);
    }
    $('mod-report').addEventListener('click', () => {
      if (!modTarget) return;
      const reason = prompt('What did ' + modTarget.name + ' do?');
      if (!reason) return;
      if (offline) return offlineGuard('Reports need the server.');
      net.report(modTarget.name, reason);
      $('panel-mod').classList.add('hidden');
    });
    $('mod-block').addEventListener('click', () => {
      if (!modTarget) return;
      blocked.add(modTarget.userId);
      localStorage.setItem('vmt_block', JSON.stringify([...blocked]));
      UI.toast(modTarget.name + ' is blocked — their chat is hidden for you.');
      $('panel-mod').classList.add('hidden');
    });
    $('mod-mute').addEventListener('click', () => { if (modTarget) net.host('mute', { userId: modTarget.userId }); $('panel-mod').classList.add('hidden'); });
    $('mod-unmute').addEventListener('click', () => { if (modTarget) net.host('unmute', { userId: modTarget.userId }); $('panel-mod').classList.add('hidden'); });
    $('mod-transfer').addEventListener('click', () => { if (modTarget) net.host('transfer', { userId: modTarget.userId }); $('panel-mod').classList.add('hidden'); });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    resize();
    bindAuth();
    bindHud();
    wireNet();
    UI.show('welcome');
    // deep link: /?preview=1 → offline theater preview (Phase 1 visual test)
    if (new URLSearchParams(location.search).get('preview') === '1') {
      enterTheater({ id: 0, username: 'Guest', avatar: window.AV.randomAvatar() }, true);
      return;
    }
    if (API.token) {
      try {
        const r = await API.me();
        user = r.user;
        if (user.avatar) enterTheater(user, false);
        else openAvatarCreator();
        return;
      } catch (e) { API.token = null; }
    }
    // probe the server so the welcome screen can explain what's available
    try {
      await fetch('/api/movies');
      UI.msg('welcome-msg', 'Server reachable — create an account to play online.');
    } catch (e) {
      UI.msg('welcome-msg', 'Game server not running (start it: cd server && npm start). You can still preview the theater offline.', true);
    }
  }

  boot();
})();
