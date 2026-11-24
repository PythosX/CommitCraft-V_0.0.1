// Validates repository-relative file paths received from the browser.
// The browser is never trusted: every path is re-validated before it reaches GitHub.
const CONTROL = /[\u0000-\u001f\u007f]/;
const fail = (reason) => ({ ok: false, reason });

export function validateRepoPath(path, maxLength = 400) {
  if (typeof path !== 'string' || path.length === 0) return fail('Path is empty.');
  if (path.length > maxLength) return fail('Path is too long.');
  if (CONTROL.test(path)) return fail('Path contains control characters.');
  if (path.includes('\\')) return fail('Path must use forward slashes.');
  if (path.startsWith('/')) return fail('Path must be relative.');
  if (path.endsWith('/')) return fail('Path must point to a file.');
  for (const seg of path.split('/')) {
    if (seg === '') return fail('Path contains an empty folder name.');
    if (seg === '.' || seg === '..') return fail('Path traversal is not allowed.');
    if (seg.toLowerCase() === '.git') return fail('Paths inside .git are not allowed.');
    if (seg.length > 255) return fail('A path segment is too long.');
  }
  return { ok: true, path };
}
