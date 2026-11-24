export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Sign in to continue.') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource.') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, 'not_found', msg);
export const conflict = (code, msg, details) => new HttpError(409, code, msg, details);
export const tooLarge = (msg = 'Request is too large.') => new HttpError(413, 'payload_too_large', msg);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export function redirect(location, headers = {}) {
  const h = new Headers({ Location: location });
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
    else h.set(k, v);
  }
  return new Response(null, { status: 302, headers: h });
}

// Maps GitHub API failures to a stable client-facing error.
export function mapGitHubError(err) {
  const s = err.status;
  if (s === 0) return new HttpError(502, 'github_unreachable', 'Could not reach GitHub. Check your connection and try again.');
  if (s === 401) return new HttpError(401, 'github_auth', 'Your GitHub authorization is no longer valid. Sign in again.');
  if (s === 429 || err.code === 'rate_limited')
    return new HttpError(429, 'rate_limited', 'GitHub rate limit reached. Wait a moment and resume.', { retryAfter: err.retryAfter ?? 60 });
  if (s === 403) return new HttpError(403, 'github_forbidden', err.message || 'GitHub denied this request.');
  if (s === 404) return new HttpError(404, 'github_not_found', err.message || 'GitHub could not find that resource.');
  if (s === 409) return new HttpError(409, 'github_conflict', err.message || 'GitHub reported a conflict.');
  if (s === 422) return new HttpError(422, 'github_validation', err.message || 'GitHub rejected the request.', err.body?.errors);
  return new HttpError(502, 'github_error', err.message || 'GitHub returned an unexpected error.');
}

export function errorResponse(err, headers = {}) {
  let e = err;
  if (err && err.name === 'GitHubError') e = mapGitHubError(err);
  if (!(e instanceof HttpError)) {
    return json({ error: { code: 'internal_error', message: 'Something went wrong on our side.' } }, 500, headers);
  }
  return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status, headers);
}
