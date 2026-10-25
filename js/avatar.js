/* avatar.js — procedural cartoon avatars drawn on canvas.
   Modular customization: skin, hairstyle + color, top (hoodie/tee) + color,
   pants color, shoes color, expression. Saved as JSON on the account. */
(function () {
  'use strict';

  const SKINS = ['#f6d6b8', '#eab982', '#c98e5c', '#a56a3e', '#7c4a2b', '#5b3520'];
  const HAIR_STYLES = ['Spiky', 'Short', 'Curly', 'Long', 'Swept', 'Bun'];
  const HAIR_COLORS = ['#1c1c22', '#4a2c15', '#8a5223', '#c98432', '#d9b34a', '#bbbbc4', '#932c2c'];
  const TOP_STYLES = ['Hoodie', 'T-shirt'];
  const TOP_COLORS = ['#202027', '#c8202f', '#2d64cc', '#1f9957', '#e88918', '#8544ba', '#eeeeee', '#e26398'];
  const PANTS_COLORS = ['#24242b', '#3a5080', '#55555e', '#6b4a2e', '#772222', '#226644'];
  const SHOE_COLORS = ['#18181c', '#f2f2f2', '#b53434', '#2b52ab'];
  const FACES = ['Neutral', 'Happy', 'Cool', 'Sleepy', 'Excited'];
  const OUT = '#241b13';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFace(ctx, ci) {
    ctx.fillStyle = OUT; ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const lx = -4, rx = 4, ey = -53;
    if (ci === 2) { // cool: shades
      ctx.fillStyle = '#101014';
      rr(ctx, -7, ey - 2.5, 14, 5, 2.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, ey - 1); ctx.lineTo(8, ey - 1); ctx.stroke();
      ctx.fillStyle = OUT;
      ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(0, -46.5); ctx.stroke();
    } else if (ci === 3) { // sleepy: closed lines
      ctx.beginPath(); ctx.moveTo(lx - 2, ey); ctx.quadraticCurveTo(lx, ey + 1.5, lx + 2, ey);
      ctx.moveTo(rx - 2, ey); ctx.quadraticCurveTo(rx, ey + 1.5, rx + 2, ey); ctx.stroke();
    } else {
      if (ci === 4) { // excited: big eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lx, ey, 3.4, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, ey, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = OUT;
        ctx.beginPath(); ctx.arc(lx, ey, 1.8, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, ey, 1.8, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = OUT;
        ctx.beginPath(); ctx.arc(lx, ey, ci === 1 ? 2 : 1.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, ey, ci === 1 ? 2 : 1.5, 0, 7); ctx.fill();
      }
      // mouth
      if (ci === 4) {
        ctx.fillStyle = '#7a4636';
        ctx.beginPath(); ctx.ellipse(0, -46.5, 3, 2.4, 0, 0, 7); ctx.fill();
      } else if (ci === 1) {
        ctx.beginPath(); ctx.arc(0, -48, 2.6, 0.25, Math.PI - 0.25); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-2, -46.6); ctx.lineTo(2, -46.6); ctx.stroke();
      }
    }
    // brows
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(lx - 2.5, -58); ctx.lineTo(lx + 2.5, -58);
    ctx.moveTo(rx - 2.5, -58); ctx.lineTo(rx + 2.5, -58); ctx.stroke();
  }

  function drawHair(ctx, si, color) {
    ctx.fillStyle = color;
    if (si === 0) { // spiky
      ctx.beginPath();
      ctx.moveTo(-11, -54);
      ctx.lineTo(-9, -62); ctx.lineTo(-6, -58); ctx.lineTo(-3.5, -66);
      ctx.lineTo(0, -60); ctx.lineTo(3.5, -66); ctx.lineTo(6, -58);
      ctx.lineTo(9, -62); ctx.lineTo(11, -54);
      ctx.quadraticCurveTo(0, -62, -11, -54);
      ctx.fill();
    } else if (si === 1) { // short cap
      ctx.beginPath(); ctx.arc(0, -53.5, 11, Math.PI, 0); ctx.fill();
      ctx.fillRect(-11, -56, 22, 4);
    } else if (si === 2) { // curly / afro
      ctx.beginPath();
      ctx.arc(-7, -58, 5.5, 0, 7); ctx.arc(0, -61, 6.5, 0, 7);
      ctx.arc(7, -58, 5.5, 0, 7); ctx.arc(0, -53, 11.5, Math.PI, 0);
      ctx.fill();
    } else if (si === 3) { // long
      ctx.beginPath(); ctx.arc(0, -53.5, 11.5, Math.PI, 0); ctx.fill();
      rr(ctx, -13, -56, 5, 26, 2.5); ctx.fill();
      rr(ctx, 8, -56, 5, 26, 2.5); ctx.fill();
    } else if (si === 4) { // swept quiff
      ctx.beginPath(); ctx.arc(0, -53.5, 11, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, -63);
      ctx.quadraticCurveTo(10, -70, 13, -60);
      ctx.quadraticCurveTo(8, -64, 2, -60);
      ctx.fill();
    } else { // bun
      ctx.beginPath(); ctx.arc(0, -53.5, 11, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -66, 4.5, 0, 7); ctx.fill();
    }
  }

  function drawProp(ctx, prop) {
    if (prop === 'popcorn') {
      ctx.fillStyle = '#d92632'; rr(ctx, 9, -32, 10, 11, 1.5); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(11.5, -32, 1.6, 11); ctx.fillRect(15, -32, 1.6, 11);
      ctx.fillStyle = '#f7c948';
      ctx.beginPath();
      ctx.moveTo(9.5, -32); ctx.lineTo(11.5, -36); ctx.lineTo(13, -32);
      ctx.lineTo(14.5, -36.5); ctx.lineTo(16, -32); ctx.closePath(); ctx.fill();
    } else if (prop === 'drink') {
      ctx.fillStyle = '#e8e8ec';
      ctx.beginPath();
      ctx.moveTo(10, -22); ctx.lineTo(11.4, -32); ctx.lineTo(18, -32);
      ctx.lineTo(19.4, -22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8202f'; ctx.fillRect(10.4, -33.5, 8.6, 2.2);
      ctx.strokeStyle = '#c8202f'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(16.5, -33.5); ctx.lineTo(19, -38); ctx.stroke();
    }
  }

  /* x,y = feet position on screen */
  function drawAvatar(ctx, x, y, a, opts) {
    opts = opts || {};
    const s = opts.scale || 1;
    const ph = opts.phase || 0;
    const walking = !!opts.walking;
    const sitting = !!opts.sitting;
    const skin = SKINS[a.skin % SKINS.length];
    const hairC = HAIR_COLORS[a.hairColor % HAIR_COLORS.length];
    const topC = TOP_COLORS[a.topColor % TOP_COLORS.length];
    const pantC = PANTS_COLORS[a.pantsColor % PANTS_COLORS.length];
    const shoeC = SHOE_COLORS[a.shoesColor % SHOE_COLORS.length];

    ctx.save();
    ctx.translate(x, y);
    if (!sitting) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 5, 0, 0, 7); ctx.fill();
    }
    ctx.scale((opts.facing || 1) * s, s);
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const legY = sitting ? -12 : -20;
    if (!sitting) {
      const swing = walking ? Math.sin(ph) * 3 : 0;
      // legs
      ctx.fillStyle = pantC;
      rr(ctx, -9, legY + Math.max(0, swing), 8, -legY - Math.max(0, swing) - 4, 3); ctx.fill(); ctx.stroke();
      rr(ctx, 1, legY + Math.max(0, -swing), 8, -legY - Math.max(0, -swing) - 4, 3); ctx.fill(); ctx.stroke();
      // shoes
      ctx.fillStyle = shoeC;
      rr(ctx, -10, -5 + Math.max(0, swing), 10, 6, 2.5); ctx.fill(); ctx.stroke();
      rr(ctx, 0, -5 + Math.max(0, -swing), 10, 6, 2.5); ctx.fill(); ctx.stroke();
    } else {
      // knees pointing forward
      ctx.fillStyle = pantC;
      rr(ctx, -9, -12, 8, 9, 3); ctx.fill(); ctx.stroke();
      rr(ctx, 1, -12, 8, 9, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = shoeC;
      rr(ctx, -10, -5, 10, 6, 2.5); ctx.fill(); ctx.stroke();
      rr(ctx, 0, -5, 10, 6, 2.5); ctx.fill(); ctx.stroke();
    }

    const bodyY = sitting ? -22 : -40;
    // arms behind torso (draw first)
    const armSwing = walking ? Math.sin(ph) * 2 : 0;
    ctx.fillStyle = topC;
    rr(ctx, -17, bodyY + 3 + armSwing, 6, 15, 3); ctx.fill(); ctx.stroke();
    rr(ctx, 11, bodyY + 3 - armSwing, 6, 15, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-14, bodyY + 19 + armSwing, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(14, bodyY + 19 - armSwing, 3, 0, 7); ctx.fill();

    // torso
    ctx.fillStyle = topC;
    rr(ctx, -12, bodyY, 24, 22, 7); ctx.fill(); ctx.stroke();
    if (a.top % 2 === 0) { // hoodie details
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, bodyY - 2, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, bodyY + 4); ctx.lineTo(-3, bodyY + 11);
      ctx.moveTo(3, bodyY + 4); ctx.lineTo(3, bodyY + 11); ctx.stroke();
      ctx.fillStyle = '#e6eaf1';
      ctx.fillRect(-4, bodyY + 11, 2.6, 4); ctx.fillRect(1.6, bodyY + 11, 2.6, 4);
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(-9, bodyY + 12); ctx.lineTo(-4, bodyY + 19); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(9, bodyY + 12); ctx.lineTo(4, bodyY + 19); ctx.stroke();
    } else { // tee collar
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-5, bodyY); ctx.lineTo(0, bodyY + 5); ctx.lineTo(5, bodyY); ctx.stroke();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = OUT;

    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -53, 11, 0, 7); ctx.fill(); ctx.stroke();
    drawHair(ctx, a.hair % HAIR_STYLES.length, hairC);
    drawFace(ctx, a.face % FACES.length);
    if (opts.prop) drawProp(ctx, opts.prop);

    ctx.restore();
  }

  /* small icon for the player list */
  function drawIcon(canvas, a) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(canvas.width / 44, canvas.height / 44);
    ctx.translate(22, 36);
    drawAvatar(ctx, 0, 0, a, { scale: 0.62 });
    ctx.restore();
  }

  function drawNameTag(ctx, x, y, name, isMe, isHost) {
    ctx.save();
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    const w = ctx.measureText(name).width + 16;
    ctx.fillStyle = isMe ? 'rgba(200,32,47,0.92)' : 'rgba(20,20,26,0.82)';
    rr(ctx, x - w / 2, y - 14, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = isHost ? '#ffd35c' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    rr(ctx, x - w / 2, y - 14, w, 18, 9); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y - 5);
    ctx.restore();
  }

  function drawBubble(ctx, x, y, text) {
    ctx.save();
    ctx.font = '500 13px -apple-system, system-ui, sans-serif';
    const w = Math.min(180, ctx.measureText(text).width + 18);
    const h = 24;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    rr(ctx, x - w / 2, y - h, w, h, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#17181c';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - h / 2 + 1, w - 12);
    ctx.restore();
  }

  window.AV = {
    SKINS, HAIR_STYLES, HAIR_COLORS, TOP_STYLES, TOP_COLORS,
    PANTS_COLORS, SHOE_COLORS, FACES,
    drawAvatar, drawIcon, drawNameTag, drawBubble,
    randomAvatar() {
      const r = (n) => Math.floor(Math.random() * n);
      return {
        skin: r(SKINS.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length),
        top: r(TOP_STYLES.length), topColor: r(TOP_COLORS.length),
        pantsColor: r(PANTS_COLORS.length), shoesColor: r(SHOE_COLORS.length), face: r(FACES.length),
      };
    },
  };
})();
