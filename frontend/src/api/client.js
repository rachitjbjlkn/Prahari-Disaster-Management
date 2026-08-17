const BASE = import.meta.env.VITE_API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

let token = localStorage.getItem('prahari_token') || '';

export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('prahari_token', t);
  else localStorage.removeItem('prahari_token');
}

export function getToken() {
  return token;
}

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 401) setToken('');
  if (!res.ok) {
    let detail = `${path} → HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  // hazard prediction
  wards: () => req('/api/wards'),
  refreshWard: (id) => req(`/api/wards/${id}/refresh`, { method: 'POST' }),

  // citizen reporting
  reports: () => req('/api/reports'),
  submitReport: (payload) => req('/api/reports', { method: 'POST', body: JSON.stringify(payload) }),
  reportStatus: (id, status) => req(`/api/reports/${id}/status?status=${status}`, { method: 'PATCH' }),
  uploadImage: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + '/api/reports/upload', { method: 'POST', body: fd, headers });
    if (!res.ok) {
      let detail = `upload → HTTP ${res.status}`;
      try { const b = await res.json(); if (b.detail) detail = b.detail; } catch { /* keep default */ }
      throw new Error(detail);
    }
    return res.json();
  },

  // resource coordination
  resources: () => req('/api/resources'),
  suggestedAllocations: () => req('/api/resources/allocations/suggested'),
  dispatch: (resourceId, wardId, note = '') => req(`/api/resources/${resourceId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ ward_id: wardId, note }),
  }),

  // dashboard
  dashboardSummary: () => req('/api/dashboard/summary'),

  // auth
  login: (username, password) => req('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => req('/api/auth/me'),

  // offline-first comms
  smsAlerts: () => req('/api/sms/alerts'),
  smsStatus: () => req('/api/sms/status'),
  telegramLatest: () => req('/api/sms/telegram/latest'),
  smsSend: (payload) => req('/api/sms/send', { method: 'POST', body: JSON.stringify(payload) }),
  smsWebhook: (payload) => req('/api/sms/webhook', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  }),
};

export function connectSocket(onMessage) {
  const wsBase = BASE.replace('http', 'ws');
  let ws;
  try {
    ws = new WebSocket(wsBase + '/ws');
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
  } catch {
    return null;
  }
  return ws;
}

export { BASE as API_BASE };
