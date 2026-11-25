import { icon } from './icons.js';
import { api } from '../core/api-client.js';

export function applyTheme(theme, persist = true) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  try { theme === 'system' ? localStorage.removeItem('cc-theme') : localStorage.setItem('cc-theme', theme); } catch { /* ignore */ }
  if (persist) api.put('/api/settings', { theme }).catch(() => {});
}
export const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'system';

// Opens a menu under `button`. items: [{label, icon, onClick, href} | 'sep']
export function dropdown(button, items) {
  const anchor = button.parentElement; anchor.classList.add('menu-anchor');
  let menu;
  const close = () => { menu?.remove(); menu = null; button.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', onKey, true); };
  const outside = (e) => { if (!menu?.contains(e.target) && e.target !== button && !button.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); button.focus(); return; }
    const els = [...menu.querySelectorAll('.item')]; const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length].focus(); }
  };
  button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    if (menu) return close();
    menu = document.createElement('div'); menu.className = 'menu'; menu.setAttribute('role', 'menu');
    for (const it of typeof items === 'function' ? items() : items) {
      if (it === 'sep') { menu.append(document.createElement('hr')); continue; }
      const el = document.createElement(it.href ? 'a' : 'button');
      el.className = 'item'; el.setAttribute('role', 'menuitem');
      if (it.href) { el.href = it.href; if (it.external) { el.target = '_blank'; el.rel = 'noopener'; } }
      el.innerHTML = `${it.icon ? icon(it.icon, 'icon-sm') : ''}<span>${it.label}</span>`;
      el.addEventListener('click', () => { close(); it.onClick?.(); });
      menu.append(el);
    }
    anchor.append(menu); button.setAttribute('aria-expanded', 'true');
    menu.querySelector('.item')?.focus();
    setTimeout(() => { document.addEventListener('click', outside, true); document.addEventListener('keydown', onKey, true); });
  });
}
