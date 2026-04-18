# ReadyRoute Publish Punchlist

Last verified: `2026-04-15`

## Verified Technical Gates

### Backend
- Command: `npm test -- --runInBand`
- Result: passed
- Includes:
  - unit tests
  - e2e tests
  - manifest upload flows
  - timecards/labor flows
  - manager dashboard/routes flows

### Manager Portal
- Command: `npm run build`
- Result: passed
- Notes:
  - Vite reports a chunk-size warning over 500 kB
  - this is not a build failure, but should be revisited later with code-splitting

### Driver App
- Command: `npm run release:prep`
- Result: passed
- Includes:
  - `npm run check`
  - `npm run test`
  - `npm run build:native:production`
  - `npm run check:release`

## Production Config Verified

### Driver App
- Production env file exists: `/Users/phillipmetzger/readyroute/driver-app/.env.production`
- Production API URL set to: `https://api.readyroute.app`
- Google Maps key present for production Expo config
- Release guardrail script exists: `/Users/phillipmetzger/readyroute/driver-app/scripts/check-release-env.js`

## Product Areas In Good Shape

- Driver workday loop
  - clock in
  - break/lunch
  - route execution
  - clock out
- Driver map behavior
  - no forced zoom reset on stop tap
  - Google Maps handoff verified in code/tests
- Manager route import flow
  - XLS only
  - GPX only
  - XLS + GPX optional merge
- Manager dispatch readiness
  - driver/vehicle/pin warnings
  - route health surfaced in dashboard/manifest/route page
- Labor visibility
  - finalized day
  - weekly labor
  - shift-level details

## Human Release Steps Remaining

### Driver App
- Build the real production binary with EAS:
  - `eas build --platform ios --profile production`
- If publishing to TestFlight/App Store:
  - confirm app metadata in App Store Connect
  - upload/submit the build
  - verify bundle identifier and version/build number

### Manager Portal
- Deploy the latest built code to the production hosting target
- Confirm production portal env values are correct
- Smoke test:
  - login
  - dashboard
  - manifest upload
  - route page
  - drivers page labor summary

### Backend
- Confirm production env is current
- Smoke test:
  - auth
  - manager dashboard
  - manifest upload
  - route assignment
  - driver route/today flow
  - timecards

## Nice-To-Have After Publish

- code-split the manager portal to reduce Vite chunk-size warning
- add a single repo-wide release command or script
- add crash/error monitoring if not already configured
