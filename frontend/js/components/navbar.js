import { icon, logo } from './icons.js';
import { getSession, login } from '../core/auth-manager.js';
import { CONFIG } from '../config/app-config.js';

// Landing page navigation: reflects real session state.
export async function mountNavbar(el) {
  const s = await getSession();
  el.innerHTML = `<div class="container">
    <a href="/" class="brand">${logo()}<span>CommitCraft</span></a>
    <nav class="links" aria-label="Primary"><a href="#features">Features</a><a href="#how">How it works</a><a href="${CONFIG.GITHUB_URL}" target="_blank" rel="noopener">GitHub</a></nav>
    <span class="spacer"></span>
    ${s.authenticated
      ? `<a class="btn btn-ghost" href="dashboard.html">Dashboard</a><a class="btn btn-primary" href="repositories.html">New publish</a>`
      : `<button class="btn btn-ghost" data-login>Sign in</button><button class="btn btn-primary" data-login>${icon('github', 'icon-sm')}Get started</button>`}
  </div>`;
  el.querySelectorAll('[data-login]').forEach((b) => b.addEventListener('click', login));
  addEventListener('scroll', () => el.classList.toggle('scrolled', scrollY > 8), { passive: true });
  return s;
}
