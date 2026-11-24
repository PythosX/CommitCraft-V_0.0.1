import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/index.js';
import { beginLogin, verifyState, createSession, readSessionToken } from '../src/services/oauth-service.js';
import { encrypt, decrypt } from '../src/utils/crypto.js';
import { MemoryKV } from './helpers.js';
import { _reset } from '../src/middleware/rate-limit.js';

const env = () => ({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec', GITHUB_CALLBACK_URL: 'https://app.test/api/auth/github/callback', FRONTEND_URL: 'https://app.test', SESSION_SECRET: 's'.repeat(32), ENCRYPTION_KEY: 'k'.repeat(32), CC_KV: new MemoryKV() });
const req = (path, init = {}) => new Request('https://api.test' + path, init);
const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const fakeUser = () => ({ getUser: async () => ({ id: 42, login: 'octo', name: 'Octo', avatar_url: 'a', html_url: 'h' }) });

test('crypto round trip and tamper detection', async () => {
  const c = await encrypt('k', 'gho_token');
  assert.equal(await decrypt('k', c), 'gho_token');
  await assert.rejects(decrypt('wrong', c));
});

test('login redirects to GitHub with state and sets signed, HttpOnly state cookie', async () => {
  const e = env(); const res = await handle(req('/api/auth/github'), e, {});
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(loc.searchParams.get('scope'), 'repo read:user');
  assert.ok(loc.searchParams.get('state'));
  const sc = res.headers.get('Set-Cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/);
});

test('callback rejects missing/forged state (CSRF) and user denial', async () => {
  const e = env();
  const bad = await handle(req('/api/auth/github/callback?code=abc&state=forged'), e, {});
  assert.match(bad.headers.get('Location'), /auth_error=invalid_state/);
  const login = await handle(req('/api/auth/github'), e, {});
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const mismatch = await handle(req('/api/auth/github/callback?code=abc&state=other', { headers: { Cookie: cookieOf(login) } }), e, {});
  assert.match(mismatch.headers.get('Location'), /invalid_state/);
  const denied = await handle(req('/api/auth/github/callback?error=access_denied'), e, {});
  assert.match(denied.headers.get('Location'), /access_denied/);
  assert.ok(state);
});

test('successful login creates an encrypted server-side session; token never appears in cookie or API output', async () => {
  const e = env(); const cfg = { ...(await import('../src/config/env.js')).getConfig(e) };
  const login = await handle(req('/api/auth/github'), e, {});
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const fetchImpl = async () => new Response(JSON.stringify({ access_token: 'gho_SECRET' }));
  const cb = await handle(req(`/api/auth/github/callback?code=c&state=${state}`, { headers: { Cookie: cookieOf(login) } }), e, {}, { fetchImpl, clientFactory: fakeUser });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('Location'), 'https://app.test/dashboard.html');
  const cookies = cb.headers.getSetCookie();
  const sess = cookies.find((c) => c.startsWith('__Host-cc_session'));
  assert.ok(sess && /HttpOnly/.test(sess) && /Secure/.test(sess) && !sess.includes('gho_SECRET'));
  const stored = [...e.CC_KV.m.entries()].find(([k]) => k.startsWith('sess:'));
  assert.ok(!stored[1].includes('gho_SECRET')); // encrypted at rest
  assert.equal(await readSessionToken(cfg, JSON.parse(stored[1])), 'gho_SECRET');
  const cookie = sess.split(';')[0];
  const s = await handle(req('/api/auth/session', { headers: { Cookie: cookie } }), e, {});
  const body = await s.json(); assert.equal(body.authenticated, true); assert.equal(body.user.login, 'octo');
  assert.ok(!JSON.stringify(body).includes('gho_'));
  // logout kills the session
  const out = await handle(req('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'CommitCraft', Origin: 'https://app.test' } }), e, {});
  assert.equal(out.status, 200);
  const after = await handle(req('/api/auth/session', { headers: { Cookie: cookie } }), e, {});
  assert.equal((await after.json()).authenticated, false);
});

test('protected routes require auth and CSRF header on mutations', async () => {
  _reset(); const e = env();
  assert.equal((await handle(req('/api/github/repos'), e, {})).status, 401);
  assert.equal((await handle(req('/api/publish/jobs', { method: 'POST', body: '{}' }), e, {})).status, 403);
  assert.equal((await handle(req('/api/publish/jobs', { method: 'POST', body: '{}', headers: { 'X-Requested-With': 'CommitCraft', Origin: 'https://evil.test' } }), e, {})).status, 403);
  assert.equal((await handle(req('/api/nope'), e, {})).status, 404);
});

test('forged session cookie is rejected', async () => {
  const e = env();
  const res = await handle(req('/api/github/repos', { headers: { Cookie: '__Host-cc_session=abc.def' } }), e, {});
  assert.equal(res.status, 401);
});

test('misconfiguration is reported without leaking values', async () => {
  const res = await handle(req('/api/auth/session'), { CC_KV: new MemoryKV() }, {});
  const b = await res.json(); assert.equal(res.status, 500); assert.ok(b.error.details.includes('GITHUB_CLIENT_SECRET'));
});
