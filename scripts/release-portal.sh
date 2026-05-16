#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL_DIR="$ROOT_DIR/manager-portal"
ROOT_VERCEL_DIR="$ROOT_DIR/.vercel"
TEMP_ROOT_LINK=0

cleanup() {
  if [[ "$TEMP_ROOT_LINK" == "1" ]]; then
    rm -rf "$ROOT_VERCEL_DIR"
  fi
}

trap cleanup EXIT

echo "==> Building manager portal"
npm --prefix "$PORTAL_DIR" run build

echo "==> Deploying manager portal to Vercel"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/readyroute-xdg}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/readyroute-xdg}"

if [[ ! -f "$ROOT_VERCEL_DIR/project.json" ]]; then
  mkdir -p "$ROOT_VERCEL_DIR"
  cp "$PORTAL_DIR/.vercel/project.json" "$ROOT_VERCEL_DIR/project.json"
  TEMP_ROOT_LINK=1
fi

npx vercel --prod --yes --cwd "$ROOT_DIR" --archive=tgz
