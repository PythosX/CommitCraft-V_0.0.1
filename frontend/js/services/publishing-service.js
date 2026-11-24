import { api, apiStream } from '../core/api-client.js';
import { files, getWizard } from '../core/state-manager.js';
import { blobToBase64 } from '../utils/file-utils.js';
import { CONFIG } from '../config/app-config.js';

export const createJob = (payload) => api.post('/api/publish/jobs', payload).then((r) => r.job);
export const getJob = (id) => api.get(`/api/publish/jobs/${encodeURIComponent(id)}`).then((r) => r.job);
export const cancelJob = (id) => api.post(`/api/publish/jobs/${encodeURIComponent(id)}/cancel`).then((r) => r.job);

// Phase 1: send file contents so GitHub can store them as blobs. Only files still missing a blob are sent,
// so this is safe to call again after an interruption.
export async function uploadMissing(job, { onProgress, signal } = {}) {
  const w = await getWizard();
  const pending = job.items.filter((i) => i.status === 'waiting' && !i.blobSha);
  let done = job.items.filter((i) => i.action !== 'skip' && (i.blobSha || i.status === 'completed')).length;
  const total = job.items.filter((i) => i.action !== 'skip').length;
  const local = (repoPath) => (w.prefix && repoPath.startsWith(w.prefix + '/') ? repoPath.slice(w.prefix.length + 1) : repoPath);
  let batch = [], batchBytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const body = { files: batch }; batch = []; batchBytes = 0;
    const r = await api.post(`/api/publish/jobs/${encodeURIComponent(job.id)}/blobs`, body, { signal });
    Object.assign(job, r.job); done += body.files.length; onProgress?.(done, total);
  };
  // In an empty repository GitHub only accepts the first file via the Contents API, so it goes alone.
  const mustBeAlone = (item) => job.emptyRepo && !job.headSha && item === pending[0];
  for (const item of pending) {
    const rec = await files.get(local(item.path));
    if (!rec) throw Object.assign(new Error(`"${item.path}" is no longer stored in this browser. Re-upload the folder to continue.`), { code: 'files_missing' });
    const content = await blobToBase64(rec.blob);
    if (mustBeAlone(item)) { await flush(); batch.push({ index: item.index, content }); await flush(); continue; }
    if (batch.length >= CONFIG.BLOB_BATCH_FILES || (batchBytes + rec.size > CONFIG.BLOB_BATCH_BYTES && batch.length)) await flush();
    batch.push({ index: item.index, content }); batchBytes += rec.size;
  }
  await flush();
  return job;
}

// Phase 2: ask the server to commit. It does up to 12 commits per request and streams each one as it lands;
// we repeat until nothing is left or something needs the user.
export async function drive(job, { mode = 'start', body = {}, onItem, onJob, signal } = {}) {
  let first = true, final = null;
  for (;;) {
    const path = `/api/publish/jobs/${encodeURIComponent(job.id)}/${first ? mode : 'start'}`;
    let streamError = null;
    await apiStream(path, first ? body : {}, (ev) => {
      if (ev.type === 'item') onItem?.(ev.item);
      else if (ev.type === 'job') final = ev.job;
      else if (ev.type === 'error') streamError = ev.error;
    }, { signal });
    first = false;
    if (streamError) throw Object.assign(new Error(streamError.message), { code: streamError.code, status: streamError.status });
    final = await getJob(job.id); // authoritative state after every batch
    onJob?.(final);
    if (final.status !== 'ready') return final;
  }
}
