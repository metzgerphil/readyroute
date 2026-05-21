#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LANDING_DIR="$ROOT_DIR/landing-page"

echo "==> Verifying ReadyRoute landing page"
test -f "$LANDING_DIR/index.html"
test -f "$LANDING_DIR/vercel.json"

echo "==> Deploying landing page to Vercel"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/readyroute-xdg}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/readyroute-xdg}"
npx vercel --prod --yes --cwd "$LANDING_DIR"
