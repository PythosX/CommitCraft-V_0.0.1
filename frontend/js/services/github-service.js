import { api } from '../core/api-client.js';

export async function listAllRepos(onPage) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const r = await api.get(`/api/github/repos?page=${page}`);
    out.push(...r.repos); onPage?.(out);
    if (!r.hasMore) break;
  }
  return out;
}
export const createRepo = (b) => api.post('/api/github/repos', b).then((r) => r.repo);
export const listBranches = (owner, repo) => api.get(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
export const branchTree = (owner, repo, branch) => api.get(`/api/github/tree?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`);
