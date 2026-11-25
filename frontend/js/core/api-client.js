import { CONFIG } from '../config/app-config.js';
import { bus } from './event-bus.js';

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

const headers = (extra = {}) => ({ 'X-Requested-With': 'CommitCraft', ...extra });

async function parse(res) {
  if (res.ok) return res.status === 204 ? null : res.json();
  let body = null;
  try { body = await res.json(); } catch { /* not json */ }
  const e = body?.error ?? {};
  const err = new ApiError(res.status, e.code ?? 'http_' + res.status, e.message ?? `Request failed (${res.status}).`, e.details);
  if (res.status === 401) bus.emit('auth:expired', err);
  throw err;
}

export async function api(method, path, body, { signal } = {}) {
  let res;
  try {
    res = await fetch(CONFIG.API_BASE + path, {
      method, credentials: 'include', signal,
      headers: headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Cannot reach CommitCraft. Check your connection.');
  }
  return parse(res);
}
api.get = (p, o) => api('GET', p, undefined, o);
api.post = (p, b = {}, o) => api('POST', p, b, o);
api.put = (p, b, o) => api('PUT', p, b, o);
api.del = (p, o) => api('DELETE', p, undefined, o);

// POST that streams newline-delimited JSON events as the server produces them.
export async function apiStream(path, body, onEvent, { signal } = {}) {
  let res;
  try {
    res = await fetch(CONFIG.API_BASE + path, {
      method: 'POST', credentials: 'include', signal,
      headers: headers({ 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }),
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Lost connection while publishing.');
  }
  if (!res.ok) return parse(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Lost connection while publishing.');
  }
}
