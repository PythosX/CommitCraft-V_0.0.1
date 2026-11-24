import { json, badRequest } from '../utils/response.js';
import { assertOwner, assertRepoName, assertBranch } from '../utils/validation.js';
import { mapRepo } from '../services/repository-service.js';
import { listBranchFiles } from '../services/git-data-service.js';

const page = (v) => Math.min(Math.max(parseInt(v || '1', 10) || 1, 1), 50);

export default [
  { method: 'GET', path: '/api/github/repos', async handler(rc) {
    const p = page(rc.query.get('page'));
    const repos = await rc.client.listRepos(p, 100);
    return json({ repos: repos.map(mapRepo), page: p, hasMore: repos.length === 100 });
  } },

  { method: 'GET', path: '/api/github/branches', async handler(rc) {
    const owner = assertOwner(rc.query.get('owner'));
    const repo = assertRepoName(rc.query.get('repo'));
    const [r, branches] = await Promise.all([rc.client.getRepo(owner, repo), rc.client.listBranches(owner, repo, page(rc.query.get('page')))]);
    return json({ defaultBranch: r.default_branch, branches: branches.map((b) => ({ name: b.name, protected: !!b.protected })) });
  } },

  // Existing files on a branch so the plan can say "add" or "update" for each path.
  { method: 'GET', path: '/api/github/tree', async handler(rc) {
    const owner = assertOwner(rc.query.get('owner'));
    const repo = assertRepoName(rc.query.get('repo'));
    const branch = assertBranch(rc.query.get('branch'));
    return json(await listBranchFiles(rc.client, owner, repo, branch));
  } },
];
