#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL_DIR="$ROOT_DIR/manager-portal"
DEPLOY_ROOT="$(mktemp -d /tmp/readyroute-portal-deploy.XXXXXX)"

cleanup() {
  rm -rf "$DEPLOY_ROOT"
}

trap cleanup EXIT

echo "==> Building manager portal"
npm --prefix "$PORTAL_DIR" run build

echo "==> Deploying manager portal to Vercel"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/readyroute-npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/readyroute-xdg}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/readyroute-xdg}"

mkdir -p "$DEPLOY_ROOT/.vercel" "$DEPLOY_ROOT/manager-portal"
cp "$PORTAL_DIR/.vercel/project.json" "$DEPLOY_ROOT/.vercel/project.json"
rsync -a \
  --exclude node_modules \
  --exclude dist \
  --exclude .vercel \
  "$PORTAL_DIR/" "$DEPLOY_ROOT/manager-portal/"

npx vercel --prod --yes --cwd "$DEPLOY_ROOT" --archive=tgz
