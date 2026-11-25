import { icon, logo } from './icons.js';
import { esc } from '../utils/format-utils.js';
import { dropdown, applyTheme, currentTheme } from './dropdown.js';
import { logout } from '../core/auth-manager.js';

const NAV = [
  ['dashboard', 'dashboard.html', 'Dashboard', 'dashboard'],
  ['publish', 'repositories.html', 'New Publish', 'publish'],
  ['history', 'history.html', 'Publishing History', 'history'],
  ['settings', 'settings.html', 'Settings', 'settings'],
];
const FLOW = ['publish', 'repositories', 'upload', 'commit-plan', 'publishing'];

export function mountShell({ active, user }) {
  const root = document.getElementById('shell');
  const cur = FLOW.includes(active) ? 'publish' : active;
  root.className = 'app-shell page-in';
  root.innerHTML = `
    <a class="skip" href="#content">Skip to content</a>
    <aside class="sidebar" id="sidebar" aria-label="Main">
      <a href="dashboard.html" class="brand">${logo()}<span>CommitCraft</span></a>
      <nav>${NAV.map(([ic, href, label, key]) => `<a class="nav-link" href="${href}" ${key === cur ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>
      <div class="foot">Every file. A meaningful commit.</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon mobile-menu" id="menuBtn" aria-label="Open menu" aria-controls="sidebar">${icon('menu')}</button>
        <span class="badge ok hide-sm" title="Signed in with GitHub"><span class="dot"></span>Connected</span>
        <span class="muted hide-sm">@${esc(user.login)}</span>
        <span class="grow"></span>
        <div><button class="btn btn-ghost btn-icon" id="themeBtn" aria-label="Change theme">${icon('sun')}</button></div>
        <div><button class="btn btn-ghost" id="userBtn" aria-label="Account menu"><img class="avatar" src="${esc(user.avatar)}" alt="" width="32" height="32" referrerpolicy="no-referrer"/><span class="hide-sm">${esc(user.name || user.login)}</span>${icon('down', 'icon-sm')}</button></div>
      </header>
      <main class="content" id="content" tabindex="-1"></main>
    </div>`;
  const sb = root.querySelector('#sidebar');
  root.querySelector('#menuBtn').addEventListener('click', () => sb.classList.toggle('open'));
  document.addEventListener('click', (e) => { if (sb.classList.contains('open') && !sb.contains(e.target) && !e.target.closest('#menuBtn')) sb.classList.remove('open'); });
  const themeBtn = root.querySelector('#themeBtn');
  const sync = () => { const t = currentTheme(); themeBtn.innerHTML = icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor'); themeBtn.title = `Theme: ${t}`; };
  sync();
  themeBtn.addEventListener('click', () => { const order = ['system', 'dark', 'light']; applyTheme(order[(order.indexOf(currentTheme()) + 1) % 3]); sync(); });
  dropdown(root.querySelector('#userBtn'), [
    { label: 'GitHub profile', icon: 'github', href: user.profileUrl, external: true },
    { label: 'Settings', icon: 'settings', href: 'settings.html' },
    'sep',
    { label: 'Sign out', icon: 'logout', onClick: logout },
  ]);
  return root.querySelector('#content');
}
