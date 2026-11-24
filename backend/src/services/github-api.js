// Thin GitHub REST client: auth headers, retry on transient failures, rate-limit detection.
export class GitHubError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    Object.assign(this, extra); // code, retryAfter, body
  }
}

const API = 'https://api.github.com';
const seg = (s) => s.split('/').map(encodeURIComponent).join('/');

export class GitHubClient {
  constructor(token, opts = {}) {
    this.token = token;
    this.fetch = opts.fetch || ((...a) => fetch(...a));
    this.sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = opts.maxRetries ?? 2;
    this.maxInlineWait = opts.maxInlineWait ?? 5; // seconds we are willing to wait before surfacing a rate limit
  }

  async request(method, path, { body, query, retry5xx = true } = {}) {
    const url = new URL(API + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
    let attempt = 0;
    for (;;) {
      let res;
      try {
        res = await this.fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'CommitCraft',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt++ < this.maxRetries) { await this.sleep(400 * 2 ** attempt); continue; }
        throw new GitHubError(0, 'Network error while contacting GitHub.', { code: 'network' });
      }

      if (res.ok) {
        if (res.status === 204) return null;
        return res.json();
      }

      let data = null;
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      const message = data?.message || `GitHub responded with ${res.status}`;
      const remaining = res.headers.get('x-ratelimit-remaining');
      const limited = res.status === 429 || (res.status === 403 && (remaining === '0' || /rate limit|abuse/i.test(message)));
      if (limited) {
        let wait = Number(res.headers.get('retry-after'));
        if (!wait) {
          const reset = Number(res.headers.get('x-ratelimit-reset'));
          wait = reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60;
        }
        if (wait <= this.maxInlineWait && attempt++ < this.maxRetries) { await this.sleep(wait * 1000); continue; }
        throw new GitHubError(429, 'GitHub rate limit reached.', { code: 'rate_limited', retryAfter: wait, body: data });
      }
      if (res.status >= 500 && retry5xx && attempt++ < this.maxRetries) { await this.sleep(400 * 2 ** attempt); continue; }
      throw new GitHubError(res.status, message, { body: data });
    }
  }

  getUser() { return this.request('GET', '/user'); }
  listRepos(page = 1, perPage = 100) {
    return this.request('GET', '/user/repos', { query: { per_page: perPage, page, sort: 'pushed', affiliation: 'owner,collaborator,organization_member' } });
  }
  createRepo({ name, description, isPrivate, autoInit }) {
    return this.request('POST', '/user/repos', { body: { name, description, private: !!isPrivate, auto_init: !!autoInit }, retry5xx: false });
  }
  getRepo(owner, repo) { return this.request('GET', `/repos/${owner}/${repo}`); }
  listBranches(owner, repo, page = 1) { return this.request('GET', `/repos/${owner}/${repo}/branches`, { query: { per_page: 100, page } }); }
  getRef(owner, repo, branch) { return this.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${seg(branch)}`); }
  createRef(owner, repo, branch, sha) {
    return this.request('POST', `/repos/${owner}/${repo}/git/refs`, { body: { ref: `refs/heads/${branch}`, sha } });
  }
  // force is always false: a non-fast-forward update must fail so we never overwrite someone else's work.
  updateRef(owner, repo, branch, sha) {
    return this.request('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${seg(branch)}`, { body: { sha, force: false } });
  }
  getCommit(owner, repo, sha) { return this.request('GET', `/repos/${owner}/${repo}/git/commits/${sha}`); }
  createBlob(owner, repo, base64) {
    return this.request('POST', `/repos/${owner}/${repo}/git/blobs`, { body: { content: base64, encoding: 'base64' } });
  }
  createTree(owner, repo, baseTree, tree) {
    return this.request('POST', `/repos/${owner}/${repo}/git/trees`, { body: { base_tree: baseTree, tree } });
  }
  createCommit(owner, repo, { message, tree, parents }) {
    return this.request('POST', `/repos/${owner}/${repo}/git/commits`, { body: { message, tree, parents } });
  }
  getTree(owner, repo, sha) { return this.request('GET', `/repos/${owner}/${repo}/git/trees/${sha}`, { query: { recursive: '1' } }); }
  // Contents API: the only way to create the first commit in a completely empty repository.
  putFile(owner, repo, path, { message, content, branch }) {
    return this.request('PUT', `/repos/${owner}/${repo}/contents/${seg(path)}`, { body: { message, content, branch } });
  }
  revokeGrant(clientId, clientSecret, token) {
    return this.fetch(`${API}/applications/${clientId}/grant`, {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`), Accept: 'application/vnd.github+json', 'User-Agent': 'CommitCraft', 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    });
  }
}
