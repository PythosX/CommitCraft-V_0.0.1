# API

All responses are JSON. Errors: `{"error":{"code","message","details?"}}`. Mutating requests require header `X-Requested-With: CommitCraft`. Cookie auth except where marked public.

## Auth
| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/github` | public; 302 to GitHub, sets signed state cookie |
| GET | `/api/auth/github/callback` | public; verifies state, creates session, 302 to `/dashboard.html` or `/?auth_error=<code>` |
| GET | `/api/auth/session` | public; `{authenticated, user?, session?}` |
| POST | `/api/auth/logout` | ends session |
| POST | `/api/auth/disconnect` | revokes the OAuth grant on GitHub, ends session |

## GitHub
| Method | Path | Notes |
|---|---|---|
| GET | `/api/github/repos?page=` | `{repos[], page, hasMore}` |
| POST | `/api/github/repos` | `{name, description?, private, autoInit?}` → 201 `{repo}` |
| GET | `/api/github/repository?owner&repo` | `{repo}` |
| GET | `/api/github/branches?owner&repo` | `{defaultBranch, branches[]}` (empty list = empty repo) |
| GET | `/api/github/tree?owner&repo&branch` | `{exists, empty, truncated, head?, files[{path,sha,size}]}` |

## Publishing
| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/publish/jobs` | `{owner, repo, branch, createBranch?, baseBranch?, items[{path,size,action:add\|update\|skip,message,skipReason?}]}` → 201 `{job}` (≤500 items) |
| GET | `/api/publish/jobs/:id` | `{job}` with `items[]`, `counts`, `status`, `error` |
| POST | `/api/publish/jobs/:id/blobs` | `{files:[{index, content:<base64>}]}` ≤25 files, ≤12 MB |
| POST | `/api/publish/jobs/:id/start` | commits up to 12 files. `Accept: application/x-ndjson` streams `{type:'item'}`…`{type:'job'}`; otherwise `{job}` |
| POST | `/api/publish/jobs/:id/retry` | `{indexes?}` resets failed items and runs |
| POST | `/api/publish/jobs/:id/resume` | `{acceptNewBase?}` — required `true` when status is `conflict` |
| POST | `/api/publish/jobs/:id/cancel` | stops after the in-flight commit |
| GET | `/api/publish/history` | `{jobs[], totals, recentRepos[]}` |
| DELETE | `/api/publish/history` | clears history list |

Codes you will see: `unauthorized` 401, `github_auth` 401, `forbidden` 403, `not_found` 404, `branch_conflict` 409, `job_running` 409, `confirm_required` 409, `blobs_missing` 409, `rate_limited` 429 (`details.retryAfter`), `bad_request` 400, `payload_too_large` 413.

## Settings
`GET /api/settings`, `PUT /api/settings` — `{theme: system|dark|light, defaultTemplate: add|create|update|folder, defaultOrder: path|folders-first|size-asc|selection, useGitignore, customIgnore[]}`.
