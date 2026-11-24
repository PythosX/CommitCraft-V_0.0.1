import { parseCookies } from '../utils/crypto.js';
import { unauthorized, forbidden } from '../utils/response.js';
import { getSession } from '../storage/session-store.js';
import { sessionCookieName, verifySessionCookie, readSessionToken } from '../services/oauth-service.js';
import { GitHubClient } from '../services/github-api.js';

export async function requireAuth(rc) {
  const cookies = parseCookies(rc.request.headers.get('Cookie') || '');
  const id = await verifySessionCookie(rc.cfg, cookies[sessionCookieName(rc.cfg)]);
  if (!id) throw unauthorized();
  const session = await getSession(rc.cfg.kv, id);
  if (!session) throw unauthorized('Your session expired. Sign in again.');
  rc.session = session;
  rc.user = { id: session.userId, login: session.login };
  rc.client = (rc.clientFactory || ((t) => new GitHubClient(t)))(await readSessionToken(rc.cfg, session));
}

// State-changing requests must come from our frontend: custom header + Origin check (on top of SameSite=Lax cookies).
export function checkCsrf(request, cfg) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (request.headers.get('X-Requested-With') !== 'CommitCraft') throw forbidden('Missing CSRF header.');
  const origin = request.headers.get('Origin');
  if (origin && origin !== cfg.frontendOrigin) throw forbidden('Cross-origin request blocked.');
}
