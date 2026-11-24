import { LIMITS } from '../config/env.js';

export async function getSession(kv, id) {
  const s = await kv.get(`sess:${id}`, 'json');
  if (!s) return null;
  if (s.expiresAt < Date.now()) { await kv.delete(`sess:${id}`); return null; }
  return s;
}
export async function putSession(kv, session) {
  await kv.put(`sess:${session.id}`, JSON.stringify(session), { expirationTtl: LIMITS.sessionTtlSeconds });
}
export const deleteSession = (kv, id) => kv.delete(`sess:${id}`);
