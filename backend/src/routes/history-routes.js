import { json } from '../utils/response.js';
import { historyStore } from '../storage/history-store.js';

export default [
  { method: 'GET', path: '/api/publish/history', async handler(rc) {
    const jobs = await historyStore(rc.cfg.kv).list(rc.user.id);
    const done = jobs.filter((j) => j.commits > 0);
    const repos = [];
    for (const j of jobs) { const k = `${j.owner}/${j.repo}`; if (!repos.find((r) => r.fullName === k)) repos.push({ fullName: k, owner: j.owner, repo: j.repo, branch: j.branch, lastAt: j.createdAt }); }
    return json({ jobs, totals: { jobs: jobs.length, commits: done.reduce((n, j) => n + j.commits, 0), files: done.reduce((n, j) => n + j.commits, 0) }, recentRepos: repos.slice(0, 5) });
  } },
  { method: 'DELETE', path: '/api/publish/history', async handler(rc) {
    await historyStore(rc.cfg.kv).clear(rc.user.id);
    return json({ ok: true });
  } },
];
