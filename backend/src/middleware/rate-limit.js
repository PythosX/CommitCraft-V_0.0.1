import { HttpError } from '../utils/response.js';
// Best-effort, per-isolate token window. Cloudflare may run several isolates, so this is a speed bump,
// not a guarantee: add a Cloudflare Rate Limiting rule for hard limits (see docs/security.md).
const hits = new Map();
export function rateLimit(key, limit, windowMs = 60_000, now = Date.now()) {
  const e = hits.get(key);
  if (!e || e.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); if (hits.size > 5000) prune(now); return; }
  if (++e.count > limit) throw new HttpError(429, 'rate_limited', 'Too many requests. Slow down for a moment.', { retryAfter: Math.ceil((e.reset - now) / 1000) });
}
function prune(now) { for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }
export const _reset = () => hits.clear();
