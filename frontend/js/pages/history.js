import { bootApp } from '../core/router.js';
import { loadHistory, loadJob } from '../services/history-service.js';
import { commitCard } from '../components/commit-card.js';
import { icon } from '../components/icons.js';
import { esc, STATUS, dateTime, duration, plural } from '../utils/format-utils.js';
import { showError, explain } from '../utils/error-handler.js';

const view = await bootApp('history');
view.innerHTML = `<div class="page-head"><div><h1>Publishing history</h1><p>Every publish, with its commits.</p></div>
  <div class="field" style="min-width:190px"><label for="flt" class="sr-only">Filter by status</label><select class="select" id="flt"><option value="">All statuses</option>${['completed', 'partial', 'failed', 'cancelled'].map((s) => `<option value="${s}">${STATUS[s][1]}</option>`).join('')}</select></div></div>
  <div id="list" class="list-box"><div style="padding:16px"><div class="skeleton" style="height:24px"></div></div></div>`;
const $ = (s) => view.querySelector(s);
let jobs = [];

function draw() {
  const f = $('#flt').value, list = jobs.filter((j) => !f || j.status === f);
  $('#list').innerHTML = list.length ? list.map((j) => { const [cls, label] = STATUS[j.status] ?? ['', j.status];
    return `<div class="hist" data-id="${esc(j.id)}" id="${esc(j.id)}"><button class="li job-row" style="width:100%;text-align:left" aria-expanded="false" data-open="${esc(j.id)}">
      <div style="min-width:0"><div class="name">${esc(j.owner)}/${esc(j.repo)} <span class="badge mono">${icon('branch', 'icon-sm')}${esc(j.branch)}</span></div>
      <div class="muted" style="font-size:12.5px">${dateTime(j.createdAt)} · ${plural(j.files, 'file')} · ${plural(j.commits, 'commit')}${j.failed ? ` · ${j.failed} failed` : ''} · ${duration(j.durationMs)}</div></div>
      <span class="badge ${cls}">${label}</span>${icon('down', 'icon-sm')}</button><div class="hist-detail" hidden></div></div>`; }).join('')
    : `<div class="empty" style="border:0">${icon('history')}<h3>${jobs.length ? 'No jobs with that status' : 'No publishing history yet'}</h3><p>${jobs.length ? 'Try another filter.' : 'Completed publishes appear here with links to every commit.'}</p>${jobs.length ? '' : '<a class="btn btn-primary" href="repositories.html">Start new publishing</a>'}</div>`;
}
$('#flt').addEventListener('change', draw);
$('#list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-open]'); if (!b) return;
  const box = b.parentElement.querySelector('.hist-detail'), open = b.getAttribute('aria-expanded') === 'true';
  b.setAttribute('aria-expanded', !open); box.hidden = open; if (open || box.dataset.loaded) return;
  box.innerHTML = '<div class="skeleton" style="height:40px"></div>';
  const j = jobs.find((x) => x.id === b.dataset.open), repoUrl = `https://github.com/${j.owner}/${j.repo}`;
  const actions = `<div class="row wrap" style="margin-bottom:12px"><a class="btn btn-sm" href="${repoUrl}/commits/${encodeURIComponent(j.branch)}" target="_blank" rel="noopener">${icon('external', 'icon-sm')}Open repository history</a>${['uploading', 'ready', 'paused', 'conflict', 'running', 'partial', 'failed'].includes(j.status) ? `<a class="btn btn-sm btn-primary" href="publishing.html?job=${encodeURIComponent(j.id)}">Open and resume</a>` : ''}</div>`;
  try { const full = await loadJob(j.id); box.innerHTML = actions + `<ol class="list-box commit-rail">${full.items.map((i) => commitCard(i)).join('')}</ol>`; box.dataset.loaded = '1'; }
  catch (err) { box.innerHTML = actions + `<div class="notice info">${icon('info')}<div>${err.status === 404 ? 'Commit details are kept for 30 days and have expired.' : esc(explain(err))}</div></div>`; }
});
try { jobs = (await loadHistory()).jobs; draw(); const id = decodeURIComponent(location.hash.slice(1)); if (id) { const el = document.getElementById(id)?.querySelector('[data-open]'); el?.click(); el?.scrollIntoView({ block: 'center' }); } }
catch (e) { showError(e); $('#list').innerHTML = `<div class="empty" style="border:0">${icon('alert')}<h3>Could not load history</h3><p>${esc(explain(e))}</p></div>`; }
