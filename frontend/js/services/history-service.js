import { api } from '../core/api-client.js';
export const loadHistory = () => api.get('/api/publish/history');
export const clearHistory = () => api.del('/api/publish/history');
export const loadJob = (id) => api.get(`/api/publish/jobs/${encodeURIComponent(id)}`).then((r) => r.job);
