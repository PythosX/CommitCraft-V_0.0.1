import { createHash } from 'node:crypto';
import { GitHubClient } from '../src/services/github-api.js';
import { jobStore } from '../src/storage/job-store.js';
import { historyStore } from '../src/storage/history-store.js';

export class MemoryKV {
  constructor() { this.m = new Map(); }
  async get(k, type) { const v = this.m.get(k); if (v === undefined) return null; return type === 'json' ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, typeof v === 'string' ? v : String(v)); }
  async delete(k) { this.m.delete(k); }
}

const sha = (s) => createHash('sha1').update(s).digest('hex');

// In-memory GitHub implementing just the Git Data endpoints the engine uses.
export class FakeGitHub {
  constructor({ empty = false, files = {} } = {}) {
    this.blobs = new Map(); this.trees = new Map(); this.commits = new Map(); this.refs = new Map();
    this.calls = []; this.failures = []; this.pushedBy3rdParty = 0;
    if (!empty) {
      const entries = {};
      for (const [p, c] of Object.entries(files)) { const b = sha('blob' + c); this.blobs.set(b, c); entries[p] = b; }
      const t = this.mkTree(entries);
      const c = this.mkCommit('Initial commit', t, []);
      this.refs.set('main', c);
    }
  }
  mkTree(entries) { const id = sha('tree' + JSON.stringify(Object.entries(entries).sort())); this.trees.set(id, entries); return id; }
  mkCommit(message, tree, parents) { const id = sha('commit' + message + tree + parents + this.commits.size); this.commits.set(id, { sha: id, message, tree: { sha: tree }, parents: parents.map((p) => ({ sha: p })), html_url: `https://github.com/o/r/commit/${id}` }); return id; }
  failNext(match, status, body = {}, headers = {}) { this.failures.push({ match, status, body, headers }); }
  // simulate somebody else pushing to main
  externalPush(path, content) {
    const head = this.refs.get('main'); const base = this.trees.get(this.commits.get(head).tree.sha);
    const b = sha('blob' + content); this.blobs.set(b, content);
    const t = this.mkTree({ ...base, [path]: b }); this.refs.set('main', this.mkCommit('external change', t, [head]));
  }
  files(branch = 'main') { return this.trees.get(this.commits.get(this.refs.get(branch)).tree.sha); }
  log(branch = 'main') { const out = []; let c = this.refs.get(branch); while (c) { const x = this.commits.get(c); out.push(x); c = x.parents[0]?.sha; } return out; }

  fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'; const path = decodeURIComponent(u.pathname);
    this.calls.push(`${method} ${path}`);
    const fi = this.failures.findIndex((f) => `${method} ${path}`.includes(f.match));
    if (fi >= 0) { const f = this.failures.splice(fi, 1)[0]; return res(f.status, f.body, f.headers); }
    const body = init.body ? JSON.parse(init.body) : {};
    let m;
    if ((m = path.match(/^\/repos\/[^/]+\/[^/]+$/)) && method === 'GET') return res(200, { default_branch: 'main', permissions: { push: true } });
    if ((m = path.match(/\/git\/ref\/heads\/(.+)$/)) && method === 'GET') {
      if (!this.refs.size && !this.commits.size) return res(409, { message: 'Git Repository is empty.' });
      const r = this.refs.get(m[1]); return r ? res(200, { object: { sha: r } }) : res(404, { message: 'Not Found' });
    }
    if (path.endsWith('/git/refs') && method === 'POST') { this.refs.set(body.ref.replace('refs/heads/', ''), body.sha); return res(201, {}); }
    if ((m = path.match(/\/git\/refs\/heads\/(.+)$/)) && method === 'PATCH') {
      const cur = this.refs.get(m[1]); let c = body.sha, ok = false;
      while (c) { if (c === cur) { ok = true; break; } c = this.commits.get(c)?.parents[0]?.sha; }
      if (!ok && !body.force) return res(422, { message: 'Update is not a fast forward' });
      this.refs.set(m[1], body.sha); return res(200, {});
    }
    if ((m = path.match(/\/git\/commits\/([0-9a-f]+)$/)) && method === 'GET') return res(200, this.commits.get(m[1]));
    if (path.endsWith('/git/commits') && method === 'POST') { const id = this.mkCommit(body.message, body.tree, body.parents); return res(201, this.commits.get(id)); }
    if (path.endsWith('/git/blobs') && method === 'POST') { if (!this.commits.size) return res(409, { message: 'Git Repository is empty.' }); const id = sha('blob' + body.content); this.blobs.set(id, body.content); return res(201, { sha: id }); }
    if (path.endsWith('/git/trees') && method === 'POST') {
      const base = body.base_tree ? this.trees.get(body.base_tree) : {}; const next = { ...base };
      for (const t of body.tree) { if (!this.blobs.has(t.sha)) return res(422, { message: 'Blob not found' }); next[t.path] = t.sha; }
      return res(201, { sha: this.mkTree(next) });
    }
    if ((m = path.match(/\/git\/trees\/([0-9a-f]+)$/)) && method === 'GET') return res(200, { truncated: false, tree: Object.entries(this.trees.get(m[1])).map(([p, s]) => ({ path: p, sha: s, type: 'blob' })) });
    if ((m = path.match(/\/contents\/(.+)$/)) && method === 'PUT') {
      const b = sha('blob' + body.content); this.blobs.set(b, body.content);
      const t = this.mkTree({ [m[1]]: b }); const c = this.mkCommit(body.message, t, []); this.refs.set(body.branch, c);
      return res(201, { content: { sha: b }, commit: this.commits.get(c) });
    }
    return res(404, { message: 'unhandled in fake: ' + method + ' ' + path });
  };
}
const res = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export function setup(opts) {
  const gh = new FakeGitHub(opts);
  const kv = new MemoryKV();
  const client = new GitHubClient('tok', { fetch: gh.fetch, sleep: async () => {} });
  return { gh, kv, client, jobs: jobStore(kv), history: historyStore(kv), user: { id: '1', login: 'me' } };
}
export const b64 = (s) => Buffer.from(s).toString('base64');
export const items = (names, action = 'add') => names.map((n) => ({ path: n, size: Buffer.byteLength('content of ' + n), action, message: `Add ${n}` }));
export async function uploadAll(env, job, names) {
  const { uploadBlobs } = await import('../src/services/publishing-engine.js');
  await uploadBlobs({ client: env.client, jobs: env.jobs, job, files: job.items.filter((i) => i.action !== 'skip').map((i) => ({ index: i.index, content: b64('content of ' + i.path) })) });
}
