import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRepoPath } from '../src/utils/path-validator.js';
import { assertBranch, assertRepoName, base64ByteLength, validateJobInput } from '../src/utils/validation.js';

test('accepts normal nested paths', () => {
  for (const p of ['index.html', 'assets/logo.svg', 'a/b/c/d.txt', '.github/workflows/ci.yml', 'dir with space/file (1).md'])
    assert.equal(validateRepoPath(p).ok, true, p);
});
test('rejects traversal and unsafe paths', () => {
  for (const p of ['../x', 'a/../../x', '/etc/passwd', 'a//b', 'a/', '.git/config', 'a/.GIT/x', 'a\\b', 'a/./b', '', 'x\u0000y', 'a'.repeat(500)])
    assert.equal(validateRepoPath(p).ok, false, JSON.stringify(p));
});
test('branch and repo name validation', () => {
  for (const b of ['main', 'feature/x-1', 'release_1.2']) assert.equal(assertBranch(b), b);
  for (const b of ['', 'a..b', 'a b', '/x', 'x/', 'x.lock', 'a~1', 'a:b', '@{x}', '.hidden']) assert.throws(() => assertBranch(b), undefined, b);
  assert.equal(assertRepoName('my-repo.v2'), 'my-repo.v2');
  for (const r of ['..', 'a/b', 'a b', '', 'x.git']) assert.throws(() => assertRepoName(r));
});
test('base64 length is exact', () => {
  assert.equal(base64ByteLength(Buffer.from('hello').toString('base64')), 5);
  assert.equal(base64ByteLength(''), 0);
  assert.equal(base64ByteLength('!!!'), -1);
});
test('job input rejects duplicates, bad paths, empty plans', () => {
  const base = { owner: 'me', repo: 'r', branch: 'main' };
  const ok = { path: 'a.txt', size: 1, action: 'add', message: 'Add a.txt' };
  assert.throws(() => validateJobInput({ ...base, items: [ok, ok] }), /Duplicate/);
  assert.throws(() => validateJobInput({ ...base, items: [{ ...ok, path: '../a' }] }), /traversal/);
  assert.throws(() => validateJobInput({ ...base, items: [{ ...ok, message: '  ' }] }), /empty/);
  assert.throws(() => validateJobInput({ ...base, items: [{ ...ok, action: 'skip' }] }), /nothing to commit/);
  assert.equal(validateJobInput({ ...base, items: [ok] }).items[0].status, 'waiting');
});
