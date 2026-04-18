#!/bin/zsh
set -euo pipefail

echo "==> Backend health"
/usr/bin/curl -sS https://readyroute-backend-production.up.railway.app/health
echo
echo

echo "==> Manager portal root"
/usr/bin/curl -I -sS https://manager-portal-ten.vercel.app | /usr/bin/sed -n '1,8p'
echo

echo "==> Manager portal SPA routes"
for path in /dashboard /manifest /drivers /routes/test-route; do
  printf '%s\n' "-- $path"
  /usr/bin/curl -I -sS "https://manager-portal-ten.vercel.app$path" | /usr/bin/sed -n '1,6p'
  echo
done

echo "==> Backend CORS preflight"
/usr/bin/curl -i -sS -X OPTIONS https://readyroute-backend-production.up.railway.app/auth/manager/login \
  -H 'Origin: https://manager-portal-ten.vercel.app' \
  -H 'Access-Control-Request-Method: POST' | /usr/bin/sed -n '1,12p'
echo
