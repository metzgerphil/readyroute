#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-ready-route-project}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-us-west1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-readyroute-api}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-https://api.readyroute.org/health}"

echo "==> Running backend tests"
cd "$BACKEND_DIR"
npm run test:unit

if ! command -v gcloud >/dev/null 2>&1; then
  cat <<EOF

gcloud is not installed on this machine, so deploy from Google Cloud Shell.

Step 1: Open Google Cloud Shell.

Step 2: Paste this:

cd ~/readyroute
git fetch origin
git checkout main
git pull --ff-only origin main
gcloud config set project $GOOGLE_CLOUD_PROJECT
gcloud run deploy $CLOUD_RUN_SERVICE \\
  --source ./backend \\
  --region $GOOGLE_CLOUD_REGION \\
  --allow-unauthenticated \\
  --port 8080

Step 3: Verify:

curl -sS $BACKEND_HEALTH_URL

Expected result:
{"status":"ok",...}

EOF
  exit 0
fi

echo "==> Deploying backend to Google Cloud Run"
cd "$ROOT_DIR"
gcloud config set project "$GOOGLE_CLOUD_PROJECT"
gcloud run deploy "$CLOUD_RUN_SERVICE" \
  --source ./backend \
  --region "$GOOGLE_CLOUD_REGION" \
  --allow-unauthenticated \
  --port 8080

echo "==> Verifying backend health"
curl -sS "$BACKEND_HEALTH_URL"
echo
