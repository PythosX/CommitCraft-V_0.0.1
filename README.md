# CommitCraft

**Every file. A meaningful commit.**

CommitCraft publishes a local project folder to GitHub **one genuine Git commit per file**, with commit messages you control. Vanilla HTML/CSS/JS frontend (Vercel) + Cloudflare Worker backend + GitHub's Git Data API.

```
Local folder → file selection → commit plan → GitHub publishing → individual commits
```

## What is in the box

| Area | Status |
|---|---|
| GitHub OAuth (state/CSRF, encrypted server-side session, HttpOnly cookie, logout, disconnect) | Implemented, unit + integration tested |
| Repository list/search/filter, create repo, branch select / create branch | Implemented |
| Folder upload (drag & drop + picker), nested paths, folder tree, preview, search, sort | Implemented, browser-tested |
| Smart ignore (defaults, .gitignore syntax, custom patterns, restore, sensitive/large warnings) | Implemented, tested |
| Commit Message Studio (4 templates, per-file edit, bulk edit, reset, preview, validation) | Implemented |
| Commit plan (reorder by drag or buttons, add/update detection, identical files skipped) | Implemented |
| Publishing engine (blob → tree(base_tree) → commit(parent) → fast-forward ref update) | Implemented, tested |
| Live progress (NDJSON stream), retry, resume, cancel, conflict handling, no duplicate commits | Implemented, tested |
| History, dashboard stats (real data only), settings (all functional) | Implemented |

## Quick start (local)

Requirements: Node 20+ (22 recommended), a GitHub OAuth App (see `docs/github-setup.md`).

```bash
# 1. Backend config
cp .env.example backend/.dev.vars        # fill in the values; FRONTEND_URL=http://localhost:5173
cd backend && npm install
npx wrangler kv namespace create CC_KV   # paste the id into wrangler.toml
npm run dev                               # Worker on :8787

# 2. Frontend (new terminal) – serves ./frontend and proxies /api to the Worker
node frontend/dev-server.mjs              # http://localhost:5173
```

GitHub OAuth callback for local dev: `http://localhost:5173/api/auth/github/callback`.

## Tests

```bash
npm test                      # 45 tests: backend, frontend utils, HTTP-level integration (no network needed)
pip install playwright && playwright install chromium
python3 tests/e2e/smoke.py    # real-browser flow: login → upload → plan → publish → verify Git state
```

All of the above run against an **in-memory fake GitHub** that implements the Git Data endpoints (including the fast-forward check). They have **not** been run against live github.com — do the manual checklist in `docs/deployment.md` against a throwaway repository before relying on it.

## Project layout

```
frontend/   static site (deploy to Vercel)      backend/   Cloudflare Worker
  css/ js/{core,components,services,utils,pages}    src/{routes,services,middleware,storage,utils,config}
docs/       architecture · github-setup · deployment · security · api
tests/      frontend unit · integration · e2e (Playwright)
```

Deviations from the suggested structure: added `utils/crypto.js`, `utils/body.js`, `storage/settings-store.js`, `components/icons.js`, `core/theme-init.js`, `privacy.html`, `terms.html`, `frontend/dev-server.mjs`; `repository-service.js`/`branch-service.js` on the frontend are thin re-exports.

## Known limits (V1)

- Up to **500 files per publish**, **25 MB per file**.
- A **completely empty** repository: GitHub refuses Git Data blobs there, so the *first* file is committed through the Contents API (still a real commit, no parent); every later file uses the Git Data API.
- Rate limiting in the Worker is per-isolate best effort; add a Cloudflare Rate Limiting rule for hard limits.
- Workers Free: 10 ms CPU/request and 1,000 KV writes/day. Typical publishes fit; very large files or many publishes per day may need Workers Paid.
- OAuth scope is `repo` (GitHub offers nothing narrower for private-repo writes with OAuth Apps). A GitHub App with per-repo installation is the upgrade path.

System developed by PythosX · MIT licensed.
