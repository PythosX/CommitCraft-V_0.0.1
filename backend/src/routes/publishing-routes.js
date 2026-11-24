import { json, notFound, badRequest, conflict } from '../utils/response.js';
import { validateJobInput } from '../utils/validation.js';
import { readJson } from '../utils/body.js';
import { jobStore, publicJob } from '../storage/job-store.js';
import { historyStore } from '../storage/history-store.js';
import { createJob, uploadBlobs, advanceJob, cancelJob, prepareRetry, refreshStatus } from '../services/publishing-engine.js';
import { rateLimit } from '../middleware/rate-limit.js';

async function loadJob(rc) {
  const job = await jobStore(rc.cfg.kv).get(rc.params.jobId);
  if (!job || job.userId !== rc.user.id) throw notFound('Publish job not found. It may have expired.');
  return job;
}

// Streams newline-delimited JSON so the UI sees each commit as it lands; falls back to one JSON body.
function run(rc, job, options) {
  const jobs = jobStore(rc.cfg.kv), history = historyStore(rc.cfg.kv);
  const args = { client: rc.client, jobs, history, job, options };
  if (!(rc.request.headers.get('Accept') || '').includes('application/x-ndjson')) {
    return advanceJob(args).then((j) => json({ job: publicJob(j) }));
  }
  const enc = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const write = (o) => writer.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
  const done = advanceJob({ ...args, onEvent: (e) => { if (e.type === 'item') write({ type: 'item', item: pubItem(e.item) }); } })
    .then((j) => write({ type: 'job', job: publicJob(j) }))
    .catch((err) => write({ type: 'error', error: { code: err.code || 'error', message: err.message, status: err.status || 500 } }))
    .finally(() => writer.close().catch(() => {}));
  rc.ctx?.waitUntil?.(done);
  return new Response(stream.readable, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' } });
}
const pubItem = ({ index, path, status, commitSha, commitUrl, error, message, action }) => ({ index, path, status, commitSha, commitUrl, error, message, action });

export default [
  { method: 'POST', path: '/api/publish/jobs', async handler(rc) {
    rateLimit('job:' + rc.user.id, 20);
    const input = validateJobInput(await readJson(rc.request, 1024 * 1024));
    const job = await createJob({ client: rc.client, jobs: jobStore(rc.cfg.kv), history: historyStore(rc.cfg.kv), user: rc.user, input });
    return json({ job: publicJob(job) }, 201);
  } },

  { method: 'GET', path: '/api/publish/jobs/:jobId', async handler(rc) {
    return json({ job: publicJob(await loadJob(rc)) });
  } },

  // Phase 1: send file contents (base64) in small batches; each becomes a Git blob.
  { method: 'POST', path: '/api/publish/jobs/:jobId/blobs', async handler(rc) {
    rateLimit('blobs:' + rc.user.id, 120);
    const { limits } = rc.cfg;
    const body = await readJson(rc.request, limits.maxBlobRequestBytes);
    if (!Array.isArray(body.files) || !body.files.length || body.files.length > limits.maxBlobsPerRequest) throw badRequest('Send between 1 and 25 files per request.');
    const job = await loadJob(rc);
    const files = body.files.map((f) => ({ index: Number(f.index), content: f.content }));
    if (files.some((f) => !Number.isInteger(f.index))) throw badRequest('Invalid file index.');
    const uploaded = await uploadBlobs({ client: rc.client, jobs: jobStore(rc.cfg.kv), job, files });
    return json({ uploaded, job: publicJob(job) });
  } },

  { method: 'POST', path: '/api/publish/jobs/:jobId/start', async handler(rc) {
    const job = await loadJob(rc);
    refreshStatus(job);
    if (!['ready', 'uploading', 'running'].includes(job.status)) throw conflict('bad_state', `This publish is ${job.status}. Use resume or retry instead.`);
    if (job.items.some((i) => i.status === 'waiting' && !i.blobSha) && !job.items.some((i) => i.status === 'waiting' && i.blobSha)) throw conflict('blobs_missing', 'File contents have not been uploaded yet.');
    return run(rc, job, {});
  } },

  { method: 'POST', path: '/api/publish/jobs/:jobId/retry', async handler(rc) {
    const job = await loadJob(rc);
    const b = await readJson(rc.request, rc.cfg.limits.maxJsonBytes);
    prepareRetry(job, Array.isArray(b.indexes) ? b.indexes.map(Number) : null);
    await jobStore(rc.cfg.kv).save(job);
    return run(rc, job, {});
  } },

  { method: 'POST', path: '/api/publish/jobs/:jobId/resume', async handler(rc) {
    const job = await loadJob(rc);
    const b = await readJson(rc.request, rc.cfg.limits.maxJsonBytes);
    if (job.status === 'conflict' && b.acceptNewBase !== true) throw conflict('confirm_required', 'The branch changed. Confirm to continue on top of the latest commits.');
    if (['completed', 'cancelled'].includes(job.status)) throw conflict('bad_state', `This publish is ${job.status}.`);
    if (['conflict', 'paused', 'failed'].includes(job.status)) { job.status = 'ready'; job.error = null; }
    refreshStatus(job);
    return run(rc, job, { acceptNewBase: b.acceptNewBase === true });
  } },

  { method: 'POST', path: '/api/publish/jobs/:jobId/cancel', async handler(rc) {
    const job = await cancelJob({ jobs: jobStore(rc.cfg.kv), history: historyStore(rc.cfg.kv), job: await loadJob(rc) });
    return json({ job: publicJob(job) });
  } },
];
