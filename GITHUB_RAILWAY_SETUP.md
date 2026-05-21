# GitHub + Google Cloud Run Backend Setup

ReadyRoute now uses Google Cloud Run for the backend API at `https://api.readyroute.org`.

## Current Backend Flow

1. Push code to GitHub.
2. GitHub Actions runs backend tests.
3. Merge to `main`.
4. Deploy the backend from committed source to Google Cloud Run.
5. Verify `https://api.readyroute.org/health`.

## What Is Already In The Repo

- GitHub remote: `https://github.com/metzgerphil/readyroute.git`
- Backend CI workflow: `.github/workflows/backend-ci.yml`
- Backend Dockerfile: `backend/Dockerfile`

The backend CI workflow runs when:

- a pull request changes backend files
- `main` receives backend changes

## Cloud Run Service

- Google Cloud project: `ready-route-project`
- Region: `us-west1`
- Service: `readyroute-api`
- Source directory: `backend`
- Custom domain: `https://api.readyroute.org`

Runtime secrets live in Google Cloud / Secret Manager, not in GitHub:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Stripe env vars
- Google/FedEx env vars
- any other backend secrets

## Deploy From Google Cloud Shell

Step 1: Open Google Cloud Shell.

Step 2: Paste this:

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
```

Step 3: Verify:

```bash
curl -sS https://api.readyroute.org/health
```

Expected result:

```json
{"status":"ok"}
```

The actual response may include extra fields like `timestamp` or `release`.

## Recommended GitHub Protection

Protect `main` in GitHub repo settings:

1. Open `Settings`.
2. Open `Branches`.
3. Add a branch protection rule for `main`.
4. Require pull request before merge.
5. Require passing status checks before merge.

Recommended required check:

- `Test Backend`
