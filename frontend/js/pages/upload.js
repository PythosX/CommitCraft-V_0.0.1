import { bootApp, go } from '../core/router.js';
import { getWizard, patchWizard, files, resetWizard } from '../core/state-manager.js';
import { scanDrop, scanInput, folderCount } from '../services/upload-service.js';
import { applyRules, saveRecords, loadRecords, gitignoreTextOf } from '../services/file-service.js';
import { renderTree, fixIndeterminate } from '../components/file-tree.js';
import { icon } from '../components/icons.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { esc, bytes, plural } from '../utils/format-utils.js';
import { fileType, isPreviewable, sensitiveReason } from '../utils/file-utils.js';
import { normalizePrefix } from '../utils/path-utils.js';
import { CONFIG } from '../config/app-config.js';
import { showError } from '../utils/error-handler.js';

const view = await bootApp('upload');
let w = await getWizard();
if (!w.repo) { go('repositories.html'); await new Promise(() => {}); }

let records = await loadRecords();
let gitignoreText = await gitignoreTextOf(records);
const expanded = new Set();
let query = '', sort = 'name', active = null;

const stepper = `<nav class="stepper" aria-label="Progress"><span class="done"><b>1</b>Repository</span><span class="on" aria-current="step"><b>2</b>Upload</span><span><b>3</b>Plan</span><span><b>4</b>Publish</span></nav>`;
view.innerHTML = `${stepper}
  <div class="page-head"><div><h1>Upload your folder</h1><p>Publishing to <b class="mono">${esc(w.repo.fullName)}</b> on <b class="mono">${esc(w.branch)}</b>. Files never leave your browser until you publish.</p></div></div>
  <div id="drop" class="dropzone" tabindex="0" role="button" aria-label="Drop a folder here or press Enter to choose one">
    ${icon('upload')}<div><h3>Drop a project folder here</h3><p class="muted">Nested folders keep their paths. node_modules and .git are skipped automatically.</p></div>
    <div class="row"><button class="btn btn-primary" id="pick">${icon('folder')}Choose folder</button></div><div class="muted" id="scanMsg" aria-live="polite"></div>
    <input type="file" id="picker" webkitdirectory multiple hidden></div>
  <div id="work" hidden>
    <div class="upload-stats" id="stats" style="margin:24px 0"></div>
    <div id="notices" class="stack" style="margin-bottom:16px"></div>
    <div class="row wrap between" style="margin-bottom:12px">
      <div class="row wrap" style="flex:1;gap:8px"><div style="position:relative;flex:1;min-width:200px;max-width:340px"><input class="input" id="q" type="search" placeholder="Search files" aria-label="Search files" style="padding-left:38px"><span style="position:absolute;left:12px;top:12px;color:var(--text-2)">${icon('search')}</span></div>
        <select class="select" id="sort" style="width:auto" aria-label="Sort files"><option value="name">Sort: name</option><option value="size">Sort: size</option><option value="type">Sort: type</option></select></div>
      <div class="row wrap"><button class="btn btn-sm" id="selAll">Select all</button><button class="btn btn-sm" id="selNone">Deselect all</button><button class="btn btn-sm btn-ghost" id="expAll">Expand all</button><button class="btn btn-sm btn-ghost" id="colAll">Collapse all</button></div></div>
    <div class="explorer"><div class="list-box tree-wrap" id="tree"></div><aside class="card preview" id="preview" aria-live="polite"><div class="empty" style="border:0;padding:24px">${icon('eye')}<p>Select a file name to preview it. Text is shown as plain text and never executed.</p></div></aside></div>
    <div class="grid cols-2" style="margin-top:24px">
      <section class="card"><h3>Excluded files <span class="badge" id="exCount">0</span></h3><p class="muted" style="font-size:13.5px;margin-bottom:12px">Left out of the plan. Restore any file you want to publish.</p><div class="list-box" id="excluded" style="max-height:300px;overflow:auto"></div></section>
      <section class="card stack"><div><h3>Ignore rules &amp; target folder</h3><p class="muted" style="font-size:13.5px">Patterns follow .gitignore syntax: <code>*.log</code>, <code>docs/</code>, <code>!keep.txt</code>.</p></div>
        <form class="row" id="ruleForm"><input class="input" id="rule" placeholder="Add an ignore pattern" aria-label="Ignore pattern" autocomplete="off"><button class="btn">Add</button></form><div class="chips" id="chips"></div>
        <label class="check"><input type="checkbox" id="useGi"> Apply the folder's .gitignore</label>
        <div class="field"><label for="prefix">Publish into a subfolder <span class="muted">(optional)</span></label><input class="input" id="prefix" placeholder="e.g. projects/portfolio" autocomplete="off"><span class="hint" id="prefixHint">Leave empty to publish at the repository root.</span></div></section>
    </div>
    <div class="sticky-bar"><div class="muted" id="barText"></div><div class="row"><button class="btn btn-ghost" id="replace">Replace folder</button><button class="btn btn-primary" id="next">Review commit plan</button></div></div>
  </div>`;
const $ = (s) => view.querySelector(s);
const changed = new Set();

async function ingest(scan) {
  if (!scan.records.length) { toast('No files found in that selection.', 'error'); return; }
  $('#scanMsg').textContent = '';
  await files.clear();
  records = scan.records;
  gitignoreText = await gitignoreTextOf(records);
  const s = view.settings;
  w = await patchWizard({ rootName: scan.rootName, skippedDirs: scan.skippedDirs, customIgnore: s?.customIgnore ?? [], useGitignore: s?.useGitignore ?? true, messages: {}, orderList: null, jobId: null });
  recompute(true);
  await saveRecords(records);
  render();
}
function recompute(all = false) {
  applyRules(records, { custom: w.customIgnore, gitignoreText, useGitignore: w.useGitignore });
  if (all) records.forEach((r) => changed.add(r.path));
}
async function persist() {
  const list = records.filter((r) => changed.has(r.path)); changed.clear();
  if (list.length) await saveRecords(list);
}

function render() {
  $('#drop').hidden = records.length > 0; $('#work').hidden = records.length === 0;
  if (!records.length) return;
  const sel = records.filter((r) => r.state === 'selected'), exc = records.filter((r) => r.state === 'excluded');
  $('#stats').innerHTML = [[records.length, 'Total files'], [bytes(records.reduce((s, r) => s + r.size, 0)), 'Total size'], [folderCount(records), 'Folders'], [sel.length, 'Selected'], [exc.length, 'Excluded']]
    .map(([n, l]) => `<div class="card stat"><b>${typeof n === 'number' ? n.toLocaleString() : n}</b><span>${l}</span></div>`).join('');
  const risky = sel.filter((r) => sensitiveReason(r.path)), big = sel.filter((r) => !sensitiveReason(r.path) && r.warning);
  const n = [];
  if (w.skippedDirs.length) n.push(`<div class="notice info">${icon('info')}<div>Skipped without scanning: ${w.skippedDirs.map((d) => `<code>${esc(d)}/</code>`).join(', ')}. These folders are never published.</div></div>`);
  if (risky.length) n.push(`<div class="notice err">${icon('alert')}<div><b>${plural(risky.length, 'selected file')} may contain secrets:</b> ${risky.slice(0, 5).map((r) => `<code>${esc(r.path)}</code>`).join(', ')}${risky.length > 5 ? '…' : ''}. Remove them unless you are sure they are safe to publish.</div></div>`);
  if (big.length) n.push(`<div class="notice warn">${icon('warn')}<div>${plural(big.length, 'large file')}: ${big.slice(0, 3).map((r) => `<code>${esc(r.path)}</code> (${bytes(r.size)})`).join(', ')}. Large files take longer to upload.</div></div>`);
  if (sel.length > CONFIG.MAX_FILES) n.push(`<div class="notice err">${icon('alert')}<div>V1 publishes up to ${CONFIG.MAX_FILES} files at a time. Deselect ${sel.length - CONFIG.MAX_FILES} or add ignore patterns.</div></div>`);
  $('#notices').innerHTML = n.join('');
  drawTree();
  $('#exCount').textContent = exc.length;
  $('#excluded').innerHTML = exc.length ? exc.map((r) => `<div class="excl-item"><div style="flex:1;min-width:0"><div class="mono" style="font-size:13px;overflow:hidden;text-overflow:ellipsis">${esc(r.path)}</div><div class="why">${esc(r.reason)}</div></div><button class="btn btn-sm" data-restore="${esc(r.path)}" ${r.hard ? 'disabled title="Over the size limit"' : ''}>${icon('undo', 'icon-sm')}Restore</button></div>`).join('')
    : `<div class="empty" style="border:0;padding:24px">Nothing was excluded.</div>`;
  $('#chips').innerHTML = w.customIgnore.map((p, i) => `<span class="chip">${esc(p)}<button aria-label="Remove ${esc(p)}" data-rm="${i}">${icon('x', 'icon-sm')}</button></span>`).join('');
  $('#useGi').checked = w.useGitignore; $('#useGi').disabled = !gitignoreText;
  $('#prefix').value ||= w.prefix;
  $('#barText').textContent = `${plural(sel.length, 'file')} selected · ${bytes(sel.reduce((s, r) => s + r.size, 0))}`;
  $('#next').disabled = !sel.length || sel.length > CONFIG.MAX_FILES || !normalizePrefix($('#prefix').value).ok;
}
function drawTree() {
  const t = $('#tree'); const top = t.scrollTop;
  t.innerHTML = renderTree(records.filter((r) => r.state !== 'excluded'), { expanded, query, sort, active });
  fixIndeterminate(t); t.scrollTop = top;
}

async function preview(path) {
  active = path; drawTree();
  const r = records.find((x) => x.path === path), p = $('#preview');
  const meta = `<dl class="meta-grid"><dt>Path</dt><dd class="mono" style="margin:0;word-break:break-all">${esc(r.path)}</dd><dt>Size</dt><dd style="margin:0">${bytes(r.size)}</dd><dt>Type</dt><dd style="margin:0">${esc(fileType(r.path))}</dd></dl>`;
  p.innerHTML = `<div class="row">${icon('file')}<h3 style="margin:0">${esc(r.path.split('/').pop())}</h3></div>${meta}<div id="pv"></div>`;
  if (!isPreviewable(r.path)) { p.querySelector('#pv').innerHTML = `<p class="muted" style="margin-top:12px">No preview for this file type.</p>`; return; }
  const text = await r.blob.slice(0, CONFIG.MAX_PREVIEW_BYTES).text();
  const pre = document.createElement('pre'); pre.textContent = text; // textContent: never parsed as HTML
  p.querySelector('#pv').append(pre);
  if (r.size > CONFIG.MAX_PREVIEW_BYTES) p.querySelector('#pv').insertAdjacentHTML('beforeend', `<p class="muted" style="font-size:12.5px">Showing the first ${bytes(CONFIG.MAX_PREVIEW_BYTES)}.</p>`);
}
const setState = (list, state) => { list.forEach((r) => { if (r.state !== 'excluded') { r.state = state; changed.add(r.path); } }); persist(); render(); };

$('#tree').addEventListener('click', (e) => {
  const tg = e.target.closest('[data-toggle]'); if (tg) { const p = tg.dataset.toggle; expanded.has(p) ? expanded.delete(p) : expanded.add(p); drawTree(); return; }
  const op = e.target.closest('[data-open]'); if (op) preview(op.dataset.open);
});
$('#tree').addEventListener('change', (e) => {
  const f = e.target.dataset.filecheck, d = e.target.dataset.dircheck;
  if (f) setState(records.filter((r) => r.path === f), e.target.checked ? 'selected' : 'deselected');
  if (d !== undefined) setState(records.filter((r) => r.path.startsWith(d + '/')), e.target.checked ? 'selected' : 'deselected');
});
$('#q').addEventListener('input', (e) => { query = e.target.value; drawTree(); });
$('#sort').addEventListener('change', (e) => { sort = e.target.value; drawTree(); });
$('#selAll').addEventListener('click', () => setState(records, 'selected'));
$('#selNone').addEventListener('click', () => setState(records, 'deselected'));
$('#expAll').addEventListener('click', () => { records.forEach((r) => r.path.split('/').slice(0, -1).forEach((_, i, a) => expanded.add(a.slice(0, i + 1).join('/')))); drawTree(); });
$('#colAll').addEventListener('click', () => { expanded.clear(); drawTree(); });

$('#excluded').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-restore]'); if (!b) return;
  const r = records.find((x) => x.path === b.dataset.restore), s = sensitiveReason(r.path);
  if (s && !(await confirmDialog({ title: 'Restore a sensitive file?', body: `<p><code>${esc(r.path)}</code>: ${esc(s)}. Anyone who can read the repository will be able to read this file.</p>`, confirmText: 'Restore anyway', danger: true }))) return;
  r.restored = true; r.state = 'selected'; changed.add(r.path); await persist(); recompute(); render();
});
$('#ruleForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const v = $('#rule').value.trim(); if (!v) return;
  if (w.customIgnore.includes(v)) { toast('That pattern is already in the list.', 'info'); return; }
  w = await patchWizard({ customIgnore: [...w.customIgnore, v] }); $('#rule').value = '';
  records.forEach((r) => { delete r.restored; }); recompute(true); await persist(); render();
});
$('#chips').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  w = await patchWizard({ customIgnore: w.customIgnore.filter((_, i) => i !== Number(b.dataset.rm)) }); recompute(true); await persist(); render();
});
$('#useGi').addEventListener('change', async (e) => { w = await patchWizard({ useGitignore: e.target.checked }); recompute(true); await persist(); render(); });
$('#prefix').addEventListener('input', () => { const p = normalizePrefix($('#prefix').value); $('#prefix').setAttribute('aria-invalid', !p.ok); $('#prefixHint').textContent = p.ok ? (p.value ? `Files go to ${p.value}/…` : 'Leave empty to publish at the repository root.') : 'Use folder names separated by "/", without "..".'; render(); });

// picking / dropping
const dz = $('#drop'), picker = $('#picker');
$('#pick').addEventListener('click', (e) => { e.stopPropagation(); picker.click(); });
dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
picker.addEventListener('change', async () => { try { await ingest(scanInput(picker.files)); } catch (e) { showError(e); } picker.value = ''; });
['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', async (e) => {
  try { await ingest(await scanDrop(e.dataTransfer, (n) => { $('#scanMsg').textContent = `Reading folder… ${n} files`; })); }
  catch (err) { showError(err, 'Could not read that folder.'); }
});
$('#replace').addEventListener('click', async () => { if (await confirmDialog({ title: 'Replace this folder?', body: '<p>Your current selection and edited commit messages will be cleared.</p>', confirmText: 'Replace' })) { await files.clear(); records = []; await patchWizard({ messages: {}, orderList: null }); render(); } });
$('#next').addEventListener('click', async () => {
  const p = normalizePrefix($('#prefix').value); if (!p.ok) return;
  await persist(); await patchWizard({ prefix: p.value, orderList: null }); go('commit-plan.html');
});

if (records.length) { recompute(); await persist(); }
render();
