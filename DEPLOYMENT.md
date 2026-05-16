# ReadyRoute Deployment

ReadyRoute production should be GitHub-driven. Local deploy commands are emergency tools only; normal deployment should happen from pushes to `main` through Vercel and Railway Git integrations.

## Production Targets

| Service | Host | Platform | Project / Service |
| --- | --- | --- | --- |
| Landing page | `https://readyroute.org` | Vercel | `landing-page`, `prj_jM9cDzf32BBmTWSH4nMoBj2nuLlI` |
| Landing page www | `https://www.readyroute.org` | Vercel | `landing-page`, `prj_jM9cDzf32BBmTWSH4nMoBj2nuLlI` |
| Manager portal | `https://portal.readyroute.org` | Vercel | `manager-portal`, `prj_fkit6VjgKUUlx28IJHkBLuBWbxZi` |
| Backend API | `https://readyroute-backend-production.up.railway.app` | Railway | service `1cbb4c5c-cfaa-4c72-841b-3b83a99d96a4` |

Vercel team/org:

- `phillovesjoy-9153s-projects`
- `team_9qgT8TwZoJyK1COICngLd7lK`

DNS:

- Registrar: Name.com
- Active DNS host: Vercel DNS
- Nameservers:
  - `ns1.vercel-dns.com`
  - `ns2.vercel-dns.com`
- Inbound email forwarding: ImproveMX
- Keep ImproveMX MX/SPF, Resend DKIM, and DMARC TXT records in Vercel DNS.

## Root Commands

Run these from the repository root.

```bash
npm run verify
npm run deploy:portal
npm run deploy:backend
npm run smoke
```

Aliases kept for compatibility:

```bash
npm run release:portal
npm run release:landing
npm run release:backend
npm run release:smoke
```

`npm run verify` checks the landing page files, lints/builds the manager portal, and runs backend unit tests. `npm run smoke` runs the production smoke script and requires configured production smoke credentials.

## Normal Release Flow

1. Open a pull request.
2. Run `npm run verify` locally before merge.
3. GitHub Actions should pass:
   - Backend CI
   - Portal CI
4. Merge to `main`.
5. Vercel deploys `landing-page` and `manager-portal` from GitHub.
6. Railway deploys `backend` from GitHub.
7. Run Production Smoke:

```bash
npm run smoke
```

## Manual Emergency Deploys

Prefer GitHub integrations. Use these only when production needs an immediate manual push.

Portal:

```bash
npm run deploy:portal
```

Backend:

```bash
npm run deploy:backend
```

Landing page:

```bash
npm run deploy:landing
```

After any emergency deploy, commit and push the same source to GitHub so Vercel/Railway can reproduce production.

## Smoke Tests

Production smoke:

```bash
npm run smoke
```

Quick public checks:

```bash
curl -I https://readyroute.org
curl -I https://www.readyroute.org
curl -I https://portal.readyroute.org
curl -sS https://readyroute-backend-production.up.railway.app/health
```

DNS checks:

```bash
dig +short NS readyroute.org
dig +short MX readyroute.org
dig +short TXT _dmarc.readyroute.org
dig +short TXT resend._domainkey.readyroute.org
```

Vercel DNS authoritative checks:

```bash
dig @ns1.vercel-dns.com +short NS readyroute.org
dig @ns1.vercel-dns.com +short TXT _dmarc.readyroute.org
dig @ns1.vercel-dns.com +short TXT resend._domainkey.readyroute.org
```

## Rollback

Landing page rollback:

1. Open Vercel project `landing-page`.
2. Go to Deployments.
3. Select the last known-good deployment.
4. Promote it to Production.
5. Re-run:

```bash
curl -I https://readyroute.org
curl -I https://www.readyroute.org
```

Manager portal rollback:

1. Open Vercel project `manager-portal`.
2. Go to Deployments.
3. Select the last known-good deployment.
4. Promote it to Production.
5. Re-run:

```bash
curl -I https://portal.readyroute.org
npm run smoke
```

Backend rollback:

1. Open the Railway backend service.
2. Go to Deployments.
3. Redeploy the last known-good deployment.
4. Confirm `/health` is healthy.
5. Re-run production smoke:

```bash
curl -sS https://readyroute-backend-production.up.railway.app/health
npm run smoke
```

If a schema migration caused the issue, do not rollback code alone. Confirm the database state first and apply a forward-fix migration when possible.

## Required Production Environment

Railway backend:

- `NODE_ENV=production`
- `APP_TIME_ZONE=America/Los_Angeles`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `MANAGER_PORTAL_URL=https://portal.readyroute.org`

Vercel manager portal:

- `VITE_API_URL=https://readyroute-backend-production.up.railway.app`
- `VITE_GOOGLE_MAPS_KEY=<production_browser_key>`

Driver app build environment:

- `EXPO_PUBLIC_API_URL=https://readyroute-backend-production.up.railway.app`
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<production_mobile_key>`

GitHub production smoke secrets:

- `SMOKE_MANAGER_EMAIL`
- `SMOKE_MANAGER_PASSWORD`
- `SMOKE_PASSWORD_RESET_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Optional GitHub variables:

- `SMOKE_BACKEND_URL`
- `SMOKE_PORTAL_URL`

## GitHub Actions

GitHub Actions should check code, not own production deployment.

- `.github/workflows/backend-ci.yml` runs backend unit checks.
- `.github/workflows/portal-ci.yml` lints/builds the manager portal.
- `.github/workflows/production-smoke.yml` runs production smoke manually or by dispatch.

Vercel and Railway Git integrations remain the production deployment owners.

## FCC Background Sync

Preferred production setup: run the backend `worker` process from `backend/Procfile` on Railway. The worker runs `npm run fedex:sync:daemon`, which keeps manifest discovery and FCC scanner progress polling alive automatically. In Railway, scale the `worker` process to 1 instance; keeping only the `web` process on will serve the API but will not poll FCC.

Backend worker environment:

- `FEDEX_SYNC_MANIFEST_INTERVAL_MS=300000`
- `FEDEX_SYNC_PROGRESS_INTERVAL_MS=90000`
- `FEDEX_SYNC_TICK_INTERVAL_MS=15000`
- `FEDEX_SYNC_WORKER_SECRET=<long_random_secret>`

If the host cannot run a continuous worker process, call the internal sync endpoint from a scheduler:

```bash
curl -X POST "https://readyroute-backend-production.up.railway.app/internal/fedex-sync" \
  -H "Authorization: Bearer $FEDEX_SYNC_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"auto"}'
```

For scanner-completion updates:

```bash
curl -X POST "https://readyroute-backend-production.up.railway.app/internal/fedex-sync" \
  -H "Authorization: Bearer $FEDEX_SYNC_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"progress"}'
```

## Supabase / Stripe Checks

ReadyRoute uses the Supabase service-role key from the backend. Client apps should not access operational tables directly. Verify RLS remains enabled on operational tables and that `anon` / `authenticated` do not have broad direct access policies.

Production Stripe webhook:

```text
https://readyroute-backend-production.up.railway.app/billing/webhook
```

## Notes

- The manager portal uses React Router, so `manager-portal/vercel.json` rewrites all routes to `/index.html`.
- The landing page is static HTML and uses `landing-page/vercel.json`.
- ReadyRoute no longer uses Netlify for web hosting.
