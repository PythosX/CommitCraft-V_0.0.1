import test from 'node:test';
import assert from 'node:assert/strict';
import { commitFile } from '../src/services/commit-engine.js';
import { setup, b64 } from './helpers.js';

test('creates a commit whose parent is the previous head and preserves existing files', async () => {
  const { gh, client } = setup({ files: { 'README.md': 'keep me' } });
  const head = gh.refs.get('main'); const treeSha = gh.commits.get(head).tree.sha;
  const blob = await client.createBlob('o', 'r', b64('new'));
  const r = await commitFile(client, { owner: 'o', repo: 'r', branch: 'main', parentSha: head, baseTreeSha: treeSha, path: 'src/a.js', blobSha: blob.sha, message: 'Add src/a.js' });
  assert.equal(gh.refs.get('main'), r.commitSha);
  assert.equal(gh.commits.get(r.commitSha).parents[0].sha, head);
  assert.ok(gh.files()['README.md'] && gh.files()['src/a.js']);
});
test('fails (never overwrites) when the branch moved', async () => {
  const { gh, client } = setup({ files: { 'a': '1' } });
  const head = gh.refs.get('main'); const tree = gh.commits.get(head).tree.sha;
  const blob = await client.createBlob('o', 'r', b64('x'));
  gh.externalPush('theirs.txt', 'important');
  await assert.rejects(commitFile(client, { owner: 'o', repo: 'r', branch: 'main', parentSha: head, baseTreeSha: tree, path: 'b', blobSha: blob.sha, message: 'm' }), (e) => e.status === 422);
  assert.ok(gh.files()['theirs.txt']);
});
