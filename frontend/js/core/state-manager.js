// Wizard state and uploaded files live in IndexedDB (never tokens). Files are kept so a publish can be
// resumed after a page reload or a closed tab.
import { bus } from './event-bus.js';

const DB = 'commitcraft', VERSION = 1;
let dbp;
function db() {
  return (dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files', { keyPath: 'path' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
const tx = async (store, mode, fn) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    let out; try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
  });
};

export const kv = {
  get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
  del: (k) => tx('kv', 'readwrite', (s) => s.delete(k)),
};

export const files = {
  async putMany(records) { return tx('files', 'readwrite', (s) => { records.forEach((r) => s.put(r)); }); },
  all: () => tx('files', 'readonly', (s) => s.getAll()),
  get: (path) => tx('files', 'readonly', (s) => s.get(path)),
  clear: () => tx('files', 'readwrite', (s) => s.clear()),
};

const DEFAULT_WIZARD = { repo: null, branch: null, createBranch: false, baseBranch: null, template: 'add', order: 'path', prefix: '', messages: {}, orderList: null, customIgnore: [], useGitignore: true, rootName: '', skippedDirs: [], jobId: null };
let wizard = null;
export async function getWizard() {
  if (!wizard) wizard = { ...DEFAULT_WIZARD, ...((await kv.get('wizard')) ?? {}) };
  return wizard;
}
export async function patchWizard(patch) {
  wizard = { ...(await getWizard()), ...patch };
  await kv.set('wizard', wizard);
  bus.emit('wizard:change', wizard);
  return wizard;
}
export async function resetWizard(keepRepo = false) {
  const w = await getWizard();
  wizard = { ...DEFAULT_WIZARD, ...(keepRepo ? { repo: w.repo, branch: w.branch, createBranch: w.createBranch, baseBranch: w.baseBranch } : {}) };
  await kv.set('wizard', wizard);
  await files.clear();
}
