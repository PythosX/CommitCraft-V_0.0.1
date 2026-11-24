// Reads folders from drag-and-drop (FileSystemEntry) or <input webkitdirectory>.
// node_modules and .git are never descended into: thousands of files that would be excluded anyway.
const SKIP_DIRS = new Set(['node_modules', '.git']);

function readEntries(reader) {
  return new Promise((res, rej) => reader.readEntries(res, rej));
}
const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));

async function walk(entry, out, skipped, onProgress) {
  if (entry.isFile) {
    const file = await fileOf(entry);
    out.push({ path: entry.fullPath.replace(/^\//, ''), file });
    if (out.length % 25 === 0) onProgress?.(out.length);
  } else if (entry.isDirectory) {
    if (SKIP_DIRS.has(entry.name)) { skipped.push(entry.fullPath.replace(/^\//, '')); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await readEntries(reader);
      if (!batch.length) break;
      for (const e of batch) await walk(e, out, skipped, onProgress);
    }
  }
}

export async function scanDrop(dataTransfer, onProgress) {
  const entries = [...dataTransfer.items].filter((i) => i.kind === 'file').map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  const out = [], skipped = [];
  for (const e of entries) await walk(e, out, skipped, onProgress);
  return finish(out, skipped, entries.length === 1 && entries[0].isDirectory);
}

export function scanInput(fileList) {
  const out = [], skipped = new Set();
  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name;
    const hit = path.split('/').slice(0, -1).find((s) => SKIP_DIRS.has(s));
    if (hit) { skipped.add(path.slice(0, path.indexOf(hit) + hit.length)); continue; }
    out.push({ path, file });
  }
  return finish(out, [...skipped], true);
}

// Drops the common root folder so index.html lands at the repo root (users can add a prefix later).
function finish(items, skipped, hasRoot) {
  let root = '';
  if (hasRoot && items.length && items.every((i) => i.path.includes('/') && i.path.split('/')[0] === items[0].path.split('/')[0])) root = items[0].path.split('/')[0];
  const strip = (p) => (root ? p.slice(root.length + 1) : p);
  const seen = new Set();
  const records = [];
  for (const i of items) {
    const path = strip(i.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    records.push({ path, size: i.file.size, type: i.file.type, lastModified: i.file.lastModified, blob: i.file, state: 'selected', reason: null, warning: null });
  }
  return { records, skippedDirs: skipped.map((s) => (root ? s.slice(root.length + 1) : s)), rootName: root };
}

export const folderCount = (records) => new Set(records.flatMap((r) => { const p = r.path.split('/'); return p.slice(0, -1).map((_, i) => p.slice(0, i + 1).join('/')); })).size;
