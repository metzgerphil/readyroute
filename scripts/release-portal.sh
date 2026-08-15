#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL_DIR="$ROOT_DIR/manager-portal"

echo "==> Building manager portal"
npm --prefix "$PORTAL_DIR" run build

echo "==> Deploying manager portal to Firebase Hosting"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"

npx firebase-tools deploy \
  --project ready-route-project \
  --only hosting:portal \
  --config "$ROOT_DIR/firebase.json"
