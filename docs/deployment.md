# ReadyRoute Deployment

ReadyRoute production is split across Vercel, Google Cloud Run, Supabase, and Resend. Local deploys are useful in an emergency, but production changes should still land through Git so the deployed source can be reproduced.

## Production Targets

- Landing page: `https://readyroute.org` on Vercel
- Manager portal: `https://portal.readyroute.org` on Vercel
- Backend API: `https://api.readyroute.org` on Google Cloud Run service `readyroute-api`
- Database/auth/data: Supabase
- Email: Resend

## Vercel Manager Portal

Configure the Vercel project with Git integration:

- Repository: `metzgerphil/readyroute`
- Root directory: `manager-portal`
- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_API_URL=https://api.readyroute.org`
- Production domain: `portal.readyroute.org`

## Google Cloud Run Backend

Cloud Run service:

- Project ID: `ready-route-project`
- Region: `us-west1`
- Service: `readyroute-api`
- Public domain: `https://api.readyroute.org`
- Health endpoint: `/health`

Runtime secrets/config stay in Google Cloud, not in GitHub:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Stripe, Google, FedEx, and map provider secrets as needed

ReadyRoute staff accounts are provisioned by an authenticated staff owner or admin.
The original `/staff/bootstrap` endpoint is retired and no bootstrap secret should be
configured in Cloud Run.

Supabase Storage buckets containing operational files must remain private. The backend
uploads with the service role after ReadyRoute authorization and returns short-lived
signed URLs to authorized users. Do not store new public object URLs or mark these
buckets public: `driver-documents`, `vehicle-inspection-photos`, `pod-photos`, and
the retired legacy `signatures` bucket.

## Release Flow

1. Open a pull request.
2. Backend CI and Portal CI must pass.
3. Merge to `main`.
4. Vercel deploys the web surfaces.
5. Deploy the backend to Cloud Run with `npm run deploy:backend`.
6. Run production smoke with `npm run smoke`.

## Resend

Resend does not deploy code from GitHub. Keep it stable through configuration and smoke tests:

- DNS records live in Vercel DNS
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` live in Google Cloud Secret Manager / Cloud Run env
- Production smoke calls the manager password reset endpoint when `SMOKE_PASSWORD_RESET_EMAIL` is set
