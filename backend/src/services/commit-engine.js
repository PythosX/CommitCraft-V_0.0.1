// One file => one genuine Git commit.
// The new tree is built on top of the previous tree (base_tree), so every existing file is preserved,
// and the commit has the previous head as its only parent.
export async function commitFile(client, { owner, repo, branch, parentSha, baseTreeSha, path, blobSha, message }) {
  const tree = await client.createTree(owner, repo, baseTreeSha, [{ path, mode: '100644', type: 'blob', sha: blobSha }]);
  const commit = await client.createCommit(owner, repo, { message, tree: tree.sha, parents: [parentSha] });
  // Non-force update: fails with 422 if the branch moved since parentSha.
  await client.updateRef(owner, repo, branch, commit.sha);
  return { commitSha: commit.sha, treeSha: tree.sha, url: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}` };
}
