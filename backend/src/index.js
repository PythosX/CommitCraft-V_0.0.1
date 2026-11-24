import { getConfig, ConfigError } from './config/env.js';
import { json, HttpError, notFound } from './utils/response.js';
import { corsHeaders } from './middleware/cors-middleware.js';
import { requireAuth, checkCsrf } from './middleware/auth-middleware.js';
import { rateLimit } from './middleware/rate-limit.js';
import { handleError } from './middleware/error-middleware.js';
import authRoutes from './routes/auth-routes.js';
import githubRoutes from './routes/github-routes.js';
import repositoryRoutes from './routes/repository-routes.js';
import publishingRoutes from './routes/publishing-routes.js';
import historyRoutes from './routes/history-routes.js';
import settingsRoutes from './routes/settings-routes.js';

const ROUTES = [...authRoutes, ...githubRoutes, ...repositoryRoutes, ...publishingRoutes, ...historyRoutes, ...settingsRoutes]
  .map((r) => ({ ...r, parts: r.path.split('/') }));

function match(method, pathname) {
  const parts = pathname.replace(/\/+$/, '').split('/');
  for (const r of ROUTES) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params = {};
    if (r.parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = decodeURIComponent(parts[i])), true) : p === parts[i]))) return { route: r, params };
  }
  return null;
}

export async function handle(request, env, ctx, overrides = {}) {
  let cfg;
  try { cfg = getConfig(env); } catch (e) {
    if (e instanceof ConfigError) return json({ error: { code: 'misconfigured', message: 'The API is missing configuration.', details: e.missing } }, 500);
    throw e;
  }
  const cors = corsHeaders(request, cfg);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const url = new URL(request.url);
    const m = match(request.method, url.pathname);
    if (!m) throw notFound('Unknown endpoint.');
    const rc = { request, url, query: url.searchParams, cfg, ctx, params: m.params, ...overrides };
    checkCsrf(request, cfg);
    if (m.route.auth !== false) { await requireAuth(rc); rateLimit('u:' + rc.user.id, 300); }
    const res = await m.route.handler(rc);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  } catch (e) {
    return handleError(e, cors);
  }
}

export default { fetch: (request, env, ctx) => handle(request, env, ctx) };
