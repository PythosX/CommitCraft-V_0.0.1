# Security notes

- **Tokens:** exchanged and used only in the Worker; stored AES-256-GCM encrypted in KV; never sent to the browser; never logged (logger redacts token/secret/cookie/content keys). The e2e and integration tests assert no token appears in responses, cookies or browser storage.
- **OAuth CSRF:** signed, expiring `state` cookie (HMAC-SHA256) must equal the `state` GitHub returns.
- **Sessions:** random 256-bit id + HMAC signature in an `HttpOnly; Secure; SameSite=Lax; __Host-` cookie; server-side expiry (7 d); logout deletes the KV record.
- **CSRF on the API:** every mutating request needs `X-Requested-With: CommitCraft` and, if present, an `Origin` equal to the frontend origin.
- **Input validation (server, never trusting the browser):** owner/repo/branch names, commit messages, sizes, base64 length == planned size, request body limits, and repository paths (no `..`, `.`, absolute, backslash, control chars, `.git` segments, empty segments, >400 chars, duplicates).
- **Authorization:** jobs are bound to the user id; other users get 404. Write access to the repo is verified when a job is created.
- **No force pushes:** ref updates are always `force: false`.
- **Uploaded content is inert:** previews use `textContent` in a `<pre>`; HTML/JS is never rendered or executed.
- **Secrets in uploads:** default-excluded env files; filename heuristics for keys/credentials; restoring one needs a confirmation, and selected ones need an explicit acknowledgement on the plan. These are heuristics, not a secret scanner.
- **CSP / headers:** `frontend/vercel.json` ships `script-src 'self'`, `frame-ancestors 'none'`, `nosniff`, etc.
- **Rate limiting:** per-isolate best effort in the Worker. For hard limits add a Cloudflare Rate Limiting rule on `/api/*` and stricter on `/api/auth/*`.
- **Not covered:** this has had no third-party security audit.
