#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
CLOUD_RUN_PROJECT="${CLOUD_RUN_PROJECT:-ready-route-project}"
CLOUD_RUN_REGION="${CLOUD_RUN_REGION:-us-west1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-readyroute-api}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-https://api.readyroute.org/health}"
SOURCE_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD)"

echo "==> Running backend tests"
cd "$BACKEND_DIR"
npm run verify:schema
npm run test:unit

echo "==> Applying pending Supabase migrations"
cd "$ROOT_DIR"
supabase db push --linked --dry-run
supabase db push --linked --yes

echo "==> Deploying backend to Google Cloud Run"
gcloud run deploy "$CLOUD_RUN_SERVICE" \
  --source "$BACKEND_DIR" \
  --project "$CLOUD_RUN_PROJECT" \
  --region "$CLOUD_RUN_REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --update-env-vars "SOURCE_COMMIT=$SOURCE_COMMIT,NODE_ENV=production"

gcloud run services update-traffic "$CLOUD_RUN_SERVICE" \
  --project "$CLOUD_RUN_PROJECT" \
  --region "$CLOUD_RUN_REGION" \
  --to-latest

echo "==> Verifying backend health"
HEALTH_BODY="$(curl --fail --silent --show-error "$BACKEND_HEALTH_URL")"
echo "$HEALTH_BODY"
if [[ "$HEALTH_BODY" != *"$SOURCE_COMMIT"* || "$HEALTH_BODY" != *'"compatible":true'* ]]; then
  echo "Production health does not report source commit $SOURCE_COMMIT with a compatible schema" >&2
  exit 1
fi
echo
