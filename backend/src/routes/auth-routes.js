import { json, redirect } from '../utils/response.js';
import { parseCookies } from '../utils/crypto.js';
import { beginLogin, verifyState, exchangeCode, createSession, clearCookie, sessionCookieName, STATE_COOKIE_NAME } from '../services/oauth-service.js';
import { deleteSession } from '../storage/session-store.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

const fail = (cfg, code, cookies = []) => redirect(`${cfg.frontendUrl}/?auth_error=${code}`, { 'Set-Cookie': cookies });

export default [
  { method: 'GET', path: '/api/auth/github', auth: false, async handler(rc) {
    rateLimit('login:' + (rc.request.headers.get('CF-Connecting-IP') || 'anon'), 20);
    const { url, cookie } = await beginLogin(rc.cfg);
    return redirect(url, { 'Set-Cookie': cookie });
  } },

  { method: 'GET', path: '/api/auth/github/callback', auth: false, async handler(rc) {
    const { cfg, query } = rc;
    rateLimit('cb:' + (rc.request.headers.get('CF-Connecting-IP') || 'anon'), 20);
    const clear = clearCookie(cfg, STATE_COOKIE_NAME, '/api/auth');
    if (query.get('error')) return fail(cfg, query.get('error') === 'access_denied' ? 'access_denied' : 'github_error', [clear]);
    const cookies = parseCookies(rc.request.headers.get('Cookie') || '');
    if (!(await verifyState(cfg, cookies[STATE_COOKIE_NAME], query.get('state')))) return fail(cfg, 'invalid_state', [clear]);
    const code = query.get('code');
    if (!code) return fail(cfg, 'missing_code', [clear]);
    try {
      const token = await exchangeCode(cfg, code, rc.fetchImpl);
      const { cookie } = await createSession(cfg, token, rc.clientFactory);
      return redirect(`${cfg.frontendUrl}/dashboard.html`, { 'Set-Cookie': [clear, cookie] });
    } catch (e) {
      logger.warn('oauth exchange failed', { reason: e.message });
      return fail(cfg, 'exchange_failed', [clear]);
    }
  } },

  { method: 'GET', path: '/api/auth/session', auth: false, async handler(rc) {
    try {
      const { requireAuth } = await import('../middleware/auth-middleware.js');
      await requireAuth(rc);
    } catch { return json({ authenticated: false }); }
    const s = rc.session;
    return json({ authenticated: true, user: { id: s.userId, login: s.login, name: s.name, avatar: s.avatar, profileUrl: s.profileUrl },
      session: { createdAt: s.createdAt, expiresAt: s.expiresAt } });
  } },

  { method: 'POST', path: '/api/auth/logout', async handler(rc) {
    await deleteSession(rc.cfg.kv, rc.session.id);
    return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(rc.cfg, sessionCookieName(rc.cfg)) });
  } },

  // Revokes CommitCraft's access on GitHub, then ends the session.
  { method: 'POST', path: '/api/auth/disconnect', async handler(rc) {
    const { readSessionToken } = await import('../services/oauth-service.js');
    const token = await readSessionToken(rc.cfg, rc.session);
    let revoked = false;
    try { revoked = (await rc.client.revokeGrant(rc.cfg.clientId, rc.cfg.clientSecret, token)).status === 204; } catch { /* still end session */ }
    await deleteSession(rc.cfg.kv, rc.session.id);
    return json({ ok: true, revoked }, 200, { 'Set-Cookie': clearCookie(rc.cfg, sessionCookieName(rc.cfg)) });
  } },
];
