import { json, badRequest } from '../utils/response.js';
import { assertOwner, assertRepoName } from '../utils/validation.js';
import { mapRepo } from '../services/repository-service.js';
import { readJson } from '../utils/body.js';

export default [
  { method: 'GET', path: '/api/github/repository', async handler(rc) {
    const r = await rc.client.getRepo(assertOwner(rc.query.get('owner')), assertRepoName(rc.query.get('repo')));
    return json({ repo: mapRepo(r) });
  } },

  { method: 'POST', path: '/api/github/repos', async handler(rc) {
    const b = await readJson(rc.request, rc.cfg.limits.maxJsonBytes);
    const name = assertRepoName(b.name);
    const description = typeof b.description === 'string' ? b.description.slice(0, 350) : '';
    if (typeof b.private !== 'boolean') throw badRequest('Choose public or private.');
    const r = await rc.client.createRepo({ name, description, isPrivate: b.private, autoInit: b.autoInit === true });
    return json({ repo: mapRepo(r) }, 201);
  } },
];
