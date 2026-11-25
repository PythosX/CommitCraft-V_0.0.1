import { toast } from '../components/toast.js';
export function explain(err) {
  if (!err) return 'Something went wrong.';
  if (err.code === 'rate_limited') return `GitHub rate limit reached. Try again in ${err.details?.retryAfter ?? 60} seconds.`;
  if (err.code === 'network') return 'Cannot reach the server. Check your connection and try again.';
  return err.message || 'Something went wrong.';
}
export function showError(err, prefix) {
  if (err?.name === 'AbortError') return;
  toast((prefix ? prefix + ' ' : '') + explain(err), 'error');
}
