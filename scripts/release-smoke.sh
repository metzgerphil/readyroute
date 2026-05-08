#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/../backend"
npm run smoke:production
