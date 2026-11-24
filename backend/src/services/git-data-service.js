import { GitHubError } from './github-api.js';

// Returns { exists, empty, head } for a branch. An empty repository answers 409 to ref lookups.
export async function resolveBranchState(client, owner, repo, branch) {
  try {
    const ref = await client.getRef(owner, repo, branch);
    return { exists: true, empty: false, head: ref.object.sha };
  } catch (e) {
    if (e instanceof GitHubError && e.status === 409) return { exists: false, empty: true, head: null };
    if (e instanceof GitHubError && e.status === 404) return { exists: false, empty: false, head: null };
    throw e;
  }
}

// Existing paths in the target branch, used to label files as "add" or "update".
export async function listBranchFiles(client, owner, repo, branch) {
  const state = await resolveBranchState(client, owner, repo, branch);
  if (!state.exists) return { exists: false, empty: state.empty, truncated: false, files: [] };
  const commit = await client.getCommit(owner, repo, state.head);
  const tree = await client.getTree(owner, repo, commit.tree.sha);
  return {
    exists: true, empty: false, truncated: !!tree.truncated, head: state.head,
    files: tree.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha, size: t.size })),
  };
}
