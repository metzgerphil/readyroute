# ReadyRoute Deployment

ReadyRoute production should be GitHub-driven. Local deploys are useful in an emergency, but they should not be the normal path because they can put the portal and backend on different commits.

## Production Targets

- Manager portal: `https://portal.readyroute.org`
- Backend API: `https://readyroute-backend-production.up.railway.app`
- DNS: Netlify DNS for `readyroute.org`
- Email: Resend, using DNS records in Netlify and runtime secrets in Railway

## GitHub

Use `main` as the production branch. Every production change should land through a commit so Vercel, Railway, and smoke tests all point at the same source.

Required GitHub Actions secrets for production smoke:

- `SMOKE_MANAGER_EMAIL`
- `SMOKE_MANAGER_PASSWORD`
- `SMOKE_PASSWORD_RESET_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Optional GitHub Actions variables:

- `SMOKE_BACKEND_URL`
- `SMOKE_PORTAL_URL`

The smoke workflow is intentionally manual/dispatch-triggered until the smoke
secrets are configured. After that, a scheduled cron trigger can be added if
you want hourly production checks.

## Vercel Manager Portal

Configure the Vercel project with Git integration:

- Repository: `metzgerphil/readyroute`
- Root directory: `manager-portal`
- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_API_URL=https://readyroute-backend-production.up.railway.app`
- Production domain: `portal.readyroute.org`

Vercel should deploy automatically on pushes to `main`. Preview deployments should be enabled for pull requests.

## Railway Backend

Configure the Railway backend service with GitHub deployment:

- Repository: `metzgerphil/readyroute`
- Root directory: `backend`
- Production branch: `main`
- Start command: `npm start`
- Health endpoint: `/health`

Runtime secrets stay in Railway, not in GitHub:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Stripe, Google, FedEx, and map provider secrets

Disable routine manual deploys from local folders. If an emergency manual deploy is needed, follow it with a Git commit immediately so production can be rebuilt from source.

## Resend

Resend does not deploy code from GitHub. Keep it stable through configuration and smoke tests:

- DNS records live in Netlify DNS
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` live in Railway
- Production smoke calls the manager password reset endpoint when `SMOKE_PASSWORD_RESET_EMAIL` is set

## Release Flow

1. Open a pull request.
2. Backend CI and Portal CI must pass.
3. Merge to `main`.
4. Vercel deploys `manager-portal` from GitHub.
5. Railway deploys `backend` from GitHub.
6. Run Production Smoke.

Production Smoke verifies:

- backend health
- portal `/login` and `/drivers`
- manager login
- driver access lookup
- add driver using the same shape the portal sends
- driver list verification
- smoke driver cleanup
- manager password reset request, when configured
