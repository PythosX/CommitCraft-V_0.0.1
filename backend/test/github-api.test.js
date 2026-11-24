import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, GitHubError } from '../src/services/github-api.js';

const mk = (responses) => {
  let i = 0; const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); const r = responses[Math.min(i++, responses.length - 1)]; if (r instanceof Error) throw r; return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers }); };
  return { client: new GitHubClient('secret-token', { fetch, sleep: async () => {} }), calls };
};

test('sends auth header and parses JSON', async () => {
  const { client, calls } = mk([{ status: 200, body: { login: 'me' } }]);
  assert.equal((await client.getUser()).login, 'me');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
});
test('maps 401/404/422 to GitHubError with status', async () => {
  for (const s of [401, 404, 422]) {
    const { client } = mk([{ status: s, body: { message: 'nope' } }]);
    await assert.rejects(client.getUser(), (e) => e instanceof GitHubError && e.status === s);
  }
});
test('retries short rate limits then succeeds', async () => {
  const { client, calls } = mk([{ status: 429, headers: { 'retry-after': '1' } }, { status: 200, body: { ok: 1 } }]);
  assert.deepEqual(await client.getUser(), { ok: 1 });
  assert.equal(calls.length, 2);
});
test('surfaces long rate limits instead of waiting', async () => {
  const { client } = mk([{ status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '120' } }]);
  await assert.rejects(client.getUser(), (e) => e.code === 'rate_limited' && e.retryAfter === 120);
});
test('retries 5xx and network errors, then gives up', async () => {
  const a = mk([{ status: 502 }, { status: 200, body: { ok: 1 } }]);
  assert.deepEqual(await a.client.getUser(), { ok: 1 });
  const b = mk([new Error('down')]);
  await assert.rejects(b.client.getUser(), (e) => e.status === 0 && e.code === 'network');
});
test('never sends force on ref updates', async () => {
  const { client, calls } = mk([{ status: 200 }]);
  await client.updateRef('o', 'r', 'feature/x', 'abc');
  assert.equal(JSON.parse(calls[0].init.body).force, false);
  assert.match(calls[0].url, /heads\/feature\/x$/);
});
