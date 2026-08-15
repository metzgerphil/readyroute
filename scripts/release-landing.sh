#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LANDING_DIR="$ROOT_DIR/landing-page"

echo "==> Verifying ReadyRoute landing page"
test -f "$LANDING_DIR/index.html"
test -f "$LANDING_DIR/vercel.json"

echo "==> Deploying landing page to Firebase Hosting"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
npx firebase-tools deploy \
  --project ready-route-project \
  --only hosting:landing \
  --config "$ROOT_DIR/firebase.json"
