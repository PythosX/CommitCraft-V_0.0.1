import { esc, bytes } from '../utils/format-utils.js';
import { icon } from './icons.js';
import { basename, extname } from '../utils/path-utils.js';
import { fileType } from '../utils/file-utils.js';

export function buildTree(records) {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const r of records) {
    const parts = r.path.split('/'); let n = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join('/');
      if (!n.dirs.has(parts[i])) n.dirs.set(parts[i], { name: parts[i], path: p, dirs: new Map(), files: [] });
      n = n.dirs.get(parts[i]);
    }
    n.files.push(r);
  }
  return root;
}
const all = (n) => [...n.files, ...[...n.dirs.values()].flatMap(all)];
const cmp = { name: (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }), size: (a, b) => b.size - a.size, type: (a, b) => extname(a.path).localeCompare(extname(b.path)) || a.path.localeCompare(b.path) };

export function renderTree(records, { expanded, query = '', sort = 'name', active = null }) {
  const q = query.trim().toLowerCase();
  const list = q ? records.filter((r) => r.path.toLowerCase().includes(q)) : records;
  if (!list.length) return `<div class="empty" style="border:0">No files match.</div>`;
  const root = buildTree(list);
  const fileCmp = cmp[sort] ?? cmp.name;
  const walk = (n, depth) => {
    let h = '';
    const dirs = [...n.dirs.values()].sort((a, b) => (sort === 'size' ? all(b).reduce((s, f) => s + f.size, 0) - all(a).reduce((s, f) => s + f.size, 0) : a.name.localeCompare(b.name)));
    for (const d of dirs) {
      const fs = all(d), sel = fs.filter((f) => f.state === 'selected').length;
      const open = q || expanded.has(d.path);
      h += `<div class="tree-row" style="padding-left:${8 + depth * 18}px" data-dir="${esc(d.path)}">
        <button class="twisty" aria-expanded="${!!open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(d.name)}" data-toggle="${esc(d.path)}">${icon('right', 'icon-sm')}</button>
        <label class="check"><input type="checkbox" data-dircheck="${esc(d.path)}" ${sel === fs.length ? 'checked' : ''} aria-label="Select folder ${esc(d.name)}" data-indeterminate="${sel > 0 && sel < fs.length}"></label>
        ${icon('folder', 'icon-sm')}<span class="name">${esc(d.name)}/</span><span class="size">${sel}/${fs.length}</span></div>`;
      if (open) h += walk(d, depth + 1);
    }
    for (const f of [...n.files].sort(fileCmp)) {
      h += `<div class="tree-row ${active === f.path ? 'active' : ''}" style="padding-left:${8 + depth * 18 + 26}px" data-file="${esc(f.path)}">
        <label class="check"><input type="checkbox" data-filecheck="${esc(f.path)}" ${f.state === 'selected' ? 'checked' : ''} aria-label="Select ${esc(basename(f.path))}"></label>
        <button class="name" data-open="${esc(f.path)}" title="${esc(f.path)}">${esc(q ? f.path : basename(f.path))}</button>
        ${f.warning ? `<span class="badge warn" title="${esc(f.warning)}">${icon('warn', 'icon-sm')}</span>` : ''}
        <span class="badge hide-sm">${esc(fileType(f.path))}</span><span class="size">${bytes(f.size)}</span></div>`;
    }
    return h;
  };
  return `<div class="tree" role="tree">${walk(root, 0)}</div>`;
}
export function fixIndeterminate(el) { el.querySelectorAll('[data-indeterminate="true"]').forEach((i) => { i.indeterminate = true; }); }
