# GitHub OAuth App setup

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** CommitCraft
   - **Homepage URL:** `https://your-app.vercel.app`
   - **Authorization callback URL:** `https://your-app.vercel.app/api/auth/github/callback`
     (the *frontend* origin — Vercel proxies it to the Worker). For local dev create a second OAuth App with `http://localhost:5173/api/auth/github/callback`.
3. Copy the **Client ID**; generate a **Client secret** (shown once).
4. Put them in the Worker: client id in `wrangler.toml [vars]`, secret via `npx wrangler secret put GITHUB_CLIENT_SECRET`.

**Scopes requested:** `repo` (create commits in public *and* private repos, create repos) and `read:user`. OAuth Apps have no narrower scope for private-repo writes. If you only publish to public repos you can change `SCOPES` in `backend/src/services/oauth-service.js` to `public_repo read:user`.

**GitHub App alternative.** A GitHub App gives per-repository installation and short-lived tokens, but needs an installation flow and token refresh; it is the recommended hardening step after V1.

**Organizations.** Org-owned repos may require an org owner to approve the OAuth App (Settings → Third-party access).
