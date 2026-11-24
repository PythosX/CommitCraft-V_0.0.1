# Architecture

```
Browser (static, Vercel) ──/api/*──► Vercel rewrite ──► Cloudflare Worker ──► GitHub REST API
   IndexedDB: folder + plan                        KV: sessions, jobs, history, settings
```

**Same-origin by design.** `frontend/vercel.json` rewrites `/api/*` to the Worker, so the session cookie is first-party (`SameSite=Lax`, `HttpOnly`, `Secure`, `__Host-` prefix in production). No third-party-cookie problems, no CORS in production.

## Publishing pipeline

1. **Plan** (browser): files, order, messages. `GET /api/github/tree` lists existing paths; the browser computes each file's git blob SHA to label `add` / `update` / identical (skipped).
2. **Create job** `POST /api/publish/jobs`: server re-validates every path, name and message, checks write access and branch state, stores the job (metadata only, never file contents).
3. **Upload blobs** `POST /jobs/:id/blobs`: file contents (base64, ≤25 files/request) become Git blobs. Blobs touch no branch, so this phase is always safe to repeat. Size must match the plan.
4. **Commit** `POST /jobs/:id/start`: for each file, in order:
   `createTree(base_tree = previous tree, one entry)` → `createCommit(parents = [previous head])` → `updateRef(force = false)`.
   Up to 12 commits per request (Worker subrequest limit); progress streams as NDJSON; the browser calls again until done.

## Why it never duplicates or overwrites

- Head SHA and tree SHA are tracked in the job; every update is a **non-force** ref update, so GitHub itself rejects a non-fast-forward.
- Before a batch the server records an **intent** (`inflight` = the indexes about to be committed). If the process dies after GitHub accepted a commit but before the job was saved, resume walks the commits between the recorded head and the live head and **adopts** them only if their messages match the plan in order. Anything else → `conflict`, stop.
- `conflict` never auto-recovers. The user must confirm "continue on latest", which rebases the remaining commits onto the new head (their files are preserved because trees are built from the live tree).
- A per-job lock (90 s, refreshed on save) rejects concurrent runs.

## Job statuses

`uploading → ready → running → completed | partial | failed | cancelled`, plus `paused` (rate limit / network, resumable) and `conflict`.
Item statuses: `waiting, committing, completed, failed, skipped` (shown as Waiting/Processing/Committing/…).

## Data stored

| Where | What | TTL |
|---|---|---|
| KV `sess:*` | user id/login/avatar, **AES-GCM-encrypted** token | 7 d |
| KV `job:*` | repo, branch, paths, messages, blob/commit SHAs | 30 d |
| KV `hist:*` | job summaries (max 200) | 90 d |
| KV `settings:*` | preferences | none |
| Browser IndexedDB | uploaded files, plan, wizard state | until cleared |
| Browser localStorage | theme only | until cleared |
