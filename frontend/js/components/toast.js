import { esc } from '../utils/format-utils.js';
import { icon } from './icons.js';
let box;
export function toast(message, type = 'info', ms = 5000) {
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<div>${esc(message)}</div>`;
  box.append(el);
  const kill = () => { el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
  setTimeout(kill, ms); el.addEventListener('click', kill);
  return kill;
}
