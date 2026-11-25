import { esc } from '../utils/format-utils.js';

export function openDialog(html, { label = 'Dialog', onClose } = {}) {
  const prev = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
  document.body.append(overlay);
  const dialog = overlay.firstElementChild;
  const focusables = () => [...dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled);
  const close = (val) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); prev?.focus?.(); onClose?.(val); };
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
    if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(undefined); });
  (dialog.querySelector('[autofocus]') || focusables()[0])?.focus();
  return { el: dialog, close };
}

export function confirmDialog({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = openDialog(`<h2>${esc(title)}</h2><div class="muted">${body}</div>
      <div class="actions"><button class="btn" data-x="0">${esc(cancelText)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="1" autofocus>${esc(confirmText)}</button></div>`,
      { label: title, onClose: (v) => resolve(v === true) });
    d.el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => d.close(b.dataset.x === '1')));
  });
}
