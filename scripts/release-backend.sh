#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "==> Running backend tests"
cd "$BACKEND_DIR"
npm test -- --runInBand

echo "==> Deploying backend to Railway"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
npx @railway/cli@4.39.0 up -s 1cbb4c5c-cfaa-4c72-841b-3b83a99d96a4 -e production

echo "==> Verifying backend health"
curl -sS https://readyroute-backend-production.up.railway.app/health
echo
