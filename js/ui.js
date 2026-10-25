/* ui.js — screens, forms, chat, player list, movie menu, moderation UI */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SCREENS = ['screen-welcome', 'screen-register', 'screen-login', 'screen-recover', 'screen-avatar'];

  const UI = {
    show(name) {
      for (const id of SCREENS) $(id).classList.toggle('hidden', id !== 'screen-' + name);
    },
    hud(visible) {
      $('hud-top').classList.toggle('hidden', !visible);
      $('zoom-controls').classList.toggle('hidden', !visible);
      $('hud-actions').classList.toggle('hidden', !visible);
      for (const id of ['panel-chat', 'panel-players', 'panel-movies', 'panel-emotes', 'panel-snack', 'panel-mod'])
        if (visible === false) $(id).classList.add('hidden');
    },
    banner(id, show) { $(id).classList.toggle('hidden', !show); },
    announce(text) {
      const el = $('movie-announce');
      if (!text) { el.classList.add('hidden'); return; }
      el.textContent = text;
      el.classList.remove('hidden');
    },
    msg(id, text, isErr) {
      const el = $(id);
      el.textContent = text || '';
      el.classList.toggle('error', !!isErr);
    },
    toast(text, ms) {
      const el = document.createElement('div');
      el.className = 'banner';
      el.textContent = text;
      el.style.top = '96px';
      document.getElementById('app').appendChild(el);
      setTimeout(() => el.remove(), ms || 3200);
    },

    /* ---- chat ---- */
    chatAdd(m, myId) {
      const log = $('chat-log');
      const div = document.createElement('div');
      if (m.system) {
        div.className = 'chat-msg system';
        div.textContent = m.text;
      } else {
        div.className = 'chat-msg' + (m.id === myId ? ' mine' : '');
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = (m.name || '?') + ':';
        div.appendChild(who);
        div.appendChild(document.createTextNode(m.text));
      }
      log.appendChild(div);
      while (log.children.length > 60) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    },
    chatClear() { $('chat-log').innerHTML = ''; },
    chatInput() { return $('chat-input').value; },
    chatClearInput() { $('chat-input').value = ''; },

    /* ---- players ---- */
    playersRender(players, meId, hostId, onPick) {
      const list = $('player-list');
      list.innerHTML = '';
      for (const p of players) {
        const row = document.createElement('div');
        row.className = 'player-row';
        const c = document.createElement('canvas');
        c.width = 80; c.height = 80;
        window.AV.drawIcon(c, p.avatar || window.AV.randomAvatar());
        row.appendChild(c);
        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = '<div class="pn">' + esc(p.name) + (p.id === meId ? ' <span class="ps">(you)</span>' : '')
          + (p.id === hostId ? ' 👑' : '') + '</div>'
          + '<div class="ps">' + (p.seat ? 'Seated' : 'Standing') + '</div>';
        row.appendChild(info);
        if (p.id !== meId) {
          row.addEventListener('click', () => onPick(p));
        }
        list.appendChild(row);
      }
    },

    /* ---- movies ---- */
    moviesRender(movies, playback, isHost, cb) {
      $('host-panel').classList.toggle('hidden', !isHost);
      const list = $('movie-list');
      list.innerHTML = '';
      for (const m of movies) {
        const card = document.createElement('div');
        card.className = 'movie-card';
        const now = playback && playback.movieId === m.id;
        card.innerHTML = '<div class="mt">' + esc(m.title) + '</div>'
          + (now ? '<div class="now">' + (playback.playing ? '▶ NOW PLAYING' : '⏸ SELECTED') + '</div>' : '')
          + '<div class="mn">' + esc(m.note || '') + '</div>';
        if (isHost && (m.type === 'file')) {
          const play = document.createElement('button');
          play.className = 'btn small primary';
          play.textContent = '▶ Play for everyone';
          play.addEventListener('click', () => cb.onPlay(m));
          card.appendChild(play);
          const sel = document.createElement('button');
          sel.className = 'btn small';
          sel.textContent = '＋ Queue';
          sel.addEventListener('click', () => cb.onSelect(m));
          card.appendChild(sel);
        }
        if (m.type === 'external' || m.type === 'embed') {
          const open = document.createElement('button');
          open.className = 'btn small';
          open.textContent = '🔗 Open Streaming Service ↗';
          open.addEventListener('click', () => window.open(m.url, '_blank', 'noopener'));
          card.appendChild(open);
        }
        if (m.type === 'folder') {
          const hint = document.createElement('button');
          hint.className = 'btn small';
          hint.textContent = 'Browse folder';
          hint.addEventListener('click', () => cb.onFolder(m));
          card.appendChild(hint);
        }
        list.appendChild(card);
      }
    },

    /* ---- avatar creator ---- */
    AV_DEFS: [
      { key: 'skin', label: 'Skin', count: window.AV ? window.AV.SKINS.length : 6, arrows: ['←', '→'] },
      { key: 'hair', label: 'Hairstyle', count: window.AV ? window.AV.HAIR_STYLES.length : 6, show: (i) => window.AV.HAIR_STYLES[i] },
      { key: 'hairColor', label: 'Hair color', count: window.AV ? window.AV.HAIR_COLORS.length : 7, swatch: (i) => window.AV.HAIR_COLORS[i] },
      { key: 'top', label: 'Top', count: window.AV ? window.AV.TOP_STYLES.length : 2, show: (i) => window.AV.TOP_STYLES[i] },
      { key: 'topColor', label: 'Top color', count: window.AV ? window.AV.TOP_COLORS.length : 8, swatch: (i) => window.AV.TOP_COLORS[i] },
      { key: 'pantsColor', label: 'Pants', count: window.AV ? window.AV.PANTS_COLORS.length : 6, swatch: (i) => window.AV.PANTS_COLORS[i] },
      { key: 'shoesColor', label: 'Shoes', count: window.AV ? window.AV.SHOE_COLORS.length : 4, swatch: (i) => window.AV.SHOE_COLORS[i] },
      { key: 'face', label: 'Expression', count: window.AV ? window.AV.FACES.length : 5, show: (i) => window.AV.FACES[i] },
    ],

    buildAvatarOptions(avatar, onChange) {
      const box = $('av-options');
      box.innerHTML = '';
      for (const def of this.AV_DEFS) {
        const row = document.createElement('div');
        row.className = 'opt-row';
        const prev = document.createElement('button');
        prev.className = 'opt-btn'; prev.textContent = '‹';
        const label = document.createElement('span');
        const next = document.createElement('button');
        next.className = 'opt-btn'; next.textContent = '›';
        const render = () => {
          if (def.swatch) {
            label.innerHTML = def.label + ' <span style="display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;background:' + def.swatch(avatar[def.key]) + ';border:1px solid #000"></span>';
          } else if (def.show) {
            label.textContent = def.label + ': ' + def.show(avatar[def.key]);
          } else {
            label.textContent = def.label;
          }
        };
        prev.addEventListener('click', () => { avatar[def.key] = (avatar[def.key] + def.count - 1) % def.count; render(); onChange(); });
        next.addEventListener('click', () => { avatar[def.key] = (avatar[def.key] + 1) % def.count; render(); onChange(); });
        row.appendChild(prev); row.appendChild(label); row.appendChild(next);
        box.appendChild(row);
        render();
      }
    },

    renderAvatarPreview(avatar) {
      const canvas = $('av-preview');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // little red-carpet vignette behind the avatar
      ctx.fillStyle = '#8f1420';
      ctx.beginPath(); ctx.ellipse(150, 232, 92, 26, 0, 0, 7); ctx.fill();
      window.AV.drawAvatar(ctx, 150, 228, avatar, { scale: 2.4 });
    },

    setUsername(name) { $('av-name').textContent = name; },
    online(n) { $('online-count').textContent = n + ' online'; },
    hostPanel(isHost) { $('host-panel').classList.toggle('hidden', !isHost); },
    modShow(name, isHost, isMuted) {
      $('mod-name').textContent = name;
      for (const el of document.querySelectorAll('.host-only')) el.classList.add('hidden');
      if (isHost) {
        $('mod-mute').classList.toggle('hidden', isMuted === true);
        $('mod-unmute').classList.toggle('hidden', isMuted !== true);
        $('mod-transfer').classList.remove('hidden');
      }
      $('panel-mod').classList.remove('hidden');
    },
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.UI = UI;
})();
