# ReadyRoute Deployment

ReadyRoute production uses a split platform setup:

- Backend API: `https://api.readyroute.org` on Google Cloud Run
- Database/storage: Supabase
- Manager portal: `https://portal.readyroute.org` on Vercel
- Landing page: `https://readyroute.org` and `https://www.readyroute.org` on Vercel
- Email: Resend
- Driver app: Expo/EAS, TestFlight, and App Store Connect

## GitHub

Use `main` as the production source branch. Every production change should land through a commit so Cloud Run, Vercel, EAS, and smoke tests can all be traced to source.

Required GitHub Actions secrets for production smoke:

- `SMOKE_MANAGER_EMAIL`
- `SMOKE_MANAGER_PASSWORD`
- `SMOKE_PASSWORD_RESET_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Optional GitHub Actions variables:

- `SMOKE_BACKEND_URL`
- `SMOKE_PORTAL_URL`

## Vercel Manager Portal

Configure the Vercel project with Git integration:

- Repository: `metzgerphil/readyroute`
- Root directory: `manager-portal`
- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_API_URL=https://api.readyroute.org`
- Production domain: `portal.readyroute.org`

Vercel should deploy automatically on pushes to `main`. Preview deployments should be enabled for pull requests.

## Google Cloud Run Backend

Cloud Run service:

- Project: `ready-route-project`
- Region: `us-west1`
- Service: `readyroute-api`
- Source directory: `backend`
- Public API domain: `https://api.readyroute.org`

Runtime secrets stay in Google Cloud Run / Secret Manager, not in GitHub:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Stripe, Google, FedEx, and map provider secrets

Deploy from Cloud Shell:

```bash
cd ~/readyroute
git fetch origin
git checkout main
git pull --ff-only origin main
gcloud config set project ready-route-project
gcloud run deploy readyroute-api \
  --source ./backend \
  --region us-west1 \
  --allow-unauthenticated \
  --port 8080
curl -sS https://api.readyroute.org/health
```

## Resend

Resend does not deploy code from GitHub. Keep it stable through DNS, runtime secrets, and smoke tests:

- DNS records live in Vercel DNS
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` live in Cloud Run / Secret Manager
- Production smoke calls the manager password reset endpoint when `SMOKE_PASSWORD_RESET_EMAIL` is set

## Release Flow

1. Open a pull request.
2. Backend CI and Portal CI must pass.
3. Merge to `main`.
4. Push Supabase migrations when schema changes exist.
5. Deploy backend to Cloud Run.
6. Vercel deploys `manager-portal` from GitHub.
7. Build and submit the driver app with EAS when mobile code changes.
8. Run Production Smoke.

Production Smoke verifies:

- backend health
- portal `/login` and `/drivers`
- manager login
- driver access lookup
- add driver using the same shape the portal sends
- driver list verification
- smoke driver cleanup
- manager password reset request, when configured
