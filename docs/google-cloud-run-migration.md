# ReadyRoute Google Cloud Run Migration

This was the low-risk migration path for moving the ReadyRoute backend API to Google Cloud Run while leaving the landing page, manager portal, mobile app, and Supabase database in place.

## Target Shape

- `readyroute.org`: keep on Vercel for now
- `portal.readyroute.org`: keep on Vercel for now
- `api.readyroute.org`: move to Google Cloud Run
- Supabase: keep as the database/auth/data layer for now
- FedEx/FCC background sync: move later as a separate Cloud Run Job or scheduled worker

## First Backend Service

Deploy only the Express API as the first Cloud Run service.

Service name:

```text
readyroute-api
```

Suggested region:

```text
us-west1
```

The backend listens on `process.env.PORT`, which Cloud Run provides automatically.

## Required Cloud Run Environment Variables

Copy the real values from the current Cloud Run service and Secret Manager. Do not paste secrets into this repo.

Minimum required for the API:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
JWT_SECRET
GOOGLE_MAPS_API_KEY
GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID
STRIPE_SECRET_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
MANAGER_PORTAL_URL=https://portal.readyroute.org
```

Keep these disabled for the first API migration unless we are also moving the sync worker:

```text
FEDEX_FCC_AUTOMATION_ENABLED=false
FEDEX_SYNC_MODE=both
```

## Local Prerequisite

Install and authenticate the Google Cloud CLI:

```bash
gcloud auth login
gcloud config set project READYROUTE_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## First Deploy

From the repo root:

```bash
gcloud run deploy readyroute-api \
  --source backend \
  --region us-west1 \
  --allow-unauthenticated \
  --port 8080
```

After deployment, test the temporary Cloud Run URL:

```bash
curl https://CLOUD_RUN_URL/health
```

Expected response:

```json
{"status":"ok"}
```

## Custom Domain Cutover

Only after the temporary Cloud Run URL works:

1. Add a Cloud Run domain mapping for `api.readyroute.org`.
2. Update DNS in Vercel to the records Google gives you.
3. Wait for certificate provisioning.
4. Test:

```bash
curl https://api.readyroute.org/health
```

Do not update the portal or mobile app until this returns `{"status":"ok"}`.

## Rollback

If Cloud Run has trouble, route traffic back to the last known-good Cloud Run revision and keep client apps pointed at `https://api.readyroute.org`.
