#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
RAILWAY_PROJECT_ID="${RAILWAY_PROJECT_ID:-6563ba20-da03-4222-8c84-7244fc6b44b4}"
RAILWAY_SERVICE_ID="${RAILWAY_SERVICE_ID:-1cbb4c5c-cfaa-4c72-841b-3b83a99d96a4}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"

echo "==> Running backend tests"
cd "$BACKEND_DIR"
npm test -- --runInBand

echo "==> Deploying backend to Railway"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$ROOT_DIR/.npm-cache}"
cd "$ROOT_DIR"
npx @railway/cli@4.39.0 up -p "$RAILWAY_PROJECT_ID" -s "$RAILWAY_SERVICE_ID" -e "$RAILWAY_ENVIRONMENT"

echo "==> Verifying backend health"
curl -sS https://readyroute-backend-production.up.railway.app/health
echo
