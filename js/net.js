/* net.js — WebSocket client with token auth, heartbeats and reconnect */
(function () {
  'use strict';

  class Net {
    constructor(handlers) {
      this.h = handlers; // {onOpen, onMessage, onClose}
      this.ws = null;
      this.connected = false;
      this.token = null;
      this.backoff = 1000;
      this.closedByUser = false;
    }

    connect(token) {
      this.token = token;
      this.closedByUser = false;
      this.open();
    }

    open() {
      if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(this.token)}`);
      this.ws.onopen = () => { this.connected = true; this.backoff = 1000; if (this.h.onOpen) this.h.onOpen(); };
      this.ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (this.h.onMessage) this.h.onMessage(m);
        } catch (err) { /* ignore malformed frames */ }
      };
      this.ws.onclose = () => {
        this.connected = false;
        if (this.h.onClose) this.h.onClose();
        if (!this.closedByUser) this.scheduleReconnect();
      };
      this.ws.onerror = () => { /* close handler drives reconnect */ };
    }

    scheduleReconnect() {
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 10000);
    }

    close() {
      this.closedByUser = true;
      if (this.ws) this.ws.close();
    }

    send(type, data) {
      if (this.connected) this.ws.send(JSON.stringify(Object.assign({ type }, data || {})));
    }

    move(x, y, facing) { this.send('move', { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, facing }); }
    sit(seatId) { this.send('sit', { seatId }); }
    stand() { this.send('stand'); }
    chat(text) { this.send('chat', { text }); }
    emote(emote) { this.send('emote', { emote }); }
    prop(prop) { this.send('prop', { prop }); }
    report(target, reason) { this.send('report', { target, reason }); }
    host(action, data) { this.send('host', Object.assign({ action }, data || {})); }
  }

  window.Net = Net;
})();
