import { basename, dirname } from '../utils/path-utils.js';

export const TEMPLATES = [
  { id: 'add', label: 'Add {filename}', verb: 'Add' },
  { id: 'create', label: 'Create {filename}', verb: 'Create' },
  { id: 'update', label: 'Update {filename}', verb: 'Update' },
  { id: 'folder', label: 'Add {folder} file: {filename}', verb: 'Add' },
];

// {filename} is the file's path inside the repository (assets/logo.svg); in the folder template it is the bare name,
// because {folder} already carries the directory. Files that already exist on the branch always say "Update".
export function renderMessage(tplId, path, action = 'add') {
  const t = TEMPLATES.find((x) => x.id === tplId) ?? TEMPLATES[0];
  const verb = action === 'update' ? 'Update' : t.verb;
  if (t.id === 'folder') {
    const folder = dirname(path) || 'root';
    return `${verb} ${folder} file: ${basename(path)}`;
  }
  return `${verb} ${path}`;
}

export function orderFiles(list, order) {
  const l = [...list];
  const byPath = (a, b) => a.path.localeCompare(b.path, undefined, { numeric: true });
  if (order === 'size-asc') return l.sort((a, b) => a.size - b.size || byPath(a, b));
  if (order === 'folders-first') return l.sort((a, b) => (a.path.includes('/') === b.path.includes('/') ? byPath(a, b) : a.path.includes('/') ? -1 : 1));
  if (order === 'selection') return l;
  return l.sort(byPath);
}
