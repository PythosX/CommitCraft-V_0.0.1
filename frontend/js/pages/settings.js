import { bootApp } from '../core/router.js';
import { api } from '../core/api-client.js';
import { logout, disconnect } from '../core/auth-manager.js';
import { resetWizard } from '../core/state-manager.js';
import { clearHistory } from '../services/history-service.js';
import { TEMPLATES } from '../services/commit-service.js';
import { applyTheme, currentTheme } from '../components/dropdown.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { esc, dateTime } from '../utils/format-utils.js';
import { showError } from '../utils/error-handler.js';
import { getSession } from '../core/auth-manager.js';

const view = await bootApp('settings');
let s = { ...(view.settings ?? {}) };
const sess = (await getSession()).session;
const u = view.user;
const row = (title, desc, control) => `<div class="row between wrap" style="padding:14px 0;border-top:1px solid var(--border)"><div style="max-width:420px"><b>${title}</b><div class="muted" style="font-size:13.5px">${desc}</div></div>${control}</div>`;

view.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Everything here is saved to your account and applied to new publishes.</p></div></div>
 <div class="stack" style="max-width:820px">
  <section class="panel"><h2 style="font-size:18px;margin-bottom:12px">Account</h2>
    <div class="row wrap"><img class="avatar" style="width:48px;height:48px" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer"><div style="flex:1"><b>${esc(u.name || u.login)}</b><div class="muted">@${esc(u.login)} · <a class="link" href="${esc(u.profileUrl)}" target="_blank" rel="noopener">GitHub profile</a></div></div><span class="badge ok"><span class="dot"></span>Connected</span><button class="btn" id="logout">${icon('logout')}Sign out</button></div></section>
  <section class="panel"><h2 style="font-size:18px">Publishing</h2>
    ${row('Default message template', 'Used for new commit plans. You can still change it per publish.', `<select class="select" id="tpl" style="width:auto">${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>`)}
    ${row('Default commit order', 'How files are ordered before you rearrange them.', `<select class="select" id="ord" style="width:auto"><option value="path">By path</option><option value="folders-first">Folders first</option><option value="size-asc">Smallest first</option><option value="selection">As uploaded</option></select>`)}
    ${row('Apply the folder’s .gitignore', 'Excludes files your project already ignores.', `<label class="switch"><input type="checkbox" id="gi" aria-label="Apply .gitignore"></label>`)}
    <div style="padding:14px 0;border-top:1px solid var(--border)"><b>Default file filters</b><div class="muted" style="font-size:13.5px;margin-bottom:8px">Extra ignore patterns added to every upload, one per line. Built-in rules always apply: .git, node_modules, .env files, dist, build and similar.</div><textarea class="textarea mono" id="ign" rows="4" placeholder="*.log&#10;coverage/" spellcheck="false"></textarea><div class="row" style="margin-top:8px"><button class="btn btn-primary btn-sm" id="saveIgn">Save filters</button></div></div></section>
  <section class="panel"><h2 style="font-size:18px">Appearance</h2><div class="tabs" role="group" aria-label="Theme" style="margin-top:12px">${['system', 'dark', 'light'].map((t) => `<button data-t="${t}" aria-pressed="false">${icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor', 'icon-sm')} ${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></section>
  <section class="panel"><h2 style="font-size:18px">Security</h2>
    ${row('Session', `Signed in ${sess ? dateTime(sess.createdAt) : ''}. Expires ${sess ? dateTime(sess.expiresAt) : ''}. Your GitHub token is encrypted on the server and never stored in this browser.`, '')}
    ${row('Clear publishing history', 'Deletes the history list on our server. Commits on GitHub are not affected.', `<button class="btn" id="clrHist">${icon('trash')}Clear history</button>`)}
    ${row('Clear files on this device', 'Removes the uploaded folder and commit plan saved in this browser.', `<button class="btn" id="clrLocal">${icon('trash')}Clear local data</button>`)}
    ${row('Disconnect GitHub', 'Revokes CommitCraft’s access on GitHub and signs you out.', `<button class="btn btn-danger" id="disc">Disconnect</button>`)}</section></div>`;
const $ = (q) => view.querySelector(q);
$('#tpl').value = s.defaultTemplate; $('#ord').value = s.defaultOrder; $('#gi').checked = !!s.useGitignore; $('#ign').value = (s.customIgnore ?? []).join('\n');
const syncTheme = () => view.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === currentTheme()));
syncTheme();

async function save(patch, msg = 'Saved.') { try { const r = await api.put('/api/settings', patch); s = r.settings; toast(msg, 'success', 2200); } catch (e) { showError(e, 'Could not save.'); } }
$('#tpl').addEventListener('change', (e) => save({ defaultTemplate: e.target.value }));
$('#ord').addEventListener('change', (e) => save({ defaultOrder: e.target.value }));
$('#gi').addEventListener('change', (e) => save({ useGitignore: e.target.checked }));
$('#saveIgn').addEventListener('click', () => save({ customIgnore: $('#ign').value.split('\n').map((l) => l.trim()).filter(Boolean) }, 'Filters saved.'));
view.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { applyTheme(b.dataset.t); syncTheme(); toast(`Theme: ${b.dataset.t}.`, 'success', 1800); }));
$('#logout').addEventListener('click', logout);
$('#clrHist').addEventListener('click', async () => { if (!(await confirmDialog({ title: 'Clear publishing history?', body: '<p>This removes your history list. Commits on GitHub stay exactly as they are.</p>', confirmText: 'Clear history', danger: true }))) return; try { await clearHistory(); toast('History cleared.', 'success'); } catch (e) { showError(e); } });
$('#clrLocal').addEventListener('click', async () => { if (!(await confirmDialog({ title: 'Clear local data?', body: '<p>Your uploaded folder and commit plan on this device will be removed. An unfinished publish that still needs file contents cannot be resumed afterwards.</p>', confirmText: 'Clear local data', danger: true }))) return; await resetWizard(false); toast('Local data cleared.', 'success'); });
$('#disc').addEventListener('click', async () => { if (!(await confirmDialog({ title: 'Disconnect GitHub?', body: '<p>CommitCraft’s access to your GitHub account is revoked and you are signed out. You can connect again at any time.</p>', confirmText: 'Disconnect', danger: true }))) return; try { const r = await disconnect(); toast(r.revoked ? 'Disconnected and access revoked.' : 'Signed out. Revoke access in GitHub settings to finish.', 'success'); setTimeout(() => (location.href = '/'), 900); } catch (e) { showError(e); } });
