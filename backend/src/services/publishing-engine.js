import { LIMITS } from '../config/env.js';
import { GitHubError } from './github-api.js';
import { resolveBranchState } from './git-data-service.js';
import { commitFile } from './commit-engine.js';
import { reconcile, rebaseOntoLive, branchMoved } from './recovery-service.js';
import { randomId } from '../utils/crypto.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../utils/response.js';
import { base64ByteLength } from '../utils/validation.js';
import { historyEntry } from '../storage/history-store.js';

const FINISHED = ['completed', 'failed', 'partial', 'cancelled'];
const LOCK_MS = 90_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function createJob({ client, jobs, history, user, input }) {
  const repo = await client.getRepo(input.owner, input.repo).catch((e) => {
    if (e instanceof GitHubError && e.status === 404) throw notFound('That repository was not found or you cannot access it.');
    throw e;
  });
  if (repo.permissions && !repo.permissions.push) throw forbidden('You need write access to publish to this repository.');
  const state = await resolveBranchState(client, input.owner, input.repo, input.branch);
  if (!state.exists && !state.empty && !input.createBranch) throw badRequest(`Branch "${input.branch}" does not exist.`);
  if (state.exists && input.createBranch) throw badRequest(`Branch "${input.branch}" already exists.`);
  const job = {
    id: randomId(18), userId: user.id, owner: input.owner, repo: input.repo, branch: input.branch,
    createBranch: input.createBranch && !state.empty, baseBranch: input.baseBranch || repo.default_branch,
    emptyRepo: state.empty, status: 'uploading', createdAt: Date.now(), startedAt: null, finishedAt: null,
    headSha: null, headTree: null, inflight: null, lock: null, error: null, items: input.items,
  };
  await jobs.save(job);
  await history.upsert(user.id, historyEntry(job));
  return job;
}

// Phase 1: file contents become Git blobs. Blobs do not touch any branch, so they are always safe to retry.
export async function uploadBlobs({ client, jobs, job, files }) {
  if (FINISHED.includes(job.status)) throw conflict('job_finished', 'This publish has already finished.');
  const firstIdx = job.items.find((i) => i.action !== 'skip' && i.status === 'waiting')?.index;
  for (const f of files) {
    const item = job.items[f.index];
    if (!item || item.action === 'skip') throw badRequest('Unknown file index.');
    const bytes = base64ByteLength(f.content);
    if (bytes < 0) throw badRequest(`${item.path}: content is not valid base64.`);
    if (bytes !== item.size) throw badRequest(`${item.path}: uploaded size does not match the plan.`);
  }
  const todo = files.filter((f) => job.items[f.index].status === 'waiting' && !job.items[f.index].blobSha);
  const results = [];
  for (let i = 0; i < todo.length; i += 4) {
    const group = todo.slice(i, i + 4);
    await Promise.all(group.map(async (f) => {
      const item = job.items[f.index];
      if (job.emptyRepo && !job.headSha) {
        // Git Data blobs are rejected by GitHub in a repository with no commits at all.
        // The first file is committed through the Contents API, which creates the branch.
        if (f.index !== firstIdx) throw conflict('upload_first_file_first', 'In an empty repository the first file must be uploaded first.');
        const res = await client.putFile(job.owner, job.repo, item.path, { message: item.message, content: f.content, branch: job.branch });
        job.headSha = res.commit.sha;
        job.headTree = res.commit.tree.sha;
        job.startedAt ||= Date.now();
        item.blobSha = res.content.sha;
        item.status = 'completed';
        item.commitSha = res.commit.sha;
        item.commitUrl = res.commit.html_url;
      } else {
        const blob = await client.createBlob(job.owner, job.repo, f.content);
        item.blobSha = blob.sha;
      }
      results.push(f.index);
    }));
  }
  refreshStatus(job);
  await jobs.save(job);
  return results;
}

export function refreshStatus(job) {
  if (FINISHED.includes(job.status) || job.status === 'running' || job.status === 'conflict' || job.status === 'paused') return;
  const waiting = job.items.filter((i) => i.status === 'waiting');
  job.status = waiting.length && waiting.some((i) => !i.blobSha) ? 'uploading' : 'ready';
}

function classify(e) {
  if (!(e instanceof GitHubError)) return { fatal: 'internal', message: 'Unexpected error.' };
  if (e.status === 401) return { fatal: 'auth_expired', message: 'GitHub authorization expired. Sign in again, then resume.' };
  if (e.code === 'rate_limited') return { fatal: 'rate_limited', message: 'GitHub rate limit reached. Resume in a minute.', retryAfter: e.retryAfter };
  if (e.status === 0) return { fatal: 'network', message: 'Lost connection to GitHub. Resume to continue.' };
  if (e.status === 422 || e.status === 409) return { fatal: 'conflict', message: e.message };
  if (e.status === 403) return { fatal: 'forbidden', message: e.message };
  return { item: true, message: e.message };
}

// Runs up to `batch` commits. Safe to call repeatedly; each call verifies the branch before touching it.
export async function advanceJob({ client, jobs, history, job, onEvent = () => {}, batch = LIMITS.commitsPerRequest, options = {}, now = Date.now }) {
  const emit = (e) => { try { onEvent(e); } catch { /* client went away */ } };
  if (job.status === 'cancelled') throw conflict('job_cancelled', 'This publish was cancelled.');
  if (job.lock && job.lock.expiresAt > now()) throw conflict('job_running', 'This publish is already running.');
  job.lock = { id: randomId(8), expiresAt: now() + LOCK_MS };
  job.status = 'running';
  job.startedAt ||= now();
  job.error = null;
  for (const i of job.items) if (i.status === 'committing') i.status = 'waiting'; // stale marker from an interrupted run
  let lastSave = 0;
  const persist = async (force = false) => {
    if (!force && now() - lastSave < 1500) return;
    try {
      const fresh = await jobs.get(job.id);
      if (fresh?.cancelRequested) job.cancelRequested = true;
      job.lock.expiresAt = now() + LOCK_MS;
      await jobs.save(job);
      lastSave = now();
    } catch { /* KV write throttled; next save will catch up */ }
  };
  await persist(true);
  emit({ type: 'job', job: snapshot(job) });

  try {
    await prepareHead(client, job, options);
    await persist(true);
    const queue = [];
    for (const item of job.items) {
      if (item.status !== 'waiting') continue;
      if (!item.blobSha) break; // keep commit order: wait for this file's content
      queue.push(item);
      if (queue.length >= batch) break;
    }
    job.inflight = { indexes: queue.map((i) => i.index) };
    await persist(true);

    for (const item of queue) {
      const fresh = await jobs.get(job.id);
      if (fresh?.cancelRequested || job.cancelRequested) { job.cancelRequested = true; break; }
      item.status = 'committing';
      emit({ type: 'item', item });
      try {
        const r = await commitFile(client, { owner: job.owner, repo: job.repo, branch: job.branch, parentSha: job.headSha, baseTreeSha: job.headTree, path: item.path, blobSha: item.blobSha, message: item.message });
        item.status = 'completed';
        item.commitSha = r.commitSha;
        item.commitUrl = r.url;
        item.error = null;
        job.headSha = r.commitSha;
        job.headTree = r.treeSha;
        job.inflight.indexes = job.inflight.indexes.filter((x) => x !== item.index);
        emit({ type: 'item', item });
        await persist();
      } catch (e) {
        const c = classify(e);
        if (c.fatal === 'conflict') {
          // Verify whether the branch actually moved; if not it is a genuine validation problem for this file.
          const live = await resolveBranchState(client, job.owner, job.repo, job.branch).catch(() => null);
          if (live && live.head !== job.headSha) { item.status = 'waiting'; throw branchMoved(job, live.head); }
          item.status = 'failed'; item.error = { message: c.message };
          emit({ type: 'item', item });
          job.inflight.indexes = job.inflight.indexes.filter((x) => x !== item.index);
        } else if (c.item) {
          item.status = 'failed'; item.error = { message: c.message };
          job.inflight.indexes = job.inflight.indexes.filter((x) => x !== item.index);
          emit({ type: 'item', item });
        } else {
          item.status = 'waiting'; // not the file's fault: leave it for resume
          throw Object.assign(e, { __class: c });
        }
      }
    }
    job.inflight = null;
    finalize(job);
  } catch (e) {
    if (e instanceof HttpError && e.code === 'branch_conflict') {
      job.status = 'conflict';
      job.error = { code: e.code, message: e.message, details: e.details };
    } else {
      const c = e.__class || classify(e);
      job.status = c.fatal === 'rate_limited' || c.fatal === 'network' ? 'paused' : 'failed';
      job.error = { code: c.fatal || 'error', message: c.message, retryAfter: c.retryAfter };
    }
    for (const i of job.items) if (i.status === 'committing') i.status = 'waiting';
  } finally {
    job.lock = null;
    if (FINISHED.includes(job.status)) job.finishedAt = now();
    await jobs.save(job).catch(() => {});
    await history.upsert(job.userId, historyEntry(job)).catch(() => {});
  }
  emit({ type: 'job', job: snapshot(job) });
  return job;
}

async function prepareHead(client, job, options) {
  const live = await resolveBranchState(client, job.owner, job.repo, job.branch);
  if (!job.headSha) {
    if (live.empty) throw badRequest('Upload the first file before committing.');
    if (!live.exists) {
      if (!job.createBranch) throw notFound(`Branch "${job.branch}" no longer exists.`);
      const base = await client.getRef(job.owner, job.repo, job.baseBranch);
      await client.createRef(job.owner, job.repo, job.branch, base.object.sha);
      job.headSha = base.object.sha;
    } else job.headSha = live.head;
    job.headTree = (await client.getCommit(job.owner, job.repo, job.headSha)).tree.sha;
    return;
  }
  if (!live.exists) throw branchMoved(job, null);
  if (live.head === job.headSha) return;
  if (options.acceptNewBase) { await rebaseOntoLive(client, job, live.head); return; }
  await reconcile(client, job, live.head); // adopts our own landed commits or throws branch_conflict
}

function finalize(job) {
  if (job.cancelRequested) { job.status = 'cancelled'; return; }
  const waiting = job.items.filter((i) => i.status === 'waiting');
  if (waiting.length) { job.status = waiting.some((i) => !i.blobSha) ? 'uploading' : 'ready'; return; }
  const failed = job.items.some((i) => i.status === 'failed');
  const done = job.items.some((i) => i.status === 'completed');
  job.status = failed ? (done ? 'partial' : 'failed') : 'completed';
}

export const snapshot = (j) => JSON.parse(JSON.stringify({ id: j.id, status: j.status, items: j.items.map((i) => ({ index: i.index, status: i.status })), error: j.error }));

export async function cancelJob({ jobs, history, job }) {
  if (FINISHED.includes(job.status)) return job;
  job.cancelRequested = true;
  const running = job.lock && job.lock.expiresAt > Date.now();
  if (!running) { job.status = 'cancelled'; job.finishedAt = Date.now(); }
  await jobs.save(job);
  await history.upsert(job.userId, historyEntry(job));
  return job;
}

export function prepareRetry(job, indexes) {
  let n = 0;
  for (const i of job.items) {
    if (i.status === 'failed' && (!indexes || indexes.includes(i.index))) { i.status = 'waiting'; i.error = null; n++; }
  }
  if (!n) throw badRequest('There are no failed files to retry.');
  if (job.status === 'partial' || job.status === 'failed') job.status = 'ready';
  job.finishedAt = null;
}
export { sleep, FINISHED };
