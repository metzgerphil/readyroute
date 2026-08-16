#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
staging_api_url="https://readyroute-api-staging-201632321692.us-west1.run.app"

cd "$repo_root/manager-portal"
VITE_API_URL="$staging_api_url" npm run build

cd "$repo_root"
npx --yes firebase-tools hosting:channel:deploy rra-test \
  --project ready-route-project \
  --config firebase.rra-test.json \
  --expires 7d
