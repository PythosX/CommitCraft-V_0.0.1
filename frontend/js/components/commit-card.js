import { esc, shortSha } from '../utils/format-utils.js';

const LABEL = { waiting: 'Waiting', processing: 'Processing', committing: 'Committing', completed: 'Completed', failed: 'Failed', skipped: 'Skipped' };
const BADGE = { waiting: '', processing: 'accent', committing: 'accent', completed: 'ok', failed: 'err', skipped: '' };

export function commitCard(item, status = item.status) {
  const right = status === 'completed' && item.commitSha
    ? `<a class="sha" href="${esc(item.commitUrl)}" target="_blank" rel="noopener" title="Open commit on GitHub">${shortSha(item.commitSha)}</a>`
    : `<span class="badge ${BADGE[status] ?? ''}">${LABEL[status] ?? status}</span>`;
  const sub = status === 'failed' && item.error ? `<div class="err">${esc(item.error.message)}</div>`
    : status === 'skipped' ? `<div class="sub">${esc(item.skipReason || 'Identical to the file already on this branch')}</div>`
    : `<div class="sub">${esc(item.message)}</div>`;
  return `<li class="commit-card" data-i="${item.index}" data-status="${status}">
    <div class="node"><i></i></div>
    <div style="min-width:0"><div class="title">${esc(item.path)} ${item.action === 'update' ? '<span class="badge warn">update</span>' : ''}</div>${sub}</div>
    <div class="row">${right}</div></li>`;
}
export function updateCard(listEl, item) {
  const old = listEl.querySelector(`[data-i="${item.index}"]`);
  if (!old) return;
  const t = document.createElement('template'); t.innerHTML = commitCard(item).trim();
  old.replaceWith(t.content.firstElementChild);
}
