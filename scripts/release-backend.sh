#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
CLOUD_RUN_PROJECT="${CLOUD_RUN_PROJECT:-ready-route-project}"
CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-us-west1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-readyroute-api}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-https://api.readyroute.org/health}"

echo "==> Running backend tests"
cd "$BACKEND_DIR"
npm test -- --runInBand

echo "==> Deploying backend to Google Cloud Run"
cd "$ROOT_DIR"
gcloud run deploy "$CLOUD_RUN_SERVICE" \
  --source "$BACKEND_DIR" \
  --project "$CLOUD_RUN_PROJECT" \
  --region "$CLOUD_RUN_REGION" \
  --allow-unauthenticated \
  --port 8080

echo "==> Verifying backend health"
curl -sS "$BACKEND_HEALTH_URL"
echo
