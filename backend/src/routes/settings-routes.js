import { json } from '../utils/response.js';
import { readJson } from '../utils/body.js';
import { validateSettings } from '../utils/validation.js';
import { settingsStore } from '../storage/settings-store.js';

export default [
  { method: 'GET', path: '/api/settings', async handler(rc) { return json({ settings: await settingsStore(rc.cfg.kv).get(rc.user.id) }); } },
  { method: 'PUT', path: '/api/settings', async handler(rc) {
    const store = settingsStore(rc.cfg.kv);
    const next = { ...(await store.get(rc.user.id)), ...validateSettings(await readJson(rc.request, rc.cfg.limits.maxJsonBytes)) };
    await store.put(rc.user.id, next);
    return json({ settings: next });
  } },
];
