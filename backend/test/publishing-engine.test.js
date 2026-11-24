import test from 'node:test';
import assert from 'node:assert/strict';
import { createJob, advanceJob, cancelJob, prepareRetry, uploadBlobs } from '../src/services/publishing-engine.js';
import { validateJobInput } from '../src/utils/validation.js';
import { setup, items, uploadAll, b64 } from './helpers.js';

const NAMES = ['index.html', 'style.css', 'script.js', 'assets/logo.svg', 'README.md'];
const make = async (env, names = NAMES, extra = {}) => createJob({ ...env, input: validateJobInput({ owner: 'o', repo: 'r', branch: 'main', items: items(names), ...extra }) });
const run = (env, job, options) => advanceJob({ ...env, job, options });

test('publishes five files as five commits, each parented on the previous', async () => {
  const env = setup({ files: { 'existing.txt': 'untouched' } });
  const start = env.gh.refs.get('main');
  const job = await make(env); await uploadAll(env, job);
  await run(env, job);
  assert.equal(job.status, 'completed');
  const log = env.gh.log();
  assert.equal(log.length, 6); // 5 new + initial
  for (let i = 0; i < 5; i++) assert.equal(log[i].parents[0].sha, log[i + 1].sha);
  assert.equal(log[5].sha, start);
  assert.deepEqual(log.slice(0, 5).map((c) => c.message).reverse(), NAMES.map((n) => `Add ${n}`));
  const files = env.gh.files();
  for (const n of NAMES) assert.ok(files[n], n);
  assert.equal(env.gh.blobs.get(files['existing.txt']), 'untouched'); // existing file unchanged
  assert.ok(job.items.every((i) => i.status === 'completed' && i.commitSha));
});

test('updating an existing file creates a commit that replaces only that file', async () => {
  const env = setup({ files: { 'a.txt': 'old', 'b.txt': 'b' } });
  const job = await createJob({ ...env, input: validateJobInput({ owner: 'o', repo: 'r', branch: 'main', items: [{ path: 'a.txt', size: 'content of a.txt'.length, action: 'update', message: 'Update a.txt' }] }) });
  await uploadAll(env, job); await run(env, job);
  assert.equal(env.gh.blobs.get(env.gh.files()['a.txt']), b64('content of a.txt'));
  assert.equal(env.gh.blobs.get(env.gh.files()['b.txt']), 'b');
});

test('a failed file is marked failed, others continue, and retry commits it once', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a', 'b', 'c']); await uploadAll(env, job);
  env.gh.failNext('POST /repos/o/r/git/trees', 500); env.gh.failNext('POST /repos/o/r/git/trees', 500); env.gh.failNext('POST /repos/o/r/git/trees', 500);
  await run(env, job);
  assert.equal(job.status, 'partial');
  assert.deepEqual(job.items.map((i) => i.status), ['failed', 'completed', 'completed']);
  prepareRetry(job); await run(env, job);
  assert.equal(job.status, 'completed');
  assert.equal(env.gh.log().length, 4);
  assert.equal(new Set(env.gh.log().map((c) => c.message)).size, 4); // no duplicates
});

test('resume after a crash between updateRef and the job save does not duplicate the commit', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a', 'b', 'c']); await uploadAll(env, job);
  // simulate: engine landed commit "Add a" on GitHub but the process died before saving
  const saved = JSON.parse(JSON.stringify(job));
  await run(env, job, {});
  const landed = env.gh.log().length;
  // roll the stored job back to the pre-crash state with the intent marker still present
  saved.status = 'ready'; saved.headSha = env.gh.log().at(-1).sha; saved.headTree = env.gh.commits.get(saved.headSha).tree.sha;
  saved.inflight = { indexes: [0, 1, 2] }; saved.items.forEach((i) => { i.commitSha = null; });
  await env.jobs.save(saved);
  const resumed = await env.jobs.get(saved.id);
  await run(env, resumed);
  assert.equal(env.gh.log().length, landed); // nothing new was committed
  assert.equal(resumed.status, 'completed');
  assert.ok(resumed.items.every((i) => i.commitSha));
});

test('stops with a conflict when someone else pushed, and never overwrites their work', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a', 'b']); await uploadAll(env, job);
  await run(env, job, {}); // completes; make a fresh job to test conflict mid-way
  const env2 = setup({ files: { x: '1' } });
  const j2 = await make(env2, ['a', 'b']); await uploadAll(env2, j2);
  // first advance: head recorded. Then external push before the next advance.
  j2.headSha = env2.gh.refs.get('main'); j2.headTree = env2.gh.commits.get(j2.headSha).tree.sha;
  env2.gh.externalPush('theirs.txt', 'precious');
  await run(env2, j2);
  assert.equal(j2.status, 'conflict');
  assert.equal(j2.error.code, 'branch_conflict');
  assert.ok(env2.gh.files()['theirs.txt']);
  assert.equal(env2.gh.log().length, 2);
  // user confirms: continue on top of latest commits, their file is preserved
  await run(env2, j2, { acceptNewBase: true });
  assert.equal(j2.status, 'completed');
  assert.ok(env2.gh.files()['theirs.txt'] && env2.gh.files()['a'] && env2.gh.files()['b']);
});

test('rate limit pauses the job without losing completed commits', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a', 'b', 'c']); await uploadAll(env, job);
  env.gh.failNext('POST /repos/o/r/git/commits', 429, { message: 'rate' }, { 'retry-after': '90' });
  await run(env, job);
  assert.equal(job.status, 'paused');
  assert.equal(job.error.code, 'rate_limited');
  assert.equal(job.items[0].status, 'waiting');
  await run(env, job);
  assert.equal(job.status, 'completed');
});

test('expired token pauses as failed/auth_expired', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a']); await uploadAll(env, job);
  env.gh.failNext('GET /repos/o/r/git/ref', 401, { message: 'Bad credentials' });
  await run(env, job);
  assert.equal(job.status, 'failed'); assert.equal(job.error.code, 'auth_expired');
});

test('empty repository: first file via Contents API, rest via Git Data API', async () => {
  const env = setup({ empty: true });
  const job = await make(env, ['a', 'b', 'c']);
  assert.equal(job.emptyRepo, true);
  await assert.rejects(uploadBlobs({ ...env, job, files: [{ index: 1, content: b64('content of b') }] }), /first/);
  await uploadBlobs({ ...env, job, files: [{ index: 0, content: b64('content of a') }] });
  assert.equal(job.items[0].status, 'completed');
  await uploadAll(env, job);
  await run(env, job);
  assert.equal(job.status, 'completed');
  const log = env.gh.log(); assert.equal(log.length, 3); assert.equal(log.at(-1).parents.length, 0);
});

test('creates a new branch from the base branch', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await createJob({ ...env, input: validateJobInput({ owner: 'o', repo: 'r', branch: 'feature/new', createBranch: true, baseBranch: 'main', items: items(['a']) }) });
  await uploadAll(env, job); await run(env, job);
  assert.equal(job.status, 'completed');
  assert.equal(env.gh.log('feature/new').length, 2);
  assert.equal(env.gh.log('main').length, 1);
});

test('upload rejects content that does not match the planned size', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a']);
  await assert.rejects(uploadBlobs({ ...env, job, files: [{ index: 0, content: b64('different length content!!') }] }), /size/);
});

test('cancel stops further commits', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a', 'b']); await uploadAll(env, job);
  await cancelJob({ ...env, job });
  assert.equal(job.status, 'cancelled');
  await assert.rejects(run(env, job), /cancelled/);
  assert.equal(env.gh.log().length, 1);
});

test('does not start while another run holds the lock', async () => {
  const env = setup({ files: { x: '1' } });
  const job = await make(env, ['a']); await uploadAll(env, job);
  job.lock = { id: 'x', expiresAt: Date.now() + 60000 };
  await assert.rejects(run(env, job), /already running/);
});
