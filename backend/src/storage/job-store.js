import { LIMITS } from '../config/env.js';

export const jobStore = (kv) => ({
  get: (id) => kv.get(`job:${id}`, 'json'),
  async save(job) {
    job.updatedAt = Date.now();
    await kv.put(`job:${job.id}`, JSON.stringify(job), { expirationTtl: LIMITS.jobTtlSeconds });
  },
  delete: (id) => kv.delete(`job:${id}`),
});

export function countItems(job) {
  const c = { total: job.items.length, completed: 0, failed: 0, skipped: 0, waiting: 0, committing: 0, toCommit: 0, blobsReady: 0 };
  for (const i of job.items) {
    c[i.status] = (c[i.status] ?? 0) + 1;
    if (i.action !== 'skip') { c.toCommit++; if (i.blobSha || i.status === 'completed') c.blobsReady++; }
  }
  return c;
}

// Never returns internal fields to the browser.
export function publicJob(job) {
  const { lock, inflight, userId, cancelRequested, ...rest } = job;
  return { ...rest, running: !!(lock && lock.expiresAt > Date.now()), counts: countItems(job) };
}
