export function repoName(v) {
  if (!v) return 'Enter a repository name.';
  if (v.length > 100) return 'Use 100 characters or fewer.';
  if (!/^[A-Za-z0-9._-]+$/.test(v)) return 'Use letters, numbers, ".", "-" and "_" only.';
  if (v === '.' || v === '..' || v.endsWith('.git')) return 'That name is reserved.';
  return null;
}
export function branchName(v) {
  if (!v) return 'Enter a branch name.';
  if (/[\u0000-\u0020\u007f~^:?*\[\\]/.test(v) || v.includes('..') || v.includes('@{') || v.startsWith('/') || v.endsWith('/') || v.includes('//') || v.endsWith('.') || v.endsWith('.lock') || v.split('/').some((s) => s.startsWith('.')))
    return 'That is not a valid Git branch name.';
  return null;
}
export function commitMessage(v) {
  const m = (v ?? '').trim();
  if (!m) return { level: 'error', text: 'Message is empty.' };
  if (m.length > 500) return { level: 'error', text: 'Keep it under 500 characters.' };
  if (m.split('\n')[0].length > 72) return { level: 'warn', text: 'Over 72 characters; Git tools may truncate the title.' };
  return null;
}
