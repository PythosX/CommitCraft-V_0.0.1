import { bootApp, go } from '../core/router.js';
import { getWizard, patchWizard } from '../core/state-manager.js';
import { loadRecords } from '../services/file-service.js';
import { branchTree } from '../services/github-service.js';
import { TEMPLATES, renderMessage, orderFiles } from '../services/commit-service.js';
import { createJob } from '../services/publishing-service.js';
import { gitBlobSha, sensitiveReason } from '../utils/file-utils.js';
import { commitMessage } from '../utils/validation.js';
import { icon } from '../components/icons.js';
import { openDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { esc, bytes, plural } from '../utils/format-utils.js';
import { showError, explain } from '../utils/error-handler.js';

const view = await bootApp('commit-plan');
let w = await getWizard();
const settings = view.settings ?? {};
if (!w.repo) { go('repositories.html'); await new Promise(() => {}); }
const records = (await loadRecords()).filter((r) => r.state === 'selected');
if (!records.length) { go('upload.html'); await new Promise(() => {}); }

let template = w.templateTouched ? w.template : settings.defaultTemplate ?? w.template;
let order = w.orderTouched ? w.order : settings.defaultOrder ?? w.order;
const custom = { ...w.messages };
const prefix = w.prefix ? w.prefix + '/' : '';
const repoPath = (local) => prefix + local;

view.innerHTML = `<nav class="stepper" aria-label="Progress"><span class="done"><b>1</b>Repository</span><span class="done"><b>2</b>Upload</span><span class="on" aria-current="step"><b>3</b>Plan</span><span><b>4</b>Publish</span></nav>
  <div class="page-head"><div><h1>Commit plan</h1><p>Review every commit before anything is published. Commits are created in this order.</p></div></div>
  <div class="plan-layout"><div>
    <div class="row wrap" style="margin-bottom:12px;gap:8px">
      <div class="field" style="min-width:220px"><label for="tpl">Message template</label><select class="select" id="tpl">${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field" style="min-width:180px"><label for="ord">Commit order</label><select class="select" id="ord"><option value="path">By path</option><option value="folders-first">Folders first</option><option value="size-asc">Smallest first</option><option value="selection">As uploaded</option></select></div>
      <div class="row" style="margin-left:auto;align-self:flex-end"><button class="btn" id="editAll">${icon('edit')}Edit all messages</button><button class="btn btn-ghost" id="resetAll">${icon('undo')}Reset all</button></div></div>
    <div id="status"></div>
    <ol class="list-box plan-list" id="rows" aria-label="Commits in order"></ol>
    <details id="skipBox" class="card" style="margin-top:16px" hidden><summary style="cursor:pointer;font-weight:550"></summary><div id="skipList" class="muted mono" style="font-size:12.5px;margin-top:12px"></div></details>
  </div>
  <aside class="card summary" aria-label="Summary"><h3>Summary</h3>
    <dl><dt>Repository</dt><dd id="sRepo"></dd><dt>Branch</dt><dd id="sBranch"></dd><dt>Commits</dt><dd id="sCommits"></dd><dt>Adds</dt><dd id="sAdd"></dd><dt>Updates</dt><dd id="sUpd"></dd><dt>Skipped</dt><dd id="sSkip"></dd><dt>Total size</dt><dd id="sSize"></dd></dl>
    <div class="stack" id="warns"></div>
    <button class="btn btn-primary btn-lg" id="publish" style="width:100%;margin-top:16px" disabled>Publish</button></aside></div>`;
const $ = (s) => view.querySelector(s);
$('#tpl').value = template; $('#ord').value = order;

let plan = [], skipped = [], treeOk = false, remoteEmpty = false, ack = false, busy = false;

async function load() {
  $('#status').innerHTML = `<div class="notice info" style="margin-bottom:12px"><span class="spinner"></span><div>Checking which files already exist on <b class="mono">${esc(w.createBranch ? w.baseBranch : w.branch)}</b>…</div></div>`;
  let remote = new Map();
  try {
    const t = await branchTree(w.repo.owner, w.repo.name, w.createBranch ? w.baseBranch : w.branch);
    remoteEmpty = t.empty; treeOk = true;
    remote = new Map(t.files.map((f) => [f.path, f.sha]));
    $('#status').innerHTML = t.truncated ? `<div class="notice warn" style="margin-bottom:12px">${icon('warn')}<div>This repository is very large, so GitHub returned a partial file list. Existing files that were not listed will still be replaced correctly, but may be labelled “add”.</div></div>` : '';
  } catch (e) {
    $('#status').innerHTML = `<div class="notice warn" style="margin-bottom:12px">${icon('warn')}<div style="flex:1">Could not check existing files (${esc(explain(e))}). Files are shown as “add”; GitHub will still update any that exist.</div><button class="btn btn-sm" id="retryTree">Retry</button></div>`;
    $('#retryTree')?.addEventListener('click', load);
  }
  plan = []; skipped = [];
  for (const r of records) {
    const p = repoPath(r.path), sha = remote.get(p);
    if (sha) {
      if (sha === (await gitBlobSha(r.blob))) { skipped.push({ path: p, local: r.path, size: r.size }); continue; }
      plan.push({ local: r.path, path: p, size: r.size, action: 'update', blob: r.blob });
    } else plan.push({ local: r.path, path: p, size: r.size, action: 'add', blob: r.blob });
  }
  applyOrder(!!(w.orderList && sameSet(w.orderList, plan.map((x) => x.local))));
  render();
}
const sameSet = (a, b) => a.length === b.length && new Set([...a, ...b]).size === a.length;
function applyOrder(useSaved) {
  if (useSaved) { const m = new Map(plan.map((p) => [p.local, p])); plan = w.orderList.map((l) => m.get(l)); }
  else plan = orderFiles(plan.map((p) => ({ ...p, path: p.local })), order).map((o) => plan.find((p) => p.local === o.path));
}
const msgOf = (p) => custom[p.local] ?? renderMessage(template, p.path, p.action);
const save = () => patchWizard({ messages: custom, orderList: plan.map((p) => p.local), template, order });

function render() {
  const rows = $('#rows');
  rows.innerHTML = plan.map((p, i) => `<li class="plan-row" data-i="${i}">
    <div class="ord"><span>${i + 1}</span></div>
    <div style="min-width:0"><div class="path"><span style="overflow:hidden;text-overflow:ellipsis">${esc(p.path)}</span><span class="badge ${p.action === 'update' ? 'warn' : 'ok'}">${p.action}</span><span>${bytes(p.size)}</span>${sensitiveReason(p.local) ? `<span class="badge err" title="${esc(sensitiveReason(p.local))}">${icon('warn', 'icon-sm')}sensitive</span>` : ''}</div>
      <input class="input msg" value="${esc(msgOf(p))}" aria-label="Commit message for ${esc(p.path)}" maxlength="600" spellcheck="false"><div class="err" style="font-size:12.5px;min-height:0"></div></div>
    <div class="tools"><button class="btn btn-ghost btn-icon btn-sm" data-act="eye" aria-label="Preview message">${icon('eye')}</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-act="reset" aria-label="Reset message" ${custom[p.local] ? '' : 'disabled'}>${icon('undo')}</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-act="down" aria-label="Move down" ${i === plan.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
      <span class="btn btn-ghost btn-icon btn-sm handle" data-act="grip" title="Drag to reorder" aria-hidden="true">${icon('grip')}</span></div></li>`).join('');
  [...rows.children].forEach((li, i) => validateRow(li, plan[i]));
  $('#skipBox').hidden = !skipped.length;
  if (skipped.length) { $('#skipBox summary').textContent = `${plural(skipped.length, 'file')} identical to the repository, skipped`; $('#skipList').innerHTML = skipped.map((s) => `<div>${esc(s.path)}</div>`).join(''); }
  summary();
}
function validateRow(li, p) {
  const v = commitMessage(msgOf(p)); const input = li.querySelector('.msg'), err = li.querySelector('.err');
  input.setAttribute('aria-invalid', v?.level === 'error'); err.textContent = v?.text ?? ''; err.style.color = v?.level === 'warn' ? 'var(--warning)' : 'var(--error)';
  return !v || v.level !== 'error';
}
function summary() {
  const n = plan.length, adds = plan.filter((p) => p.action === 'add').length, risky = plan.filter((p) => sensitiveReason(p.local));
  const valid = plan.every((p) => !(commitMessage(msgOf(p))?.level === 'error'));
  $('#sRepo').textContent = w.repo.fullName; $('#sBranch').textContent = w.branch; $('#sCommits').textContent = n; $('#sAdd').textContent = adds; $('#sUpd').textContent = n - adds; $('#sSkip').textContent = skipped.length; $('#sSize').textContent = bytes(plan.reduce((s, p) => s + p.size, 0));
  const warns = [];
  if (remoteEmpty) warns.push(`<div class="notice info">${icon('info')}<div>This repository is empty. The first file creates the branch.</div></div>`);
  else if (w.createBranch) warns.push(`<div class="notice info">${icon('branch')}<div>A new branch <b class="mono">${esc(w.branch)}</b> will be created from <b class="mono">${esc(w.baseBranch)}</b>.</div></div>`);
  else warns.push(`<div class="notice warn">${icon('warn')}<div>You are adding commits to the existing branch <b class="mono">${esc(w.branch)}</b>. Existing files are kept.</div></div>`);
  if (risky.length) warns.push(`<div class="notice err">${icon('alert')}<div><b>${plural(risky.length, 'file')} may contain secrets.</b><label class="check" style="margin-top:8px"><input type="checkbox" id="ack" ${ack ? 'checked' : ''}> I understand these will be visible to everyone with repository access.</label></div></div>`);
  $('#warns').innerHTML = warns.join('');
  $('#ack')?.addEventListener('change', (e) => { ack = e.target.checked; summary(); });
  const b = $('#publish'); b.disabled = busy || !n || !valid || (risky.length > 0 && !ack);
  b.innerHTML = busy ? '<span class="spinner"></span>Creating plan' : `Publish ${plural(n, 'file')} as ${plural(n, 'commit')}`;
}

const rowsEl = $('#rows');
rowsEl.addEventListener('input', (e) => { if (!e.target.classList.contains('msg')) return; const li = e.target.closest('li'), p = plan[li.dataset.i];
  e.target.value.trim() === renderMessage(template, p.path, p.action) ? delete custom[p.local] : (custom[p.local] = e.target.value);
  validateRow(li, p); li.querySelector('[data-act=reset]').disabled = !custom[p.local]; summary(); save(); });
rowsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return; const i = Number(b.closest('li').dataset.i), p = plan[i];
  if (b.dataset.act === 'reset') { delete custom[p.local]; render(); save(); }
  if (b.dataset.act === 'up' || b.dataset.act === 'down') { const j = i + (b.dataset.act === 'up' ? -1 : 1); [plan[i], plan[j]] = [plan[j], plan[i]]; order = 'selection'; $('#ord').value = 'selection'; render(); save();
    rowsEl.children[j]?.querySelector(`[data-act=${b.dataset.act}]`)?.focus(); }
  if (b.dataset.act === 'eye') { const [title, ...body] = msgOf(p).trim().split('\n');
    const pd = openDialog(`<h2>Commit preview</h2><div class="card" style="background:var(--bg)"><div class="mono" style="font-weight:600">${esc(title)}</div>${body.length ? `<pre class="mono muted" style="white-space:pre-wrap;margin:8px 0 0">${esc(body.join('\n').trim())}</pre>` : ''}<div class="muted mono" style="font-size:12.5px;margin-top:12px">${p.action === 'update' ? 'Updates' : 'Adds'} ${esc(p.path)} on ${esc(w.branch)} · ${esc(w.repo.fullName)}</div></div><div class="actions"><button class="btn btn-primary" id="pvClose" autofocus>Close</button></div>`, { label: 'Commit preview' });
    pd.el.querySelector('#pvClose').addEventListener('click', () => pd.close()); }
});
// drag to reorder (drag starts only from the grip so message fields stay selectable)
let from = null;
rowsEl.addEventListener('pointerdown', (e) => { const g = e.target.closest('[data-act=grip]'); if (g) g.closest('li').draggable = true; });
rowsEl.addEventListener('dragstart', (e) => { from = Number(e.target.closest('li')?.dataset.i); e.target.closest('li')?.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); });
rowsEl.addEventListener('dragover', (e) => { e.preventDefault(); rowsEl.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); e.target.closest('li')?.classList.add('drop-before'); });
rowsEl.addEventListener('drop', (e) => { e.preventDefault(); const to = Number(e.target.closest('li')?.dataset.i); if (from == null || Number.isNaN(to) || to === from) return render(); const [m] = plan.splice(from, 1); plan.splice(to, 0, m); order = 'selection'; $('#ord').value = 'selection'; from = null; render(); save(); });
rowsEl.addEventListener('dragend', () => { from = null; render(); });

$('#tpl').addEventListener('change', (e) => { template = e.target.value; patchWizard({ templateTouched: true }); render(); save(); });
$('#ord').addEventListener('change', (e) => { order = e.target.value; patchWizard({ orderTouched: true }); if (order !== 'selection') { applyOrder(false); render(); } save(); });
$('#resetAll').addEventListener('click', () => { Object.keys(custom).forEach((k) => delete custom[k]); render(); save(); toast('All messages reset to the template.', 'success'); });
$('#editAll').addEventListener('click', () => {
  const d = openDialog(`<h2>Edit all messages</h2><p class="muted" style="margin-bottom:12px">One message per line, in commit order. Keep the same number of lines (${plan.length}).</p><textarea class="textarea mono" id="bulk" rows="12" spellcheck="false" autofocus>${esc(plan.map(msgOf).map((m) => m.split('\n')[0]).join('\n'))}</textarea><div class="err" id="bulkErr" style="margin-top:8px"></div><div class="actions"><button class="btn" id="bc">Cancel</button><button class="btn btn-primary" id="ba">Apply</button></div>`, { label: 'Edit all messages' });
  d.el.querySelector('#bc').addEventListener('click', () => d.close());
  d.el.querySelector('#ba').addEventListener('click', () => { const lines = d.el.querySelector('#bulk').value.split('\n');
    if (lines.length !== plan.length) { d.el.querySelector('#bulkErr').textContent = `Expected ${plan.length} lines, found ${lines.length}.`; return; }
    const bad = lines.findIndex((l) => commitMessage(l)?.level === 'error'); if (bad >= 0) { d.el.querySelector('#bulkErr').textContent = `Line ${bad + 1}: ${commitMessage(lines[bad]).text}`; return; }
    plan.forEach((p, i) => { const l = lines[i].trim(); l === renderMessage(template, p.path, p.action) ? delete custom[p.local] : (custom[p.local] = l); }); d.close(); render(); save(); });
});

$('#publish').addEventListener('click', async () => {
  busy = true; summary();
  try {
    const items = [...plan.map((p) => ({ path: p.path, size: p.size, action: p.action, message: msgOf(p).trim() })),
      ...skipped.map((s) => ({ path: s.path, size: s.size, action: 'skip', message: 'Skipped', skipReason: 'Identical to the file already on this branch' }))];
    const job = await createJob({ owner: w.repo.owner, repo: w.repo.name, branch: w.branch, createBranch: w.createBranch, baseBranch: w.baseBranch, items });
    await save(); await patchWizard({ jobId: job.id });
    go(`publishing.html?job=${encodeURIComponent(job.id)}`);
  } catch (e) { busy = false; summary(); showError(e, 'Could not create the publishing plan.'); }
});

await load();
