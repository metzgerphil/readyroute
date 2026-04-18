#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL_DIR="$ROOT_DIR/manager-portal"

echo "==> Building manager portal"
cd "$PORTAL_DIR"
npm run build

echo "==> Deploying manager portal to Vercel"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/readyroute-xdg}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/readyroute-xdg}"
npx vercel --prod --cwd "$PORTAL_DIR"
