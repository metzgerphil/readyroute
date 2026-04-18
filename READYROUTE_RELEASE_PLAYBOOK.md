# ReadyRoute Release Playbook

Last updated: `2026-04-17`

## Purpose

This is the practical ship guide for ReadyRoute.

Use it when you are:
- releasing backend changes
- pushing manager portal changes
- building or submitting the driver app
- doing a coordinated production release across all 3 surfaces

## Current Production Surfaces

- Backend: `https://readyroute-backend-production.up.railway.app`
- Manager portal: `https://manager-portal-ten.vercel.app`
- Driver app: iOS build and TestFlight/App Store flow through EAS

## Repo-Level Release Commands

From the repo root:
- `npm run release:backend`
- `npm run release:portal`
- `npm run release:smoke`
- `npm run release:app:prep`

These are thin wrappers around the real Railway, Vercel, and driver-app prep commands.
They are the fastest way to run the standard ReadyRoute release flow consistently.

## Release Types

### 1. Manager Portal Only

Use this when:
- you changed manager portal UI
- you changed dashboard, routes, manifest, drivers, or fleet map
- backend API shape did not change in a breaking way

Expected result:
- live website updates after Vercel deploy
- no iPhone app rebuild needed

### 2. Backend Only

Use this when:
- you changed API routes
- you changed manifest parsing
- you changed timecards/labor logic
- you changed Supabase or server-side business logic

Expected result:
- live API updates after Railway deploy
- manager portal and driver app use the new backend immediately
- no iPhone app rebuild needed unless the mobile code also changed

### 3. Driver App Only

Use this when:
- you changed app screens
- you changed map behavior in the driver app
- you changed stop flow, notes, pin saving, or timecard UX

Expected result:
- local changes do not update live users automatically
- you need a new EAS build for native app changes
- you need TestFlight/App Store submission for users to get the update

### 4. Full Release

Use this when:
- backend changed
- manager portal changed
- driver app changed

Expected result:
- deploy backend first
- deploy manager portal second
- build and submit driver app third

That order keeps web surfaces pointed at a working API before the mobile app build is published.

## Standard Release Order

For a full coordinated release, use this order:

1. Backend
2. Manager portal
3. Driver app
4. Production smoke test

## Backend Release Workflow

Working directory:
- `/Users/phillipmetzger/readyroute/backend`

Pre-release checks:
```bash
cd /Users/phillipmetzger/readyroute
npm run release:backend
```

What `npm run release:backend` does:
- runs backend tests
- deploys the backend to Railway
- checks production health

Manual equivalent:
```bash
cd /Users/phillipmetzger/readyroute/backend
npm test -- --runInBand
export NPM_CONFIG_CACHE=/tmp/readyroute-npm-cache
npx @railway/cli@4.39.0 up -s 1cbb4c5c-cfaa-4c72-841b-3b83a99d96a4 -e production
curl -sS https://readyroute-backend-production.up.railway.app/health
```

Expected result:
- returns `{"status":"ok",...}`

If backend crashes:
- check Railway deploy logs
- most likely causes are missing env vars or startup config issues

## Manager Portal Release Workflow

Working directory:
- `/Users/phillipmetzger/readyroute/manager-portal`

Pre-release checks:
```bash
cd /Users/phillipmetzger/readyroute
npm run release:portal
```

What `npm run release:portal` does:
- builds the manager portal
- deploys it to Vercel production

Manual equivalent:
```bash
cd /Users/phillipmetzger/readyroute/manager-portal
npm run build
export NPM_CONFIG_CACHE=/tmp/readyroute-npm-cache
export XDG_CONFIG_HOME=/tmp/readyroute-xdg
export XDG_CACHE_HOME=/tmp/readyroute-xdg
npx vercel --prod
```

Live URL:
- `https://manager-portal-ten.vercel.app`

Production envs to verify in Vercel:
- `VITE_API_URL`
- `VITE_GOOGLE_MAPS_KEY`

Expected result:
- Vercel returns a ready production deployment
- `/dashboard`, `/manifest`, `/drivers`, and `/routes/...` hard-refresh correctly

## Driver App Release Workflow

Working directory:
- `/Users/phillipmetzger/readyroute/driver-app`

Pre-release checks:
```bash
cd /Users/phillipmetzger/readyroute
npm run release:app:prep
```

What `npm run release:app:prep` verifies:
- Expo config is valid
- tests pass
- native production export succeeds
- release env points at production

Manual equivalent:
```bash
cd /Users/phillipmetzger/readyroute/driver-app
npm run release:prep
```

Production build:
```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas build --platform ios --profile production
```

Submission:
```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas submit --platform ios --profile production
```

Important:
- local code changes do not update iPhone users automatically
- new mobile code requires a new EAS build
- Apple account/team access is required for production signing/submission

## What Updates Automatically vs Not

### Backend

- changes go live after Railway deploy
- manager portal and driver app will use new backend behavior immediately

### Manager Portal

- changes go live after Vercel deploy
- browser users see updates on refresh/new load

### Driver App

- changes do not go live just because code changed locally
- changes do not go live just because backend/portal changed
- native app updates require a new build and App Store/TestFlight delivery

## Production Smoke Test

After a full release, run this in order.

### Manager Portal

1. Log in with a real manager account
2. Open `Dashboard`
3. Confirm dispatch/readiness state looks correct
4. Open one route page
5. Confirm map, pins, and stop drawer work
6. Open `Manifest`
7. Confirm route board and upload actions load
8. Open `Drivers`
9. Confirm driver rows and labor views load

### Driver App

1. Log in with a real driver account
2. Open `Home`
3. Open `My Drive`
4. Confirm map loads and stop tap preserves zoom
5. Confirm `Nav` opens Google Maps
6. Confirm stop detail loads
7. Confirm note save and corrected pin save work
8. Confirm timecard actions persist

### Backend/API

1. Check `/health`
2. Confirm manager login works
3. Confirm manager API routes return data
4. Confirm auth-protected routes reject unauthorized requests correctly

For a quick automated smoke pass, run:
```bash
cd /Users/phillipmetzger/readyroute
npm run release:smoke
```

## Release Notes To Record

For every real release, record:
- date
- backend deploy yes/no
- portal deploy yes/no
- driver app build id
- driver app submitted yes/no
- production API URL used
- any known follow-up issues

## Current Known Gaps

- custom production backend domain still needs to be finalized if you want `api.readyroute.app`
- manager portal production Google Maps key/referrer restrictions should be verified against the live Vercel domain
- driver app OTA updates are not configured as an automatic release path right now

## Fast Decision Guide

If you changed only manager portal code:
- deploy Vercel only

If you changed only backend code:
- deploy Railway only

If you changed only driver app code:
- run release prep, build with EAS, then submit

If you changed everything:
- Railway
- Vercel
- EAS build
- EAS submit
- smoke test
