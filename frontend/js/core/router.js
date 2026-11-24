import { getSession } from './auth-manager.js';
import { bus } from './event-bus.js';
import { mountShell } from '../components/sidebar.js';
import { toast } from '../components/toast.js';
import { api } from './api-client.js';
import { applyTheme } from '../components/dropdown.js';

export const go = (url) => { location.href = url; };

let expiredShown = false;
bus.on('auth:expired', () => {
  if (expiredShown) return; expiredShown = true;
  toast('Your session expired. Sign in again to continue.', 'error');
  setTimeout(() => go('/?auth_error=expired'), 1200);
});

// Every signed-in page starts here: verify the session server-side, render the shell, return <main>.
export async function bootApp(active) {
  const s = await getSession();
  if (!s.authenticated) { go('/?auth_error=signin_required'); return new Promise(() => {}); }
  const settings = await api.get('/api/settings').then((r) => r.settings).catch(() => null);
  if (settings?.theme) applyTheme(settings.theme, false);
  const view = mountShell({ active, user: s.user, session: s.session });
  view.settings = settings;
  view.user = s.user;
  return view;
}
