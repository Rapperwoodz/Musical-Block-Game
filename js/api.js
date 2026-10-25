/* api.js — REST client for the auth + profile API */
(function () {
  'use strict';
  const TOKEN_KEY = 'vmt_token';

  const API = {
    get token() { return localStorage.getItem(TOKEN_KEY); },
    set token(v) { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); },

    async req(method, path, body) {
      const res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      return data;
    },

    register: (username, email, password) => API.req('POST', '/api/register', { username, email, password }),
    login: (identifier, password) => API.req('POST', '/api/login', { identifier, password }),
    logout: () => API.req('POST', '/api/logout', {}),
    me: () => API.req('GET', '/api/me'),
    saveAvatar: (avatar) => API.req('PUT', '/api/avatar', { avatar }),
    recover: (email) => API.req('POST', '/api/recover', { email }),
    reset: (token, password) => API.req('POST', '/api/reset', { token, password }),
    movies: () => API.req('GET', '/api/movies'),
  };

  window.API = API;
})();
