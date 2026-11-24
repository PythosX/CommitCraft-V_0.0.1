import { LIMITS } from '../config/env.js';
import { validateRepoPath } from './path-validator.js';
import { badRequest } from './response.js';

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function assertOwner(v) {
  if (typeof v !== 'string' || !OWNER_RE.test(v)) throw badRequest('Invalid repository owner.');
  return v;
}
export function assertRepoName(v) {
  if (typeof v !== 'string' || !REPO_RE.test(v) || v === '.' || v === '..' || v.endsWith('.git'))
    throw badRequest('Repository names may use letters, numbers, ".", "-" and "_" (max 100 characters).');
  return v;
}
// Subset of git-check-ref-format rules, strict enough for branch names.
export function assertBranch(v) {
  const bad =
    typeof v !== 'string' || v.length < 1 || v.length > 200 ||
    /[\u0000-\u0020\u007f~^:?*\[\\]/.test(v) || v.includes('..') || v.includes('@{') || v === '@' ||
    v.startsWith('/') || v.endsWith('/') || v.includes('//') || v.endsWith('.') || v.endsWith('.lock') ||
    v.split('/').some((s) => s.startsWith('.') || s.endsWith('.lock'));
  if (bad) throw badRequest('Invalid branch name.');
  return v;
}
export function assertMessage(v) {
  if (typeof v !== 'string') throw badRequest('Commit message must be text.');
  const m = v.trim();
  if (!m) throw badRequest('Commit message cannot be empty.');
  if (m.length > LIMITS.maxMessageLength) throw badRequest(`Commit message is longer than ${LIMITS.maxMessageLength} characters.`);
  if (/\u0000/.test(m)) throw badRequest('Commit message contains invalid characters.');
  return m;
}

export function validateJobInput(body) {
  if (!body || typeof body !== 'object') throw badRequest('Request body must be JSON.');
  const owner = assertOwner(body.owner);
  const repo = assertRepoName(body.repo);
  const branch = assertBranch(body.branch);
  const createBranch = body.createBranch === true;
  const baseBranch = createBranch && body.baseBranch ? assertBranch(body.baseBranch) : null;
  if (!Array.isArray(body.items) || body.items.length === 0) throw badRequest('Add at least one file to publish.');
  if (body.items.length > LIMITS.maxFilesPerJob) throw badRequest(`V1 supports up to ${LIMITS.maxFilesPerJob} files per publish.`);
  const seen = new Set();
  const items = body.items.map((raw, index) => {
    const p = validateRepoPath(raw?.path, LIMITS.maxPathLength);
    if (!p.ok) throw badRequest(`${raw?.path ?? 'Path'}: ${p.reason}`);
    if (seen.has(p.path)) throw badRequest(`Duplicate path: ${p.path}`);
    seen.add(p.path);
    const action = raw.action;
    if (!['add', 'update', 'skip'].includes(action)) throw badRequest(`${p.path}: unknown action.`);
    const size = raw.size;
    if (!Number.isInteger(size) || size < 0 || size > LIMITS.maxFileBytes)
      throw badRequest(`${p.path}: file size must be between 0 and ${LIMITS.maxFileBytes / 1048576} MB.`);
    const message = action === 'skip' ? String(raw.message ?? 'Skipped').slice(0, 200) : assertMessage(raw.message);
    const item = { index, path: p.path, size, action, message, blobSha: null,
      status: action === 'skip' ? 'skipped' : 'waiting', commitSha: null, commitUrl: null, error: null };
    if (action === 'skip') item.skipReason = String(raw.skipReason ?? 'Skipped').slice(0, 120);
    return item;
  });
  if (!items.some((i) => i.action !== 'skip')) throw badRequest('Every selected file is unchanged, so there is nothing to commit.');
  return { owner, repo, branch, createBranch, baseBranch, items };
}

// Exact decoded byte length of a base64 string (no decoding needed). -1 if malformed.
export function base64ByteLength(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return -1;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

export const THEMES = ['system', 'dark', 'light'];
export const TEMPLATES = ['add', 'create', 'update', 'folder'];
export const ORDERS = ['path', 'folders-first', 'size-asc', 'selection'];
export const DEFAULT_SETTINGS = { theme: 'system', defaultTemplate: 'add', defaultOrder: 'path', useGitignore: true, customIgnore: [] };

export function validateSettings(body) {
  if (!body || typeof body !== 'object') throw badRequest('Settings must be an object.');
  const out = {};
  if ('theme' in body) { if (!THEMES.includes(body.theme)) throw badRequest('Unknown theme.'); out.theme = body.theme; }
  if ('defaultTemplate' in body) { if (!TEMPLATES.includes(body.defaultTemplate)) throw badRequest('Unknown template.'); out.defaultTemplate = body.defaultTemplate; }
  if ('defaultOrder' in body) { if (!ORDERS.includes(body.defaultOrder)) throw badRequest('Unknown commit order.'); out.defaultOrder = body.defaultOrder; }
  if ('useGitignore' in body) out.useGitignore = body.useGitignore === true;
  if ('customIgnore' in body) {
    if (!Array.isArray(body.customIgnore) || body.customIgnore.length > 50) throw badRequest('Up to 50 ignore patterns are allowed.');
    out.customIgnore = body.customIgnore.map((p) => {
      if (typeof p !== 'string' || p.length > 200) throw badRequest('Ignore patterns must be text under 200 characters.');
      return p.trim();
    }).filter(Boolean);
  }
  return out;
}
