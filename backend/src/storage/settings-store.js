import { DEFAULT_SETTINGS } from '../utils/validation.js';
export const settingsStore = (kv) => ({
  async get(userId) { return { ...DEFAULT_SETTINGS, ...((await kv.get(`settings:${userId}`, 'json')) ?? {}) }; },
  async put(userId, settings) { await kv.put(`settings:${userId}`, JSON.stringify(settings)); },
  delete: (userId) => kv.delete(`settings:${userId}`),
});
