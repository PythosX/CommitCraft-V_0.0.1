import { extname, basename } from './path-utils.js';
import { CONFIG } from '../config/app-config.js';

const TEXT_EXT = new Set(['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'json', 'md', 'markdown', 'txt', 'svg', 'xml', 'yml', 'yaml', 'toml', 'ts', 'tsx', 'jsx', 'py', 'csv', 'sh', 'ini', 'gitignore', 'env', 'lock']);
const LABELS = { html: 'HTML', htm: 'HTML', css: 'CSS', js: 'JavaScript', mjs: 'JavaScript', json: 'JSON', md: 'Markdown', txt: 'Text', svg: 'SVG', png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', webp: 'Image', ico: 'Icon', pdf: 'PDF', zip: 'Archive', woff2: 'Font', woff: 'Font', ttf: 'Font', mp4: 'Video', mp3: 'Audio', ts: 'TypeScript', py: 'Python' };
export const fileType = (p) => LABELS[extname(p)] || (extname(p) ? extname(p).toUpperCase() : 'File');
export const isPreviewable = (p) => TEXT_EXT.has(extname(p)) || ['.gitignore', 'LICENSE', 'Makefile', 'Dockerfile'].includes(basename(p));

// ── ignore engine (.gitignore-compatible subset: comments, !negation, trailing /, leading /, *, **, ?) ──
export const DEFAULT_IGNORE = ['.git/', 'node_modules/', '.env', '.env.*', '!.env.example', '!.env.sample', '!.env.template', 'dist/', 'build/', '.next/', '.vercel/', '__pycache__/', '.DS_Store', 'Thumbs.db'];

function globToRegex(g) {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { if (g[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i += 1; } } else r += '[^/]*';
    } else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return r;
}
export function compileRule(line, source) {
  let raw = line.replace(/\r$/, '').replace(/(?<!\\)\s+$/, '');
  if (!raw || raw.startsWith('#')) return null;
  const neg = raw.startsWith('!'); if (neg) raw = raw.slice(1);
  const dirOnly = raw.endsWith('/'); if (dirOnly) raw = raw.slice(0, -1);
  const anchored = raw.includes('/'); raw = raw.replace(/^\//, '');
  if (!raw) return null;
  const body = globToRegex(raw);
  const re = new RegExp(`^${anchored ? '' : '(?:.*/)?'}${body}${dirOnly ? '/.*' : '(?:/.*)?'}$`);
  return { re, neg, line, source };
}
export function buildRules({ custom = [], gitignoreText = '' } = {}) {
  const rules = [];
  DEFAULT_IGNORE.forEach((l) => { const r = compileRule(l, 'Default rule'); if (r) rules.push(r); });
  gitignoreText.split('\n').forEach((l) => { const r = compileRule(l, '.gitignore'); if (r) rules.push(r); });
  custom.forEach((l) => { const r = compileRule(l, 'Custom pattern'); if (r) rules.push(r); });
  return rules;
}
export function evaluate(path, rules) {
  let hit = null;
  for (const r of rules) if (r.re.test(path)) hit = r.neg ? null : r;
  return hit ? { ignored: true, reason: `${hit.source}: ${hit.line}` } : { ignored: false };
}

const SENSITIVE = [
  [/(^|\/)\.env(\..+)?$/i, 'Environment file that may contain secrets', (p) => !/\.(example|sample|template)$/i.test(p)],
  [/\.(pem|key|p12|pfx|jks|keystore|kdbx)$/i, 'Private key or keystore'],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, 'SSH key'],
  [/(^|\/)(credentials|secrets?)(\.|$)/i, 'Name suggests credentials'],
  [/(^|\/)\.(npmrc|pypirc|htpasswd|netrc)$/i, 'Credentials config file'],
];
export function sensitiveReason(path) {
  for (const [re, why, extra] of SENSITIVE) if (re.test(path) && (!extra || extra(path))) return why;
  return null;
}

export async function gitBlobSha(blob) {
  const body = new Uint8Array(await blob.arrayBuffer());
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
  const d = await crypto.subtle.digest('SHA-1', all);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export const tooLarge = (size) => size > CONFIG.MAX_FILE_BYTES;
