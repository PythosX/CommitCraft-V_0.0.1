import { conflict } from '../utils/response.js';

// After an interrupted run the branch may be ahead of what we recorded.
// Walk back from the live head to the recorded head and check that every commit in between is one of ours,
// in order. If so we adopt them (no duplicates); if not, someone else pushed and we stop.
export async function reconcile(client, job, liveHead) {
  const inflight = job.inflight?.indexes ?? [];
  const chain = [];
  let cur = liveHead;
  let found = false;
  for (let i = 0; i < 60 && cur; i++) {
    const c = await client.getCommit(job.owner, job.repo, cur);
    chain.push(c);
    if (c.parents.length !== 1) break;
    if (c.parents[0].sha === job.headSha) { found = true; break; }
    cur = c.parents[0].sha;
  }
  if (!found || chain.length > inflight.length) throw branchMoved(job, liveHead);
  chain.reverse();
  chain.forEach((c, k) => {
    const item = job.items[inflight[k]];
    if (!item || c.message.trim() !== item.message.trim()) throw branchMoved(job, liveHead);
  });
  chain.forEach((c, k) => {
    const item = job.items[inflight[k]];
    item.status = 'completed';
    item.commitSha = c.sha;
    item.commitUrl = c.html_url || `https://github.com/${job.owner}/${job.repo}/commit/${c.sha}`;
    item.error = null;
  });
  job.headSha = liveHead;
  job.headTree = chain[chain.length - 1].tree.sha;
  job.inflight = null;
  return chain.length;
}

export function branchMoved(job, liveHead) {
  return conflict('branch_conflict', `The branch "${job.branch}" changed while publishing. Nothing was overwritten.`, { liveHead, expected: job.headSha });
}

// Adopts the latest head as the new base (user confirmed). Our commits are built on top of it.
export async function rebaseOntoLive(client, job, liveHead) {
  const c = await client.getCommit(job.owner, job.repo, liveHead);
  job.headSha = liveHead;
  job.headTree = c.tree.sha;
  job.inflight = null;
}
