import { bootApp, go } from '../core/router.js';
import { getWizard, patchWizard } from '../core/state-manager.js';
import { listAllRepos, createRepo, listBranches } from '../services/github-service.js';
import { icon } from '../components/icons.js';
import { openDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { esc, ago } from '../utils/format-utils.js';
import { showError, explain } from '../utils/error-handler.js';
import * as V from '../utils/validation.js';

const view = await bootApp('repositories');
const w = await getWizard();
let repos = [], filter = 'all', query = '', selected = w.repo, branchInfo = null;

const stepper = (n) => `<nav class="stepper" aria-label="Progress">${['Repository', 'Upload', 'Plan', 'Publish'].map((s, i) => `<span class="${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}><b>${i + 1}</b>${s}</span>`).join('')}</nav>`;
view.innerHTML = `${stepper(1)}
  <div class="page-head"><div><h1>Choose a repository</h1><p>Publish into an existing repository or create a new one.</p></div><button class="btn" id="createBtn">${icon('plus')}New repository</button></div>
  <div class="row wrap" style="margin-bottom:16px"><div style="flex:1;min-width:220px;position:relative"><input class="input" id="q" type="search" placeholder="Search repositories" aria-label="Search repositories" style="padding-left:38px"><span style="position:absolute;left:12px;top:12px;color:var(--text-2)">${icon('search')}</span></div>
    <div class="tabs" role="group" aria-label="Visibility filter">${['all', 'public', 'private'].map((f) => `<button data-f="${f}" aria-pressed="${f === 'all'}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div></div>
  <div id="list" class="list-box" role="radiogroup" aria-label="Repositories"></div>
  <div id="branchPanel" style="margin-top:24px"></div>
  <div class="sticky-bar"><span class="muted" id="selText">No repository selected</span><button class="btn btn-primary" id="next" disabled>Continue to upload</button></div>`;
const $ = (s) => view.querySelector(s);

function renderList() {
  const items = repos.filter((r) => (filter === 'all' || (filter === 'private') === r.private) && r.fullName.toLowerCase().includes(query.toLowerCase()));
  $('#list').innerHTML = items.length ? items.map((r) => `<button class="repo-pick" role="radio" aria-checked="${selected?.fullName === r.fullName}" data-full="${esc(r.fullName)}" ${r.canPush ? '' : 'disabled title="You do not have write access"'}>
    ${icon(r.private ? 'lock' : 'globe')}<div class="meta"><b>${esc(r.fullName)}</b><span class="muted" style="font-size:12.5px">${esc(r.description || 'No description')}</span></div>
    <span class="badge mono">${icon('branch', 'icon-sm')}${esc(r.defaultBranch)}</span><span class="muted hide-sm" style="font-size:12px">${r.pushedAt ? ago(Date.parse(r.pushedAt)) : ''}</span></button>`).join('')
    : `<div class="empty" style="border:0">${icon('folder')}<h3>${repos.length ? 'No matching repositories' : 'No repositories yet'}</h3><p>${repos.length ? 'Try a different search or filter.' : 'Create one to get started.'}</p></div>`;
}
$('#list').innerHTML = [1, 2, 3, 4].map(() => '<div class="repo-pick"><div class="skeleton" style="height:36px;width:100%"></div></div>').join('');
listAllRepos().then((r) => { repos = r; renderList(); if (selected) pick(selected.fullName, true); }).catch((e) => { showError(e); $('#list').innerHTML = `<div class="empty" style="border:0">${icon('alert')}<h3>Could not load repositories</h3><p>${esc(explain(e))}</p><button class="btn" id="reloadBtn">Try again</button></div>`; $('#reloadBtn').addEventListener('click', () => location.reload()); });

$('#q').addEventListener('input', (e) => { query = e.target.value; renderList(); });
view.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; view.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderList(); }));
$('#list').addEventListener('click', (e) => { const b = e.target.closest('[data-full]'); if (b) pick(b.dataset.full); });

async function pick(full, restore = false) {
  const r = repos.find((x) => x.fullName === full); if (!r) return;
  selected = r; renderList();
  $('#branchPanel').innerHTML = `<div class="panel"><div class="skeleton" style="height:42px"></div></div>`;
  try {
    const b = await listBranches(r.owner, r.name);
    branchInfo = { ...b, empty: b.branches.length === 0 };
    renderBranch(restore ? w : null);
  } catch (e) { showError(e); $('#branchPanel').innerHTML = `<div class="notice err">${icon('alert')}<div>${esc(explain(e))}</div></div>`; }
}

function renderBranch(prev) {
  const { branches, defaultBranch, empty } = branchInfo;
  const names = branches.map((b) => b.name);
  const initial = prev?.repo?.fullName === selected.fullName && prev.branch ? prev.branch : defaultBranch;
  const isNew = prev?.repo?.fullName === selected.fullName && prev.createBranch;
  $('#branchPanel').innerHTML = `<div class="panel stack">
    <div class="row between wrap"><h3 style="margin:0">Target branch</h3><span class="badge mono">${esc(selected.fullName)}</span></div>
    ${empty ? `<div class="notice info">${icon('info')}<div>This repository is empty. The first file creates the branch, so every commit that follows will be a real commit on top of it.</div></div>` : ''}
    <div class="grid cols-2">
      <div class="field"><label for="branchSel">Branch</label>
        <select class="select" id="branchSel">${empty ? `<option value="__new">New branch…</option>` : names.map((n) => `<option ${n === initial && !isNew ? 'selected' : ''}>${esc(n)}</option>`).join('') + `<option value="__new" ${isNew ? 'selected' : ''}>Create new branch…</option>`}</select></div>
      <div class="field" id="newBranchField" hidden><label for="newBranch">New branch name</label><input class="input" id="newBranch" value="${esc(isNew ? prev.branch : empty ? defaultBranch : '')}" placeholder="feature/my-project" autocomplete="off"><span class="err" id="newBranchErr"></span></div>
      <div class="field" id="baseField" hidden><label for="baseSel">Create from</label><select class="select" id="baseSel">${names.map((n) => `<option ${n === defaultBranch ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    </div>
    <div class="notice warn" id="existingWarn" hidden>${icon('warn')}<div><b>You are publishing to an existing branch.</b> New commits are added on top of its history. Files already in the repository are kept, and a file with the same path is replaced by your version (shown as “update” in the plan).</div></div>
  </div>`;
  const sel = $('#branchSel');
  const sync = () => {
    const isNewNow = sel.value === '__new';
    $('#newBranchField').hidden = !isNewNow; $('#baseField').hidden = !isNewNow || empty;
    $('#existingWarn').hidden = isNewNow || empty;
    validate();
  };
  sel.addEventListener('change', sync); $('#newBranch').addEventListener('input', validate); sync();
}

function validate() {
  const sel = $('#branchSel'); if (!sel) return false;
  let ok = true;
  if (sel.value === '__new') {
    const err = V.branchName($('#newBranch').value.trim());
    const exists = branchInfo.branches.some((b) => b.name === $('#newBranch').value.trim());
    $('#newBranchErr').textContent = err || (exists ? 'That branch already exists.' : '');
    $('#newBranch').setAttribute('aria-invalid', !!(err || exists)); ok = !(err || exists);
  }
  $('#next').disabled = !ok; $('#selText').textContent = `${selected.fullName}`;
  return ok;
}

$('#next').addEventListener('click', async () => {
  if (!validate()) return;
  const sel = $('#branchSel'), isNew = sel.value === '__new';
  await patchWizard({ repo: { owner: selected.owner, name: selected.name, fullName: selected.fullName, private: selected.private, defaultBranch: selected.defaultBranch, url: selected.url },
    branch: isNew ? $('#newBranch').value.trim() : sel.value, createBranch: isNew && !branchInfo.empty, baseBranch: isNew && !branchInfo.empty ? $('#baseSel').value : null, jobId: null });
  go('upload.html');
});

$('#createBtn').addEventListener('click', () => {
  const d = openDialog(`<h2>Create a repository</h2><form id="cf" class="stack" novalidate>
    <div class="field"><label for="rn">Repository name</label><input class="input" id="rn" autocomplete="off" autofocus placeholder="my-portfolio"><span class="err" id="rnErr"></span></div>
    <div class="field"><label for="rd">Description <span class="muted">(optional)</span></label><input class="input" id="rd" maxlength="350"></div>
    <div class="field"><label>Visibility</label><div class="tabs" role="group"><button type="button" data-v="public" aria-pressed="true">Public</button><button type="button" data-v="private" aria-pressed="false">Private</button></div></div>
    <label class="check"><input type="checkbox" id="ri"> Initialize with a README</label>
    <div class="actions"><button type="button" class="btn" id="cc">Cancel</button><button class="btn btn-primary" id="cs">Create repository</button></div></form>`, { label: 'Create repository' });
  let priv = false;
  d.el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { priv = b.dataset.v === 'private'; d.el.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  d.el.querySelector('#cc').addEventListener('click', () => d.close());
  d.el.querySelector('#cf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = d.el.querySelector('#rn').value.trim(), err = V.repoName(name);
    d.el.querySelector('#rnErr').textContent = err ?? ''; d.el.querySelector('#rn').setAttribute('aria-invalid', !!err);
    if (err) return;
    const btn = d.el.querySelector('#cs'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating';
    try {
      const r = await createRepo({ name, description: d.el.querySelector('#rd').value, private: priv, autoInit: d.el.querySelector('#ri').checked });
      repos.unshift(r); d.close(); toast(`Created ${r.fullName}.`, 'success'); await pick(r.fullName);
    } catch (ex) {
      btn.disabled = false; btn.textContent = 'Create repository';
      d.el.querySelector('#rnErr').textContent = ex.status === 422 ? 'A repository with this name already exists on your account.' : explain(ex);
    }
  });
});
