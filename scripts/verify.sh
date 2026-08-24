#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Verifying landing page files"
test -f "$ROOT_DIR/landing-page/index.html"
test -f "$ROOT_DIR/landing-page/signup.html"
test -f "$ROOT_DIR/landing-page/vercel.json"
npm --prefix "$ROOT_DIR" run verify:site-branding

echo "==> Linting manager portal"
npm --prefix "$ROOT_DIR/manager-portal" run lint

echo "==> Building manager portal"
VITE_API_URL="${VITE_API_URL:-https://api.readyroute.org}" \
  npm --prefix "$ROOT_DIR/manager-portal" run build

echo "==> Running backend unit tests"
node "$ROOT_DIR/scripts/check-schema-version.js"
SUPABASE_URL="${SUPABASE_URL:-https://example.supabase.co}" \
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-test-service-role-key}" \
JWT_SECRET="${JWT_SECRET:-test-secret}" \
  npm --prefix "$ROOT_DIR/backend" run test:unit

echo "==> Running the complete Ready Route Answers release gate"
SUPABASE_URL="${SUPABASE_URL:-https://example.supabase.co}" \
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-test-service-role-key}" \
  npm --prefix "$ROOT_DIR" run knowledge:gate

echo "==> Verify complete"
