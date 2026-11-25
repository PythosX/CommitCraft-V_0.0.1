import { api } from './api-client.js';
import { CONFIG } from '../config/app-config.js';

let cached = null;
export async function getSession(force = false) {
  if (cached && !force) return cached;
  try { cached = await api.get('/api/auth/session'); } catch { cached = { authenticated: false }; }
  return cached;
}
export const login = () => { location.href = CONFIG.API_BASE + '/api/auth/github'; };
export async function logout() {
  try { await api.post('/api/auth/logout'); } finally { cached = null; location.href = '/'; }
}
export async function disconnect() {
  const r = await api.post('/api/auth/disconnect');
  cached = null;
  return r;
}
