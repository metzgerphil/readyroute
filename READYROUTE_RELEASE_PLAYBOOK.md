# ReadyRoute Release Playbook

Last updated: `2026-07-11`

## Production Surfaces

- API: `https://api.readyroute.org`
- Manager portal: `https://portal.readyroute.org`
- ReadyRoute staff portal: `https://readyroute.org/staff`
- Driver app: Expo/EAS production build distributed through TestFlight or the App Store

## Production Source Of Truth

GitHub `main` is the production source of truth. Do not deploy an uncommitted local directory directly to Cloud Run or Vercel.

Backend releases run through `.github/workflows/release-production.yml` when backend code, Supabase migrations, or release workflow files reach `main`.

The backend workflow runs in this order:

1. Install dependencies and run backend tests.
2. Preview and apply pending Supabase migrations.
3. Deploy the exact Git commit to Cloud Run.
4. Confirm `/health` reports that commit and a compatible schema.
5. Run authenticated production smoke tests.

Manager portal releases are built and deployed by Vercel from GitHub.

Driver app code does not reach installed phones until a new EAS build is created and distributed.

## Standard Change Flow

1. Create a `codex/...` or feature branch.
2. Make the change and run local verification.
3. Push the branch and open a pull request.
4. Confirm pull-request checks pass.
5. Merge the pull request into `main`.
6. Watch the production workflows to completion.
7. Confirm the production API commit, schema, portal, and smoke checks.

Useful commands:

```bash
cd /Users/phillipmetzger/readyroute
npm run verify
gh pr checks <PR_NUMBER> --watch
gh run list --workflow release-production.yml --limit 3
gh run watch <RUN_ID> --exit-status
curl --fail --silent --show-error https://api.readyroute.org/health
```

## Release Types

### Portal Only

Use for manager/staff web UI changes with no backend contract change.

- Run portal lint, utility tests, and production build locally.
- Merge through GitHub.
- Verify the Vercel production deployment at `https://portal.readyroute.org`.
- No TestFlight build is needed.

### Backend Or Database

Use for API, server-side business logic, security, storage, and Supabase schema changes.

- Add every database change as a timestamped migration under `supabase/migrations`.
- Update `backend/src/config/schemaVersion.js` when the release requires that migration.
- Merge through GitHub and let the production workflow migrate before deploying Cloud Run.
- Never apply a required destructive migration before compatible runtime code is already live.

### Driver App

Use for driver or mobile manager screens, native permissions, background location, and app behavior.

Prepare locally:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
npm run release:prep
```

Only after an explicit mobile release decision:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Do not create a TestFlight build merely because portal or backend code changed.

### Coordinated Full Release

Release in this order:

1. Backward-compatible backend/runtime changes.
2. Required database migrations.
3. Final backend release using the new schema contract.
4. Manager portal deployment.
5. Driver app build and distribution.
6. Real-device field smoke test.

For destructive schema changes, use two backend releases when necessary: first remove runtime dependence on the old data, then remove the old schema/storage.

## Local Verification

Repository verification:

```bash
cd /Users/phillipmetzger/readyroute
npm run verify
```

Manager portal utility tests:

```bash
cd /Users/phillipmetzger/readyroute/manager-portal
node --test src/**/*.test.js
```

Driver app tests:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
npm test -- --runInBand
```

## Production Smoke Coverage

The authenticated production smoke test verifies:

- API health and portal routes;
- manager login and password-reset request;
- isolated driver creation, persistence, production-list filtering, and cleanup;
- isolated vehicle creation and cleanup;
- detailed manager inspection issue choice and severity;
- private manager inspection photo upload;
- signed photo retrieval after inspection submission; and
- cleanup of the smoke inspection, vehicle, and photo.

The smoke test may be run manually from the GitHub Actions `Production Smoke` workflow. It also runs automatically after backend deployment.

## Rollback Rules

- If migration fails, Cloud Run deployment must not begin.
- If Cloud Run health or release identity fails, do not claim the release succeeded.
- If production smoke fails, inspect the failed step before retrying or rolling traffic.
- Do not delete or rewrite a migration already recorded in production.
- Prefer a forward-fix migration over manual database edits.
- Never paste terminal prompts, command output, or secret values back into a shell command.

## What Still Requires A Human

Automation cannot certify:

- real iPhone/Android permissions;
- 5-second active/background location behavior and battery impact;
- actual cellular/offline recovery;
- a real FedEx manifest and dispatch day;
- driver usability under route pressure; or
- TestFlight/App Store delivery.

Use `PHASE1_FINAL_CHECKLIST.md` for the controlled field-validation sequence.
