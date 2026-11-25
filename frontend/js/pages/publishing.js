import { bootApp, go } from '../core/router.js';
import { getWizard, patchWizard, resetWizard } from '../core/state-manager.js';
import { getJob, cancelJob, uploadMissing, drive } from '../services/publishing-service.js';
import { loadHistory } from '../services/history-service.js';
import { commitCard, updateCard } from '../components/commit-card.js';
import { progressBar } from '../components/progress-bar.js';
import { confirmDialog } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { esc, STATUS, duration, plural } from '../utils/format-utils.js';
import { explain } from '../utils/error-handler.js';

const view = await bootApp('publishing');
const wiz = await getWizard();
let jobId = new URLSearchParams(location.search).get('job') || wiz.jobId;
if (!jobId) { // recover the most recent unfinished publish
  try { jobId = (await loadHistory()).jobs.find((j) => ['uploading', 'ready', 'running', 'paused', 'conflict'].includes(j.status))?.id; } catch { /* fall through */ }
}
if (!jobId) { view.innerHTML = `<div class="empty">${icon('publish')}<h3>Nothing is being published</h3><p>Start a new publish to see live progress here.</p><a class="btn btn-primary" href="repositories.html">Start new publishing</a></div>`; await new Promise(() => {}); }

view.innerHTML = `<nav class="stepper" aria-label="Progress"><span class="done"><b>1</b>Repository</span><span class="done"><b>2</b>Upload</span><span class="done"><b>3</b>Plan</span><span class="on" aria-current="step"><b>4</b>Publish</span></nav>
  <div class="pub-head"><div><div class="row wrap"><h1 id="title">Publishing…</h1><span class="badge" id="state"></span></div><p class="muted mono" id="target" style="margin-top:6px"></p></div><div class="row" id="controls"></div></div>
  <div class="panel"><div class="row between wrap" style="margin-bottom:12px"><div><span class="pub-big" id="done">0</span><span class="muted" style="font-size:20px"> / <span id="total">0</span> files</span></div><b id="pct" style="font-size:20px">0%</b></div><div id="bar"></div>
    <div class="pub-metrics"><div class="card stat"><b id="mDone">0</b><span>Completed</span></div><div class="card stat"><b id="mFail">0</b><span>Failed</span></div><div class="card stat"><b id="mSpeed">–</b><span>Commits / min</span></div><div class="card stat"><b id="mEta">–</b><span>Time remaining</span></div></div>
    <div class="current" id="current" aria-live="polite"></div></div>
  <div id="banner" style="margin-top:16px"></div>
  <h2 style="font-size:18px;margin:24px 0 12px">Commits</h2><div class="list-box rail-scroll"><ol class="commit-rail" id="rail"></ol></div>`;
const $ = (s) => view.querySelector(s);
const bar = progressBar($('#bar'));
let job = null, running = false, ac = null; const stamps = [];

const FINISHED = ['completed', 'failed', 'partial', 'cancelled'];
addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });

function paint() {
  const c = job.items.filter((i) => i.action !== 'skip'), done = c.filter((i) => i.status === 'completed').length, failed = c.filter((i) => i.status === 'failed').length;
  const [cls, label] = running ? ['accent', 'Publishing'] : STATUS[job.status] ?? ['', job.status];
  $('#state').className = `badge ${cls}`; $('#state').innerHTML = `<span class="dot"></span>${label}`;
  $('#target').textContent = `${job.owner}/${job.repo} · ${job.branch}`;
  $('#title').textContent = job.status === 'completed' ? 'Published' : FINISHED.includes(job.status) ? 'Publish ended' : 'Publishing…';
  $('#done').textContent = done; $('#total').textContent = c.length; $('#mDone').textContent = done; $('#mFail').textContent = failed;
  const pct = c.length ? (done / c.length) * 100 : 0; $('#pct').textContent = Math.round(pct) + '%';
  bar.set(pct, job.status === 'completed' ? 'ok' : failed ? 'bad' : '');
  if (stamps.length >= 3) { const rate = ((stamps.length - 1) / ((stamps.at(-1) - stamps[0]) / 60000)); const left = c.filter((i) => ['waiting', 'committing'].includes(i.status)).length;
    $('#mSpeed').textContent = rate.toFixed(rate < 10 ? 1 : 0); $('#mEta').textContent = left && running ? duration((left / rate) * 60000) : '–'; }
  if (!running) $('#mEta').textContent = '–';
  banner(); controls();
}
function drawRail() { $('#rail').innerHTML = job.items.map((i) => commitCard(i)).join(''); }
function setCurrent(item, text) {
  $('#current').innerHTML = item ? `<span class="spinner"></span><div style="min-width:0"><div class="mono">${esc(item.path)}</div><div class="muted" style="font-size:13px">${esc(item.message)}</div></div>` : `<span class="muted">${esc(text ?? 'Idle')}</span>`;
}
function banner() {
  const b = $('#banner'), repoUrl = `https://github.com/${job.owner}/${job.repo}`;
  const failed = job.items.filter((i) => i.status === 'failed').length;
  if (running) { b.innerHTML = ''; return; }
  if (job.status === 'completed') b.innerHTML = `<div class="notice ok done-banner">${icon('check')}<div style="flex:1"><b>All ${plural(job.items.filter((i) => i.status === 'completed').length, 'commit')} are on GitHub.</b> ${job.counts.skipped ? `${plural(job.counts.skipped, 'file')} skipped because they were already identical.` : ''}</div><div class="row wrap"><a class="btn btn-sm" href="${repoUrl}/commits/${encodeURIComponent(job.branch)}" target="_blank" rel="noopener">${icon('commit', 'icon-sm')}View commits</a><a class="btn btn-sm btn-primary" href="${repoUrl}/tree/${encodeURIComponent(job.branch)}" target="_blank" rel="noopener">Open repository</a></div></div>`;
  else if (job.status === 'conflict') b.innerHTML = `<div class="notice warn">${icon('warn')}<div><b>The branch changed while publishing.</b> Someone else pushed to <code>${esc(job.branch)}</code>, so CommitCraft stopped. Nothing was overwritten. You can continue on top of the latest commits.</div></div>`;
  else if (job.status === 'paused' || (job.status === 'failed' && job.error)) b.innerHTML = `<div class="notice ${job.status === 'paused' ? 'warn' : 'err'}">${icon('alert')}<div><b>${job.status === 'paused' ? 'Publishing paused.' : 'Publishing stopped.'}</b> ${esc(job.error?.message ?? '')} Commits already created are safe.${job.error?.code === 'auth_expired' ? ' <a class="link" href="/">Sign in again</a> and resume from history.' : ''}</div></div>`;
  else if (job.status === 'partial' || failed) b.innerHTML = `<div class="notice warn">${icon('warn')}<div>${plural(failed, 'file')} could not be committed. The others are published. Retry the failed files below.</div></div>`;
  else if (job.status === 'cancelled') b.innerHTML = `<div class="notice info">${icon('info')}<div>Publishing was cancelled. Commits already created remain on GitHub.</div></div>`;
  else b.innerHTML = '';
}
function controls() {
  const c = $('#controls'), failed = job.items.some((i) => i.status === 'failed'); c.innerHTML = '';
  const add = (html, cls, fn) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.innerHTML = html; b.addEventListener('click', fn); c.append(b); };
  if (running) add(`${icon('x')}Cancel`, 'btn-danger', doCancel);
  else if (['paused', 'failed'].includes(job.status) && job.items.some((i) => i.status === 'waiting')) add(`${icon('play')}Resume`, 'btn-primary', () => run('resume'));
  else if (job.status === 'conflict') { add(`${icon('play')}Continue on latest`, 'btn-primary', async () => { if (await confirmDialog({ title: 'Continue on top of the latest commits?', body: `<p>Your new commits will be added after the changes that were just pushed to <code>${esc(job.branch)}</code>. Their files are kept.</p>`, confirmText: 'Continue' })) run('resume', { acceptNewBase: true }); }); add('Stop', 'btn-danger', doCancel); }
  else if (['uploading', 'ready', 'running'].includes(job.status)) add(`${icon('play')}Resume`, 'btn-primary', () => run('start'));
  if (!running && failed) add(`${icon('retry')}Retry ${plural(job.items.filter((i) => i.status === 'failed').length, 'failed file')}`, 'btn-primary', () => run('retry'));
  if (!running && FINISHED.includes(job.status)) add('New publish', '', async () => { await resetWizard(true); go('upload.html'); });
}
async function doCancel() {
  if (!(await confirmDialog({ title: 'Cancel publishing?', body: '<p>Commits already created stay on GitHub. Remaining files will not be committed.</p>', confirmText: 'Cancel publish', cancelText: 'Keep going', danger: true }))) return;
  ac?.abort(); try { job = await cancelJob(job.id); } catch (e) { toast(explain(e), 'error'); }
  running = false; drawRail(); setCurrent(null, 'Cancelled'); paint();
}

async function run(mode = 'start', body = {}) {
  if (running) return; running = true; ac = new AbortController(); paint();
  try {
    if (mode !== 'retry' && job.items.some((i) => i.status === 'waiting' && !i.blobSha)) {
      setCurrent(null, 'Uploading file contents to GitHub…');
      await uploadMissing(job, { signal: ac.signal, onProgress: (n, t) => setCurrent(null, `Uploading file contents… ${n}/${t}`) });
    }
    job = await drive(job, { mode, body, signal: ac.signal,
      onItem: (it) => { const local = job.items[it.index]; Object.assign(local, it); updateCard($('#rail'), local); if (it.status === 'committing') setCurrent(local); if (it.status === 'completed') { stamps.push(Date.now()); setCurrent(null, 'Committed ' + it.path); } paint(); },
      onJob: (j) => { job = j; paint(); } });
    if (job.status === 'completed') toast('Published to GitHub.', 'success');
  } catch (e) {
    if (e.name !== 'AbortError') {
      toast(e.code === 'files_missing' ? e.message : explain(e), 'error', 8000);
      try { job = await getJob(job.id); } catch { /* keep last known state */ }
    }
  } finally { running = false; drawRail(); setCurrent(null, FINISHED.includes(job.status) ? 'Finished' : 'Waiting'); paint(); }
}

try { job = await getJob(jobId); } catch (e) {
  view.innerHTML = `<div class="empty">${icon('alert')}<h3>This publish could not be found</h3><p>${esc(explain(e))} Jobs are kept for 30 days.</p><a class="btn btn-primary" href="history.html">Open history</a></div>`; await new Promise(() => {});
}
await patchWizard({ jobId: job.id });
drawRail(); setCurrent(null, 'Waiting'); paint();
// Fresh publishes start on their own. Anything that stopped waits for an explicit resume, because the repository
// state must be re-verified by the server first.
if (['uploading', 'ready'].includes(job.status) && !job.running) run('start');
