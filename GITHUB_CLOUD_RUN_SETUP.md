# GitHub + Google Cloud Run Backend Setup

ReadyRoute backend production targets Google Cloud Run.

## Target

- Repository: `metzgerphil/readyroute`
- Backend root: `backend`
- Cloud project: `ready-route-project`
- Cloud Run service: `readyroute-api`
- Region: `us-west1`
- Production API: `https://api.readyroute.org`

## Required Runtime Configuration

Keep secrets out of Git. Configure them in Google Cloud Secret Manager and/or Cloud Run environment variables:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `MANAGER_PORTAL_URL=https://portal.readyroute.org`

## Manual Deploy

From the repo root:

```bash
npm run deploy:backend
```

Equivalent Cloud Run command:

```bash
gcloud run deploy readyroute-api \
  --source backend \
  --project ready-route-project \
  --region us-west1 \
  --allow-unauthenticated \
  --port 8080
```

Verify:

```bash
curl -sS https://api.readyroute.org/health
```

## Cloud Scheduler FedEx/FCC Sync

After `FEDEX_SYNC_WORKER_SECRET` is set on the Cloud Run service, create the scheduled sync jobs from Google Cloud Shell:

```bash
cd ~/readyroute
git checkout main
git pull --ff-only origin main
read -s FEDEX_SYNC_WORKER_SECRET
export FEDEX_SYNC_WORKER_SECRET
npm run setup:fedex-scheduler
```

This creates:

- `readyroute-fedex-sync-manifests`: `mode=manifests` every 5 minutes.
- `readyroute-fedex-sync-progress`: `mode=progress` every 2 minutes.
