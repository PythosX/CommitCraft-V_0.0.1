export const basename = (p) => p.slice(p.lastIndexOf('/') + 1);
export const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
export const join = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
// Client-side mirror of the server rules. The server re-validates everything.
export function validRepoPath(p) {
  if (!p || p.length > 400 || p.startsWith('/') || p.endsWith('/') || p.includes('\\') || /[\u0000-\u001f\u007f]/.test(p)) return false;
  return p.split('/').every((s) => s && s !== '.' && s !== '..' && s.toLowerCase() !== '.git' && s.length <= 255);
}
export function normalizePrefix(raw) {
  const p = String(raw ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!p) return { ok: true, value: '' };
  return validRepoPath(p + '/x') ? { ok: true, value: p } : { ok: false, value: p };
}
