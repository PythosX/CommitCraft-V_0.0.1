import { LIMITS } from '../config/env.js';
const MAX = 200;

export const historyStore = (kv) => ({
  async list(userId) {
    return (await kv.get(`hist:${userId}`, 'json')) ?? [];
  },
  async upsert(userId, entry) {
    const list = (await kv.get(`hist:${userId}`, 'json')) ?? [];
    const i = list.findIndex((e) => e.id === entry.id);
    if (i >= 0) list[i] = { ...list[i], ...entry };
    else list.unshift(entry);
    await kv.put(`hist:${userId}`, JSON.stringify(list.slice(0, MAX)), { expirationTtl: LIMITS.historyTtlSeconds });
  },
  clear: (userId) => kv.delete(`hist:${userId}`),
});

export function historyEntry(job) {
  const finished = ['completed', 'failed', 'partial', 'cancelled'].includes(job.status);
  const commits = job.items.filter((i) => i.status === 'completed').length;
  return {
    id: job.id, owner: job.owner, repo: job.repo, branch: job.branch,
    createdAt: job.createdAt, finishedAt: finished ? Date.now() : null,
    durationMs: finished && job.startedAt ? Date.now() - job.startedAt : null,
    files: job.items.filter((i) => i.action !== 'skip').length,
    commits, failed: job.items.filter((i) => i.status === 'failed').length,
    skipped: job.items.filter((i) => i.status === 'skipped').length,
    status: job.status,
  };
}
