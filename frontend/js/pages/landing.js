import { mountNavbar } from '../components/navbar.js';
import { icon } from '../components/icons.js';
import { login } from '../core/auth-manager.js';
import { CONFIG } from '../config/app-config.js';
import { esc } from '../utils/format-utils.js';

const session = await mountNavbar(document.getElementById('nav'));
document.getElementById('ghLink').href = CONFIG.GITHUB_URL;

const go = () => (session.authenticated ? (location.href = 'repositories.html') : login());
['startBtn', 'startBtn2'].forEach((id) => document.getElementById(id).addEventListener('click', go));

// Auth errors arrive as ?auth_error=code from the OAuth callback.
const ERR = {
  access_denied: 'GitHub sign-in was cancelled. Nothing was connected.',
  invalid_state: 'We could not verify that sign-in attempt, so it was stopped. Try signing in again.',
  exchange_failed: 'GitHub did not complete the sign-in. Try again in a moment.',
  missing_code: 'GitHub did not return an authorization code. Try again.',
  github_error: 'GitHub reported an error during sign-in. Try again.',
  expired: 'Your session expired. Sign in again to continue.',
  signin_required: 'Sign in to open that page.',
};
const code = new URLSearchParams(location.search).get('auth_error');
if (code) {
  const el = document.getElementById('authError');
  el.hidden = false;
  el.className = 'auth-error notice err';
  el.setAttribute('role', 'alert');
  el.innerHTML = `${icon('alert')}<div>${esc(ERR[code] ?? 'Sign-in failed. Try again.')}</div>`;
  history.replaceState(null, '', location.pathname);
}

const FEATURES = [
  ['commit', 'File-by-file commits', 'Every selected file becomes its own genuine Git commit, parented on the one before it.'],
  ['edit', 'Custom commit messages', 'Pick a template, then edit any message. Nothing is generated behind your back.'],
  ['folder', 'Folder-aware publishing', 'Nested folders keep their paths. Existing repository files are never removed.'],
  ['shield', 'Secure GitHub connection', 'Standard OAuth with CSRF protection. Your token stays on the server, encrypted, never in the browser.'],
  ['zap', 'Live publishing progress', 'See each commit and its SHA as it lands on GitHub, with a link to every one.'],
  ['retry', 'Resume interrupted publishing', 'Closed the tab or lost connection? Resume without creating duplicate commits.'],
];
document.getElementById('featureGrid').innerHTML = FEATURES.map(([i, t, d]) => `<div class="feature">${icon(i)}<h3>${t}</h3><p>${d}</p></div>`).join('');

// The hero's moment: files of a sample folder turn into commits on a rail, then loop.
const SAMPLE = [['index.html', 'Add index.html'], ['style.css', 'Add style.css'], ['script.js', 'Add script.js'], ['assets/logo.svg', 'Add assets/logo.svg'], ['README.md', 'Add README.md']];
const rail = document.getElementById('rail');
rail.innerHTML = SAMPLE.map(([f, m]) => `<li><span class="file">${f}</span><span class="msg">${m}</span></li>`).join('');
const rows = [...rail.children];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const paint = (n) => {
  rows.forEach((r, i) => { r.classList.toggle('done', i < n); r.classList.toggle('now', i === n); });
  rail.style.setProperty('--fill', Math.min(1, n / (rows.length - 1)));
};
if (reduce) paint(rows.length);
else {
  let n = 0;
  const tick = () => { paint(n); n++; if (n > rows.length) { n = 0; setTimeout(tick, 1800); } else setTimeout(tick, 820); };
  setTimeout(tick, 500);
}
