import { randomId, sign, verifySignature, encrypt, decrypt, serializeCookie } from '../utils/crypto.js';
import { LIMITS } from '../config/env.js';
import { GitHubClient } from './github-api.js';
import { putSession } from '../storage/session-store.js';

export const SCOPES = 'repo read:user'; // `repo` is required to write to private repositories
export const sessionCookieName = (cfg) => (cfg.secureCookies ? '__Host-cc_session' : 'cc_session');
const STATE_COOKIE = 'cc_oauth';

export async function beginLogin(cfg) {
  const nonce = randomId(18);
  const exp = Date.now() + 10 * 60_000;
  const payload = `${nonce}.${exp}`;
  const cookie = serializeCookie(STATE_COOKIE, `${payload}.${await sign(cfg.sessionSecret, 'state:' + payload)}`, {
    maxAge: 600, path: '/api/auth', secure: cfg.secureCookies,
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.callbackUrl);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', nonce);
  return { url: url.toString(), cookie };
}

// Double-submit check: the signed cookie must match the `state` GitHub sends back.
export async function verifyState(cfg, cookieValue, state) {
  if (!cookieValue || !state) return false;
  const [nonce, exp, sig] = cookieValue.split('.');
  if (!nonce || !exp || !sig || Number(exp) < Date.now()) return false;
  if (!(await verifySignature(cfg.sessionSecret, `state:${nonce}.${exp}`, sig))) return false;
  return nonce === state;
}

export async function exchangeCode(cfg, code, fetchImpl = (...a) => fetch(...a)) {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'CommitCraft' },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: cfg.callbackUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new Error(data.error || 'token_exchange_failed');
  return data.access_token;
}

export async function createSession(cfg, token, clientFactory = (t) => new GitHubClient(t)) {
  const u = await clientFactory(token).getUser();
  const id = randomId(32);
  const session = {
    id, userId: String(u.id), login: u.login, name: u.name || u.login, avatar: u.avatar_url, profileUrl: u.html_url,
    token: await encrypt(cfg.encryptionKey, token),
    createdAt: Date.now(), expiresAt: Date.now() + LIMITS.sessionTtlSeconds * 1000,
  };
  await putSession(cfg.kv, session);
  const value = `${id}.${await sign(cfg.sessionSecret, 'session:' + id)}`;
  const cookie = serializeCookie(sessionCookieName(cfg), value, { maxAge: LIMITS.sessionTtlSeconds, secure: cfg.secureCookies });
  return { session, cookie };
}

export async function readSessionToken(cfg, session) {
  return decrypt(cfg.encryptionKey, session.token);
}
export async function verifySessionCookie(cfg, value) {
  if (!value) return null;
  const [id, sig] = value.split('.');
  if (!id || !sig) return null;
  return (await verifySignature(cfg.sessionSecret, 'session:' + id, sig)) ? id : null;
}
export const clearCookie = (cfg, name, path = '/') => serializeCookie(name, '', { maxAge: 0, path, secure: cfg.secureCookies });
export const STATE_COOKIE_NAME = STATE_COOKIE;
