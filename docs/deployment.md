# Deployment

## 1. Backend → Cloudflare Workers
```bash
cd backend && npm install
npx wrangler login
npx wrangler kv namespace create CC_KV          # copy the id into wrangler.toml
# edit wrangler.toml [vars]: GITHUB_CLIENT_ID, FRONTEND_URL, GITHUB_CALLBACK_URL
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET          # openssl rand -base64 32
npx wrangler secret put ENCRYPTION_KEY          # openssl rand -base64 32 (different value)
npx wrangler deploy                              # note the https://commitcraft-api.<you>.workers.dev URL
```
`GET https://<worker>/api/auth/session` should return `{"authenticated":false}`. A `misconfigured` error lists which variables are missing (names only).

## 2. Frontend → Vercel
1. Edit `frontend/vercel.json`: set the rewrite `destination` to your Worker URL.
2. Import the repo in Vercel, **Root Directory = `frontend`**, Framework = *Other*, no build command, output directory `.`.
3. Deploy. Set `FRONTEND_URL` / `GITHUB_CALLBACK_URL` (Worker vars) and the OAuth App URLs to the final Vercel domain, then `wrangler deploy` again.
4. Set `GITHUB_URL` in `frontend/js/config/app-config.js` to your repository link.

## 3. Verify on the deployed app (do not skip)
Use a **throwaway repository**.

- [ ] Sign in; cancel the GitHub prompt once and see the error message.
- [ ] Select repo + branch; create a new repo; create a new branch.
- [ ] Upload a nested folder containing `.env` and `node_modules` → both excluded with reasons.
- [ ] Publish 5 files; on GitHub check 5 commits, each parented on the previous; existing files unchanged.
- [ ] Re-publish a changed file → labelled *update*; identical files skipped.
- [ ] Close the tab mid-publish, reopen `/publishing.html` (or Dashboard → Resume) → no duplicate commits.
- [ ] Push a commit to the branch mid-publish → *conflict* banner, your commit untouched.
- [ ] Empty repository → first file creates the branch, the rest follow.
- [ ] Sign out → `/dashboard.html` bounces to sign-in; DevTools shows no token in storage.

## Environment variables
| Variable | Where | Secret |
|---|---|---|
| GITHUB_CLIENT_ID, GITHUB_CALLBACK_URL, FRONTEND_URL | Worker `[vars]` | no |
| GITHUB_CLIENT_SECRET, SESSION_SECRET, ENCRYPTION_KEY | Worker secrets | **yes** |
| *(none)* | Vercel | — |

## Costs
Vercel Hobby + Workers Free + KV Free cover light use. KV Free allows 1,000 writes/day; a 500-file publish uses roughly 100–150 writes.
