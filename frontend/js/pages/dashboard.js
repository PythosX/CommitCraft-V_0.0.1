import { bootApp } from '../core/router.js';
import { loadHistory } from '../services/history-service.js';
import { icon } from '../components/icons.js';
import { esc, ago, STATUS, plural } from '../utils/format-utils.js';
import { showError } from '../utils/error-handler.js';
import { resetWizard } from '../core/state-manager.js';

const view = await bootApp('dashboard');
const first = (view.user.name || view.user.login).split(' ')[0];
view.innerHTML = `
  <div class="hello"><div><h1>Welcome, ${esc(first)}</h1><p class="muted" style="margin-top:8px">Pick a folder, shape the commits, publish.</p></div>
    <a class="btn btn-primary btn-lg" id="newBtn" href="repositories.html">${icon('plus')}Start new publishing</a></div>
  <div id="resume"></div>
  <div class="stats" id="stats">${[1, 2, 3].map(() => '<div class="card"><div class="skeleton" style="height:32px;width:60%"></div><div class="skeleton" style="width:40%"></div></div>').join('')}</div>
  <div class="grid cols-2">
    <section><div class="row between" style="margin-bottom:12px"><h2 style="font-size:18px">Recent publishing jobs</h2><a class="link" href="history.html">View all</a></div><div id="jobs" class="list-box"><div class="li" style="padding:16px"><div class="skeleton" style="height:20px;width:100%"></div></div></div></section>
    <section><h2 style="font-size:18px;margin-bottom:12px">Recent repositories</h2><div id="repos" class="list-box"><div style="padding:16px"><div class="skeleton" style="height:20px"></div></div></div></section>
  </div>`;
view.querySelector('#newBtn').addEventListener('click', () => resetWizard(false));

try {
  const h = await loadHistory();
  view.querySelector('#stats').innerHTML = [
    [h.totals.commits, 'Commits created'], [h.totals.files, 'Files published'], [h.totals.jobs, 'Publishing jobs'],
  ].map(([n, l]) => `<div class="card stat"><b>${n.toLocaleString()}</b><span>${l}</span></div>`).join('');

  const open = h.jobs.find((j) => ['uploading', 'ready', 'running', 'paused', 'conflict'].includes(j.status));
  if (open) view.querySelector('#resume').innerHTML = `<div class="notice warn" style="margin-bottom:16px">${icon('clock')}<div style="flex:1"><b>Unfinished publish</b> to ${esc(open.owner)}/${esc(open.repo)} (${open.commits} of ${open.files} files committed).</div><a class="btn btn-sm" href="publishing.html?job=${encodeURIComponent(open.id)}">Review and resume</a></div>`;

  view.querySelector('#jobs').innerHTML = h.jobs.length
    ? h.jobs.slice(0, 5).map((j) => { const [cls, label] = STATUS[j.status] ?? ['', j.status];
        return `<a class="li job-row" href="history.html#${encodeURIComponent(j.id)}"><div style="min-width:0"><div class="name">${esc(j.owner)}/${esc(j.repo)}</div><div class="muted mono" style="font-size:12px">${esc(j.branch)} · ${plural(j.commits, 'commit')}</div></div><span class="muted when" style="font-size:13px">${ago(j.createdAt)}</span><span class="badge ${cls}">${label}</span></a>`; }).join('')
    : `<div class="empty" style="border:0">${icon('publish')}<h3>No publishes yet</h3><p>Your first publish will show up here with every commit.</p><a class="btn btn-primary" href="repositories.html">Start your first publish</a></div>`;

  view.querySelector('#repos').innerHTML = h.recentRepos.length
    ? h.recentRepos.map((r) => `<a class="li" href="https://github.com/${esc(r.fullName)}" target="_blank" rel="noopener">${icon('folder')}<div style="flex:1;min-width:0"><b>${esc(r.fullName)}</b><div class="muted mono" style="font-size:12px">${esc(r.branch)}</div></div>${icon('external', 'icon-sm')}</a>`).join('')
    : `<div class="empty" style="border:0">${icon('folder')}<h3>No repositories yet</h3><p>Repositories you publish to appear here.</p></div>`;
} catch (e) { showError(e, 'Could not load your dashboard.'); view.querySelector('#stats').innerHTML = `<div class="notice err" style="grid-column:1/-1">${icon('alert')}<div>Could not load statistics.</div></div>`; }
