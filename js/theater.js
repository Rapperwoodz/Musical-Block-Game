/* theater.js — 2D isometric movie-theater scene rendered on canvas.
   Layout mirrors the reference image: dark tiled walls, wooden floor,
   giant screen on the north wall, red carpet + seat rows, snack counter,
   popcorn machine, posters, neon sign, wall lights, speakers, exit door. */
(function () {
  'use strict';

  const GRID_X = 26, GRID_Y = 20;
  const TW = 64, TH = 32;            // tile footprint on screen
  const WALL_H = 230;                 // wall height above the floor line
  const SCREEN_H = 215;               // screen height on the wall (big & bold)
  const OX = 640, OY = 270;           // world origin offset

  function iso(x, y) { return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) }; }

  /* Seat layout — must mirror server/room.js */
  const SEAT_XS = [7, 8, 9, 10, 12, 13, 14, 15];
  const SEATS = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < SEAT_XS.length; c++)
      SEATS.push({ id: `s${r}-${c}`, x: SEAT_XS[c], y: 5 + r * 2 });

  const BLOCKED = new Set();
  for (let x = 0; x < GRID_X; x++)
    for (let y = 0; y < GRID_Y; y++)
      if (x <= 0 || x >= 25 || y <= 0 || y >= 19) BLOCKED.add(x + ',' + y);
  for (const s of SEATS) BLOCKED.add(s.x + ',' + s.y);
  for (let x = 2; x <= 4; x++) for (let y = 5; y <= 8; y++) BLOCKED.add(x + ',' + y);
  BLOCKED.add('2,9'); BLOCKED.add('1,5'); BLOCKED.add('1,12'); BLOCKED.add('24,12');

  function walkable(x, y) {
    const r = 0.3;
    for (const dx of [-r, r]) for (const dy of [-r, r])
      if (BLOCKED.has(Math.round(x + dx) + ',' + Math.round(y + dy))) return false;
    return true;
  }

  function seatNear(x, y) {
    let best = null, bd = 1.6;
    for (const s of SEATS) {
      if (Math.hypot(s.x - x, s.y - (y + 1)) < bd) { bd = Math.hypot(s.x - x, s.y - (y + 1)); best = s; }
    }
    return best;
  }

  const SCENE_W = 1472, SCENE_H = 1006;
  const WOODS = ['#c2955e', '#c9a268', '#bd8d53', '#c49b61'];

  class Theater {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.video = document.getElementById('movie-video');
      this.state = {
        players: new Map(),   // id -> {id,name,avatar,x,y,facing,seat,prop,phase,moving,bubble,...}
        seatOf: new Map(),    // seatId -> userId
        hostId: null, meId: null,
        playback: null, movies: [],
        offline: false,
      };
      this.view = { s: 1, ox: 0, oy: 0 };
      this.camera = { panX: 0, panY: 0, zoom: 1 };
      this.t = 0;
    }

    /* camera controls: drag to pan, pinch/buttons to zoom */
    panBy(dx, dy) {
      this.camera.panX += dx / this.view.s;
      this.camera.panY += dy / this.view.s;
      const lim = 700;
      this.camera.panX = Math.max(-lim, Math.min(lim, this.camera.panX));
      this.camera.panY = Math.max(-400, Math.min(400, this.camera.panY));
    }
    zoomBy(factor) {
      this.camera.zoom = Math.max(0.6, Math.min(2.6, this.camera.zoom * factor));
    }

    addPlayer(p) { p.tx = p.x; p.ty = p.y; p.phase = 0; this.state.players.set(p.id, p); }
    removePlayer(id) {
      const p = this.state.players.get(id);
      if (p && p.seat) this.state.seatOf.delete(p.seat);
      this.state.players.delete(id);
    }
    me() { return this.state.players.get(this.state.meId); }

    screenToTile(px, py) {
      const wx = (px - this.view.ox) / this.view.s - OX;
      const wy = (py - this.view.oy) / this.view.s - OY;
      return { x: (wx / 32 + wy / 16) / 2, y: (wy / 16 - wx / 32) / 2 };
    }

    /* ---------------- scene painting ---------------- */
    draw(t) {
      this.t = t;
      const ctx = this.ctx, cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
      const dpr = this.canvas.width / Math.max(1, cw);
      const s = Math.min(Math.min(cw / SCENE_W, ch / SCENE_H) * 1.06, 1.7) * this.camera.zoom;
      const ox = (cw - SCENE_W * s) / 2 + this.camera.panX;
      const oy = Math.max(6, (ch - SCENE_H * s) / 2) + this.camera.panY;
      this.view = { s, ox, oy };
      // lights dim while the movie plays
      this.dim = !!(this.state.playback && this.state.playback.playing);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(0, 0, cw, ch);
      ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(OX, OY);

      this.drawFloor(ctx);
      this.drawWalls(ctx);
      this.drawWallDecor(ctx, t);
      this.drawScreen(ctx, t);
      this.drawEntities(ctx, t);
      if (this.dim) {
        /* movie mode: house lights down, screen stays bright */
        ctx.fillStyle = 'rgba(2,2,10,0.55)';
        ctx.fillRect(-OX, -OY, SCENE_W, SCENE_H);
        this.drawScreen(ctx, t);
      }
      this.drawVignette(ctx, t);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    diamond(ctx, x, y, inset) {
      const i = inset || 0;
      const p = [iso(x + i, y + i), iso(x + 1 - i, y + i), iso(x + 1 - i, y + 1 - i), iso(x + i, y + 1 - i)];
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(p[k].x, p[k].y);
      ctx.closePath();
    }

    drawFloor(ctx) {
      for (let x = 0; x < GRID_X; x++) for (let y = 0; y < GRID_Y; y++) {
        const carpet = x >= 6 && x <= 19 && y >= 4 && y <= 15;
        if (carpet) {
          this.diamond(ctx, x, y);
          ctx.fillStyle = (x + y) % 2 ? '#8f1420' : '#9a1622';
          ctx.fill();
        } else if (x === 0 || y === 0 || x === 25 || y === 19) {
          this.diamond(ctx, x, y);
          ctx.fillStyle = '#1c1c21'; ctx.fill();
        } else {
          this.diamond(ctx, x, y);
          ctx.fillStyle = WOODS[(x * 3 + y * 7) % 4];
          ctx.fill();
          ctx.strokeStyle = 'rgba(80,50,25,0.25)'; ctx.lineWidth = 1;
          if ((x + y) % 2 === 0) ctx.stroke();
        }
      }
      /* neat single border around the carpet */
      const c = [iso(6, 4), iso(20, 4), iso(20, 16), iso(6, 16)];
      ctx.beginPath();
      ctx.moveTo(c[0].x, c[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
      ctx.closePath();
      ctx.strokeStyle = '#5c0b13'; ctx.lineWidth = 3; ctx.stroke();
    }

    drawWalls(ctx) {
      // north wall (screen wall): y = 0 line
      const n1 = iso(0, 0), n2 = iso(26, 0);
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y - WALL_H); ctx.lineTo(n2.x, n2.y - WALL_H);
      ctx.lineTo(n2.x, n2.y); ctx.lineTo(n1.x, n1.y); ctx.closePath();
      let g = ctx.createLinearGradient(0, n1.y - WALL_H, 0, n1.y);
      g.addColorStop(0, '#191a1f'); g.addColorStop(1, '#31323a');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#101014'; ctx.lineWidth = 2; ctx.stroke();

      // tile grid on north wall
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      for (let x = 0; x <= 26; x += 2) {
        const p = iso(x, 0);
        ctx.beginPath(); ctx.moveTo(p.x, p.y - WALL_H); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      for (let yy = 34; yy < WALL_H; yy += 44) {
        ctx.beginPath(); ctx.moveTo(n1.x, n1.y - WALL_H + yy); ctx.lineTo(n2.x, n2.y - WALL_H + yy); ctx.stroke();
      }

      // west wall (posters + neon): x = 0 line
      const w1 = iso(0, 0), w2 = iso(0, 20);
      ctx.beginPath();
      ctx.moveTo(w1.x, w1.y - WALL_H); ctx.lineTo(w2.x, w2.y - WALL_H);
      ctx.lineTo(w2.x, w2.y); ctx.lineTo(w1.x, w1.y); ctx.closePath();
      g = ctx.createLinearGradient(0, w1.y - WALL_H, 0, w2.y);
      g.addColorStop(0, '#15161a'); g.addColorStop(1, '#2a2b32');
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      for (let y = 0; y <= 20; y += 2) {
        const p = iso(0, y);
        ctx.beginPath(); ctx.moveTo(p.x, p.y - WALL_H); ctx.lineTo(p.x, p.y); ctx.stroke();
      }

      // east wall (exit door side): x = 26 line
      const e1 = iso(26, 0), e2 = iso(26, 20);
      ctx.beginPath();
      ctx.moveTo(e1.x, e1.y - WALL_H); ctx.lineTo(e2.x, e2.y - WALL_H);
      ctx.lineTo(e2.x, e2.y); ctx.lineTo(e1.x, e1.y); ctx.closePath();
      g = ctx.createLinearGradient(0, e1.y - WALL_H, 0, e2.y);
      g.addColorStop(0, '#101114'); g.addColorStop(1, '#232429');
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();

      // exit door + sign
      const d1 = iso(26, 8), d2 = iso(26, 11);
      ctx.beginPath();
      ctx.moveTo(d1.x, d1.y - 120); ctx.lineTo(d2.x, d2.y - 120);
      ctx.lineTo(d2.x, d2.y); ctx.lineTo(d1.x, d1.y); ctx.closePath();
      ctx.fillStyle = '#0b0b0e'; ctx.fill();
      ctx.strokeStyle = '#2c2d33'; ctx.lineWidth = 3; ctx.stroke();
      const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
      ctx.beginPath(); ctx.moveTo(d1.x + 8, d1.y - 55); ctx.lineTo(d2.x - 8, d2.y - 55);
      ctx.strokeStyle = '#3c3d45'; ctx.lineWidth = 4; ctx.stroke();
      this.wallText(ctx, 'EXIT', mid.x + 2, mid.y - 132, 15, '#ff5a66', '#ff2030');
    }

    /* text painted in a wall's sheared plane */
    wallText(ctx, text, x, y, size, fill, glow, align) {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(0.894, -0.447, 0, 1, 0, 0); // wall plane (reads up-right)
      ctx.font = '800 ' + size + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = align || 'center';
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
      ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    westText(ctx, text, x, y, size, fill, glow) {
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(0.894, -0.447, 0, 1, 0, 0); // west wall plane
      ctx.font = '800 ' + size + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
      ctx.fillStyle = fill;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    drawWallDecor(ctx, t) {
      // neon MOVIE THEATER sign (west wall, reading up-right from the south end)
      const org = iso(0, 8);
      const bx = org.x + 6, by = org.y - WALL_H + 60;
      // popcorn icon
      ctx.save();
      ctx.translate(bx, by - 46);
      ctx.transform(0.894, -0.447, 0, 1, 0, 0);
      ctx.fillStyle = '#d92632';
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-8, 26); ctx.lineTo(8, 26); ctx.lineTo(11, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-5, 0, 3, 26); ctx.fillRect(2, 0, 3, 26);
      ctx.fillStyle = '#f7c948';
      for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.arc(i, -4 + (i % 8), 3.4, 0, 7); ctx.fill(); }
      ctx.restore();
      this.westText(ctx, 'MOVIE', bx, by, 24, '#ff5563', '#ff2036');
      this.westText(ctx, 'THEATER', bx, by + 34, 24, '#ff5563', '#ff2036');

      // framed posters (west wall)
      const posters = [
        { y: 9.4, c1: '#79a83a', c2: '#20340f', title: 'OGRE NIGHT' },
        { y: 13.4, c1: '#2f7fd0', c2: '#0d2440', title: 'OCEAN QUEST' },
      ];
      for (const po of posters) {
        const fp = iso(0, po.y + 0.9);
        const x = fp.x + 5, y = fp.y - WALL_H + 50;
        ctx.save();
        ctx.translate(x, y);
        ctx.transform(0.894, -0.447, 0, 1, 0, 0);
        const g = ctx.createLinearGradient(0, -6, 0, 92);
        g.addColorStop(0, po.c1); g.addColorStop(1, po.c2);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 62, 92);
        ctx.strokeStyle = '#d9b34a'; ctx.lineWidth = 5; ctx.strokeRect(0, 0, 62, 92);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '800 11px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(po.title, 31, 78);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.arc(31, 42, 20, 0, 7); ctx.fill();
        ctx.restore();
        // little wall lamp above the poster
        const lp = iso(0, po.y + 0.9);
        ctx.save();
        ctx.translate(lp.x + 4, lp.y - WALL_H + 40);
        ctx.transform(0.894, -0.447, 0, 1, 0, 0);
        ctx.fillStyle = '#ffd35c';
        ctx.shadowColor = '#ffd35c'; ctx.shadowBlur = 12;
        ctx.fillRect(-14, 0, 28, 5);
        ctx.restore();
      }

      // wall sconces: west wall
      const flick = (i) => 0.9 + Math.sin(t * 2.2 + i * 1.7) * 0.08;
      for (const y of [3, 7, 11, 15, 18]) {
        const p = iso(0, y);
        this.sconce(ctx, p.x + 5, p.y - WALL_H + 60, flick(y));
      }
      // wall sconces: north wall
      for (const x of [4, 22]) {
        const p = iso(x, 0);
        this.sconce(ctx, p.x - 4, p.y - WALL_H + 70, flick(x));
      }
    }

    sconce(ctx, x, y, a) {
      const d = this.dim ? 0.25 : 1; // house lights drop when the movie plays
      ctx.save();
      ctx.fillStyle = '#ffd35c';
      ctx.shadowColor = '#ffd35c'; ctx.shadowBlur = 16 * a * d;
      rr(ctx, x - 4, y - 20, 8, 40, 4); ctx.fill();
      ctx.shadowBlur = 0;
      const g = ctx.createRadialGradient(x, y, 4, x, y, 90 * a);
      g.addColorStop(0, 'rgba(255,211,92,' + (0.2 * a * d) + ')');
      g.addColorStop(1, 'rgba(255,211,92,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 90 * a * d, 0, 7); ctx.fill();
      ctx.restore();
    }

    drawScreen(ctx, t) {
      const b1 = iso(6.5, 0), b2 = iso(19.5, 0);
      const t1 = { x: b1.x, y: b1.y - SCREEN_H }, t2 = { x: b2.x, y: b2.y - SCREEN_H };

      // frame
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(b1.x - 12, b1.y + 10); ctx.lineTo(b2.x + 12, b2.y + 10);
      ctx.lineTo(b2.x + 12, b2.y - SCREEN_H - 12); ctx.lineTo(b1.x - 12, b1.y - SCREEN_H - 12);
      ctx.closePath();
      ctx.fillStyle = '#0a0a0d'; ctx.fill();
      ctx.strokeStyle = '#232329'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();

      // screen surface
      const quad = [t1, t2, b2, b1];
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.closePath();
      ctx.save(); ctx.clip();

      const movie = this.currentMovie();
      const video = this.video;
      const hasVideo = movie && movie.type === 'file' && video && video.readyState >= 2 && video.videoWidth > 0;

      if (hasVideo) {
        const vw = video.videoWidth, vh = video.videoHeight;
        ctx.transform((b2.x - b1.x) / vw, (b2.y - b1.y) / vw, 0, -(t1.y - b1.y) / vh, t1.x, t1.y);
        ctx.drawImage(video, 0, 0, vw, vh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#060609'; ctx.fill();
        // sheared text helpers on the screen plane
        const cx = (t1.x + b2.x) / 2, cy = (t1.y + b1.y) / 2;
        const u = { x: (b2.x - b1.x) / Math.hypot(b2.x - b1.x, b2.y - b1.y), y: (b2.y - b1.y) / Math.hypot(b2.x - b1.x, b2.y - b1.y) };
        const text = (str, size, dy, fill, blur) => {
          ctx.save();
          ctx.translate(cx, cy + dy);
          ctx.transform(u.x, u.y, 0, 1, 0, 0);
          ctx.font = '800 ' + size + 'px -apple-system, system-ui, sans-serif';
          ctx.textAlign = 'center';
          if (blur) { ctx.shadowColor = blur; ctx.shadowBlur = 18; }
          ctx.fillStyle = fill; ctx.fillText(str, 0, 0);
          ctx.restore();
        };
        if (movie && (movie.type === 'external' || movie.type === 'embed')) {
          text(movie.title, 20, -26, '#ffd9de', '#ff2036');
          if (this.state.playback && this.state.playback.announce) {
            const s = Math.max(0, Math.ceil((this.state.playback.announce.startAt - Date.now()) / 1000));
            text('Starts in ' + s + 's', 22, 8, '#ffffff', null);
          } else {
            text('Open the streaming service to watch', 13, 10, '#9a9ca8', null);
          }
          text('“Open Streaming Service” in the Movies menu ↗', 11, 34, '#7c7e88', null);
        } else if (movie) {
          text('Loading ' + (movie.title || '') + '…', 16, -10, '#cfd2da', null);
          // spinner
          ctx.save();
          ctx.translate(cx, cy + 18);
          ctx.strokeStyle = '#3a3b45'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.stroke();
          ctx.strokeStyle = '#ffd35c';
          ctx.beginPath(); ctx.arc(0, 0, 16, t * 4, t * 4 + 2); ctx.stroke();
          ctx.restore();
        } else {
          text('VIRTUAL MOVIE THEATER', 20, -24, '#ffd35c', '#ffd35c');
          text('Waiting for the host to pick a movie', 13, 10, '#9a9ca8', null);
          text('🎬 Movies → pick, play and watch together', 12, 32, '#7c7e88', null);
        }
        ctx.restore();
      }

      // frame stroke over the surface
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b1.x, b1.y); ctx.closePath();
      ctx.strokeStyle = '#0a0a0d'; ctx.lineWidth = 20; ctx.stroke();
      ctx.strokeStyle = '#2a2b33'; ctx.lineWidth = 2; ctx.stroke();

      // ambient glow while playing
      if (this.state.playback && this.state.playback.playing) {
        const g = ctx.createRadialGradient((t1.x + b2.x) / 2, (t1.y + b2.y) / 2, 30, (t1.x + b2.x) / 2, (t1.y + b2.y) / 2, 420);
        g.addColorStop(0, 'rgba(180,200,255,' + (0.10 + Math.sin(t * 9) * 0.02) + ')');
        g.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc((t1.x + b2.x) / 2, (t1.y + b2.y) / 2, 420, 0, 7); ctx.fill();
      }

      // speaker towers flanking the (larger) screen
      for (const x of [5.2, 20.8]) {
        const p = iso(x, 0.6);
        ctx.fillStyle = '#1a1a1f';
        rr(ctx, p.x - 14, p.y - 140, 28, 140, 6); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
        for (const [cy, r] of [[-106, 9], [-72, 7], [-40, 5], [-18, 4]]) {
          ctx.fillStyle = '#101014';
          ctx.beginPath(); ctx.arc(p.x, p.y + cy, r, 0, 7); ctx.fill();
          ctx.strokeStyle = '#2e2f36'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    currentMovie() {
      const pb = this.state.playback;
      if (!pb || !pb.movieId) return null;
      return this.state.movies.find((m) => m.id === pb.movieId) || null;
    }

    /* snack counter, popcorn machine, plants — standing props */
    drawProps(ctx, t) {
      // counter (west side)
      const c1 = iso(2, 5), c2 = iso(5, 5), c3 = iso(5, 9), c4 = iso(2, 9);
      const H = 30;
      // top
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y - H); ctx.lineTo(c2.x, c2.y - H); ctx.lineTo(c3.x, c3.y - H); ctx.lineTo(c4.x, c4.y - H);
      ctx.closePath();
      ctx.fillStyle = '#34353d'; ctx.fill(); ctx.strokeStyle = '#101014'; ctx.lineWidth = 2; ctx.stroke();
      // front faces
      for (const [a, b] of [[c1, c2], [c2, c3]]) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - H); ctx.lineTo(b.x, b.y - H); ctx.lineTo(b.x, b.y); ctx.lineTo(a.x, a.y);
        ctx.closePath();
        ctx.fillStyle = '#202127'; ctx.fill(); ctx.stroke();
      }
      // drinks on the counter
      const cups = ['#c8202f', '#2d64cc', '#e88918', '#1f9957', '#8544ba', '#c8202f'];
      for (let i = 0; i < cups.length; i++) {
        const p = iso(2.4 + i * 0.5, 5.5);
        ctx.fillStyle = cups[i];
        rr(ctx, p.x - 3, p.y - H - 12, 6, 12, 1.5); ctx.fill();
        ctx.fillStyle = '#eee';
        rr(ctx, p.x - 3.4, p.y - H - 14, 6.8, 3, 1); ctx.fill();
      }
      // popcorn machine beside the counter
      const pm = iso(2, 9.6);
      ctx.fillStyle = '#b8181f';
      rr(ctx, pm.x - 17, pm.y - 62, 34, 62, 5); ctx.fill();
      ctx.strokeStyle = '#7c1015'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,235,170,0.9)';
      rr(ctx, pm.x - 12, pm.y - 54, 24, 26, 3); ctx.fill();
      ctx.fillStyle = '#f7c948';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.arc(pm.x - 9 + (i % 4) * 6, pm.y - 48 + Math.floor(i / 4) * 9, 3, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#7c1015'; ctx.fillRect(pm.x - 17, pm.y - 70, 34, 9);
      // plants
      for (const [x, y] of [[1, 5.8], [1, 12], [24, 12.6]]) {
        const p = iso(x, y);
        ctx.fillStyle = '#8a5a34';
        ctx.beginPath(); ctx.moveTo(p.x - 9, p.y); ctx.lineTo(p.x + 9, p.y); ctx.lineTo(p.x + 6, p.y - 14); ctx.lineTo(p.x - 6, p.y - 14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2f7d3a';
        for (const [dx, dy, r] of [[-7, -22, 8], [7, -22, 8], [0, -30, 9]]) {
          ctx.beginPath(); ctx.ellipse(p.x + dx, p.y + dy, r, r + 3, 0, 0, 7); ctx.fill();
        }
      }
    }

    drawSeat(ctx, seat, sitter) {
      const base = iso(seat.x, seat.y);
      const cushion = '#c82231', back = '#b01824', edge = '#7c1019';
      // cushion
      this.diamond(ctx, seat.x + 0.08, seat.y + 0.08, 0.06);
      ctx.fillStyle = cushion; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
      if (sitter) {
        const a = this.avatarOf(sitter);
        if (a) AV.drawAvatar(ctx, base.x, base.y + 3, a, { sitting: true, facing: 1 });
      }
      // backrest (south side, toward camera)
      const b1 = iso(seat.x + 0.08, seat.y + 1.02), b2 = iso(seat.x + 0.92, seat.y + 0.78);
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y - 40); ctx.lineTo(b2.x, b2.y - 40);
      ctx.lineTo(b2.x, b2.y - 6); ctx.lineTo(b1.x, b1.y - 6); ctx.closePath();
      ctx.fillStyle = back; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#e04a58'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b1.x + 2, b1.y - 36); ctx.lineTo(b2.x - 2, b2.y - 36); ctx.stroke();
      // armrests
      for (const [ax, ay] of [[seat.x + 0.0, seat.y + 0.55], [seat.x + 1.0, seat.y + 0.3]]) {
        const p = iso(ax, ay);
        ctx.fillStyle = '#232329';
        rr(ctx, p.x - 5, p.y - 26, 10, 20, 3); ctx.fill();
        ctx.strokeStyle = '#101014'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    avatarOf(player) { return player.avatar; }

    drawEntities(ctx, t) {
      const ents = [];
      for (const seat of SEATS) {
        const uid = this.state.seatOf.get(seat.id);
        const sitter = uid != null
          ? [...this.state.players.values()].find((p) => p.userId === uid)
          : null;
        ents.push({ key: seat.x + seat.y + 0.35, kind: 'seat', seat, sitter });
      }
      for (const p of this.state.players.values())
        if (!p.seat) ents.push({ key: p.x + p.y, kind: 'player', p });

      // static props sorted into the scene
      ents.push({ key: 2 + 9.6, kind: 'fn', draw: (c) => this.drawProps(c, t) });

      ents.sort((a, b) => a.key - b.key);
      for (const e of ents) {
        if (e.kind === 'seat') this.drawSeat(ctx, e.seat, e.sitter);
        else if (e.kind === 'player') this.drawPlayer(ctx, e.p, t);
        else e.draw(ctx);
      }
    }

    drawPlayer(ctx, p, t) {
      const pos = iso(p.x, p.y);
      const moving = !!p.moving;
      AV.drawAvatar(ctx, pos.x, pos.y - 4, p.avatar || AV.randomAvatar(), {
        phase: p.phase || 0, walking: moving, facing: p.facing || 1,
        prop: p.prop || null, scale: 1,
      });
      AV.drawNameTag(ctx, pos.x, pos.y - 92, p.name, p.id === this.state.meId, p.id === this.state.hostId);
      if (p.emote && t < p.emoteUntil) {
        ctx.font = '26px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.emote, pos.x + 26, pos.y - 96);
      }
      if (p.bubble && t < p.bubbleUntil) {
        AV.drawBubble(ctx, pos.x, pos.y - 108, p.bubble);
      }
    }

    drawVignette(ctx, t) {
      const cx = iso(13, 0).x, cy = iso(13, 0).y - 90;
      const g = ctx.createRadialGradient(cx, cy, 160, cx, cy, 950);
      g.addColorStop(0, 'rgba(10,14,30,0)');
      g.addColorStop(1, 'rgba(4,5,10,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(-OX, -OY, SCENE_W, SCENE_H);
    }
  }

  /* rounded rect helper used by sconces/props */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.THEATER = { Theater, SEATS, walkable, seatNear, iso, SCENE_W, SCENE_H };
})();
