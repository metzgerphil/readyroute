# ReadyRoute Claude Code Backcheck Handoff

Generated: 2026-07-05  
Repo: `git@github.com:metzgerphil/readyroute.git`  
Local path: `/Users/phillipmetzger/readyroute`  
Current branch when generated: `codex/app-release-ready-2026-06-01`  
Latest local commit when generated: `8d81f85d Bump driver app version to 1.0.3`

Use this file as the starting context for a Claude Code review/back-check of ReadyRoute. Do not paste production secrets, passwords, API keys, service account JSON, signing certificates, or one-time codes into Claude. Claude should inspect the repo directly and use this document as the map.

## One-Screen Summary

ReadyRoute is split into four main product surfaces:

| Surface | Folder | Production target | Main purpose |
| --- | --- | --- | --- |
| Backend API | `backend/` | `https://api.readyroute.org` on Google Cloud Run | Auth, routes, manifests, vehicles, inspections, records, billing, email, Supabase access |
| Manager portal | `manager-portal/` | `https://portal.readyroute.org` on Vercel | Browser operations console for managers/CSA operators |
| Driver/manager mobile app | `driver-app/` | Expo EAS, App Store/TestFlight | Driver route work plus mobile manager mode |
| Public site | `landing-page/` | `https://readyroute.org` and `https://www.readyroute.org` on Vercel | Marketing, MVP, waitlist, legal pages |

Recent release state:

- Backend was deployed to Cloud Run service `readyroute-api`.
- iOS app metadata is `1.0.3`.
- Latest iOS EAS production build observed: version `1.0.3`, build number `63`, commit `8d81f85d`.
- Previous attempted `1.0.2` build uploaded to EAS but App Store Connect rejected submission because version `1.0.2` had already been submitted.

## What Claude Should Back-Check First

Ask Claude Code to verify these before suggesting broad refactors:

1. Auth boundaries: manager-only, driver-only, public, and internal worker routes should remain correctly protected.
2. Vehicle inspection workflow: driver and manager inspection forms should use the same detailed issue options where expected.
3. Inspection photos: driver-uploaded and manager-uploaded inspection photos should be stored, returned by APIs, and visible to managers in inspection details.
4. Release config: app version/build config, Cloud Run target, Vercel projects, and environment variable names should match production.
5. Secrets: no `.env`, service keys, signing files, app-store credentials, or passwords should be committed.
6. Billing gates: routes guarded by active-subscription middleware should stay gated unless tests deliberately disable billing.
7. FedEx/FCC policy: automation is intentionally paused unless approved access exists; do not re-enable credential storage casually.
8. Supabase schema alignment: backend route expectations should match SQL migrations and `backend/src/scripts/fx*.sql`.

## Root Commands

Run from `/Users/phillipmetzger/readyroute`:

```bash
npm run verify
npm run deploy:backend
npm run deploy:portal
npm run deploy:landing
npm run smoke
npm run release:app:prep
```

`npm run verify` checks landing files, lints/builds the manager portal, and runs backend unit tests.  
`npm run release:app:prep` runs the Expo config check, Jest app tests, production iOS export, and release env check.

Do not start EAS production app builds unless explicitly approved, because those can create TestFlight/App Store artifacts.

## Repository Layout

| Path | Contents |
| --- | --- |
| `backend/` | Node/Express API, services, tests, Cloud Run Dockerfile, schema reference |
| `manager-portal/` | Vite React web app for managers |
| `driver-app/` | Expo React Native app for drivers and mobile manager mode |
| `landing-page/` | Static public website and legal pages |
| `scripts/` | Root release, smoke, deploy, and Cloud Scheduler scripts |
| `supabase/` | Supabase edge function and migration files |
| `docs/` | Focused QA and deployment notes |
| `.github/workflows/` | GitHub CI and production smoke workflows |
| `app-store-screenshots/` | App Store screenshot assets/scripts |
| `exports/` | Historical exported bundles; do not treat as current source of truth |

## Backend

Runtime:

- Node.js `>=20`
- Express
- Supabase service-role client
- Stripe SDK
- Resend via `fetch`
- Playwright for FCC/FedEx automation plumbing, currently paused by policy
- Google Maps geocoding and Google Route Optimization support

Important backend files:

| File | Purpose |
| --- | --- |
| `backend/src/app.js` | Express app factory, CORS, middleware, route mounting, `/health` |
| `backend/src/index.js` | Production server startup |
| `backend/src/lib/supabase.js` | Supabase client setup |
| `backend/src/middleware/auth.js` | Driver/manager JWT auth guards |
| `backend/src/middleware/billing.js` | Active subscription guard |
| `backend/src/middleware/multipart.js` | Multipart form parsing |
| `backend/schema.sql` | Schema reference |
| `backend/.env.example` | Backend env key checklist |

Backend mounted routes:

| Mount | Route file | Auth mode |
| --- | --- | --- |
| `/health` | `backend/src/app.js` | Public health |
| `/auth` | `backend/src/routes/auth.js` | Mixed public, manager, driver |
| `/billing` | `backend/src/routes/billing.js` | Manager plus Stripe webhook public raw body |
| `/waitlist` | `backend/src/routes/waitlist.js` | Public |
| `/internal` | `backend/src/routes/internalSync.js` | Worker secret |
| `/manager/property-intel` | `backend/src/routes/propertyIntelManager.js` | Manager plus billing |
| `/manager` | `backend/src/routes/manager.js` | Manager plus billing |
| `/api/vedr` | `backend/src/routes/vedr.js` | Manager plus billing |
| `/routes` | `backend/src/routes/routes.js` | Driver and manager depending on endpoint |
| `/timecards` | `backend/src/routes/timecards.js` | Driver |
| `/vehicles` | `backend/src/routes/vehicles.js` | Manager plus billing |
| `/safety-focuses` | `backend/src/routes/safetyFocuses.js` | Driver |

Backend route responsibilities:

- `auth.js`: manager start/complete trial, driver login, manager login, mobile multi-mode login, manager-driver session, password reset, password change.
- `billing.js`: Stripe checkout/setup and webhook handling.
- `manager.js`: dashboard, drivers, CSA switching/linking, billing summary/settings, route sync settings, notifications, FedEx account references, manager users/invites, timecards, records, route assignment/dispatch/archive, stop notes, property intel.
- `routes.js`: manifest upload, GPX upload, FedEx pull endpoints, driver notifications, status codes, today's route views, driver position, driver inspection photo/submit, odometer, stop details/completion/POD/road flags/notes/property intel.
- `vehicles.js`: fleet list/import/create/update, maintenance settings, maintenance records, reminder schedule, checklist templates, inspection assignments, manager inspection photo upload, inspection history/review, odometer and assignment history.
- `timecards.js`: driver clock-in, clock-out, break start/end, current status.
- `internalSync.js`: Cloud Scheduler/internal FedEx sync trigger with `FEDEX_SYNC_WORKER_SECRET`.
- `vedr.js`: VEDR provider settings and connection state.
- `waitlist.js`: early access and feedback form submissions.

Backend service files to inspect:

- `apartmentIntelligence.js`
- `appNotifications.js`
- `billing.js`
- `coordinates.js`
- `fccAutomationConfig.js`
- `fccDownloader.js`
- `fccProgressSync.js`
- `fedexCredentials.js`
- `fedexStatusCodes.js`
- `fedexSync.js`
- `gateCodeImport.js`
- `locationCorrections.js`
- `managerInviteEmail.js`
- `manifestGeocoding.js`
- `manifestIngest.js`
- `manifestMerge.js`
- `manifestParser.js`
- `propertyIntel.js`
- `resourceImport.js`
- `routeBilling.js`
- `routeIdentity.js`
- `routeOptimizer.js`
- `stopNotes.js`
- `testDataFilter.js`
- `vedrSettings.js`
- `vehicleInspectionRecords.js`
- `waitlistEmail.js`

Backend checks:

```bash
cd backend
npm run test:unit
npm test -- --runInBand
```

Backend deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:backend
curl -sS https://api.readyroute.org/health
```

Cloud Run target:

```text
Project: ready-route-project
Region: us-west1
Service: readyroute-api
Domain: api.readyroute.org
```

## Manager Portal

Runtime:

- Vite
- React 19
- React Router 7
- TanStack Query
- Axios
- Google Maps JS API loader

Vercel project:

```text
Project: manager-portal
Project ID: prj_fkit6VjgKUUlx28IJHkBLuBWbxZi
Org/team ID: team_9qgT8TwZoJyK1COICngLd7lK
Production domain: portal.readyroute.org
```

Manager portal route map from `manager-portal/src/App.jsx`:

| URL | Page file | Purpose |
| --- | --- | --- |
| `/login` | `LoginPage.jsx` | Manager login and password reset request |
| `/start-trial` | `StartTrialPage.jsx` | Public trial start |
| `/trial/activate` | `TrialActivatePage.jsx` | Trial activation/complete setup |
| `/reset-password` | `ResetPasswordPage.jsx` | Manager password reset |
| `/` | `DashboardPage.jsx` | Manager dashboard |
| `/csa` | `CsaPage.jsx` | CSA access, linked workspaces, FedEx reference records |
| `/manifest` | `ManifestPage.jsx` | Manifest upload, dispatch, archive |
| `/notifications` | `NotificationsPage.jsx` | Manager notifications |
| `/records` | `RecordsPage.jsx` | Records and labor views |
| `/drivers` | `DriversPage.jsx` | Driver roster, manager invites, driver documents |
| `/vehicles` | `VehiclesPage.jsx` | Vehicles, maintenance, inspections |
| `/access-codes` | `AccessCodesPage.jsx` | Property access codes/intel |
| `/billing` | `BillingPage.jsx` | Billing summary and account settings |
| `/vedr` | `VedrPage.jsx` | VEDR provider settings |
| `/setup` | `SetupPage.jsx` | Account setup checklist |
| `/fleet-map` | `FleetMapPage.jsx` | Live fleet map |
| `/time-commits` | `TimeCommitsPage.jsx` | P&D time commitments |
| `/debug/google-map` | `DebugGoogleMapPage.jsx` | Google map debug page |
| `/routes` | `RoutesPage.jsx` | Route list |
| `/route/:id` and `/routes/:id` | `RoutePage.jsx` | Route detail map/stop review |

Manager portal core files:

- `manager-portal/src/services/api.js`: Axios base URL and auth header injection.
- `manager-portal/src/services/auth.js`: localStorage manager token and selected CSA cache.
- `manager-portal/src/context/SelectedCsaContext.jsx`: selected CSA context.
- `manager-portal/src/components/Layout.jsx`: portal shell/navigation.
- `manager-portal/src/components/PortalDesignSystem.jsx`: shared UI primitives.
- `manager-portal/src/lib/googleMapsLoader.js`: Google Maps loader and key handling.
- `manager-portal/src/index.css` and page CSS files: main styling.

Manager portal checks/deploy:

```bash
cd manager-portal
npm run lint
npm run build

cd /Users/phillipmetzger/readyroute
npm run deploy:portal
```

Manager portal environment:

```text
VITE_API_URL=https://api.readyroute.org
VITE_API_URL_LOCAL=http://localhost:3001
VITE_GOOGLE_MAPS_KEY=<browser maps key>
```

## Driver App And Mobile Manager Mode

Runtime:

- Expo SDK 54
- React Native 0.81
- React Navigation stack
- AsyncStorage session storage
- Axios API client
- Expo Image Picker, Camera, File System, Location, Notifications
- React Native Maps

Expo/EAS:

```text
App name: ReadyRoute
Slug: driver-app
Bundle identifier/package: com.readyroute.driverapp
Current app version: 1.0.3
EAS project ID: 3de49618-8973-4330-b335-f2901d75ac46
EAS appVersionSource: remote
iOS ASC app ID: 6762488881
Production iOS image: macos-sequoia-15.6-xcode-26.0
```

Navigation map from `driver-app/src/navigation/AppNavigator.js`:

| Stack screen | Screen file | Mode | Purpose |
| --- | --- | --- | --- |
| `Login` | `LoginScreen.js` | Public | Driver/manager/mobile login and password reset request |
| `PortalEntry` | `PortalEntryScreen.js` | Shared | Choose driver or manager mode when both are available |
| `Home` | `HomeScreen.js` | Driver | Driver home, inspections, timecards, route summary |
| `Notifications` | `NotificationsScreen.js` | Driver | Driver notifications |
| `MyDrive` | `MyDriveScreen.js` | Driver | Route map, navigation workflow, live position/timecard controls |
| `Manifest` | `ManifestScreen.js` | Driver | Manifest/stop list view |
| `StopDetail` | `StopDetailScreen.js` | Driver/manager | Stop details, completion, notes, POD/location/property intel |
| `ManagerDashboard` | `ManagerDashboardScreen.js` | Manager | Mobile manager dashboard |
| `ManagerRoutes` | `ManagerRoutesScreen.js` | Manager | Mobile manager routes |
| `ManagerManifest` | `ManagerManifestScreen.js` | Manager | Mobile manager manifest upload/dispatch |
| `ManagerDrivers` | `ManagerDriversScreen.js` | Manager | Mobile manager drivers |
| `ManagerAccessCodes` | `ManagerAccessCodesScreen.js` | Manager | Mobile manager property access codes |
| `ManagerVehicles` | `ManagerVehiclesScreen.js` | Manager | Mobile manager vehicles, maintenance, inspections |
| `ManagerNotifications` | `NotificationsScreen.js` with manager mode | Manager | Mobile manager notifications |
| `ManagerVedr` | `ManagerVedrScreen.js` | Manager | Mobile manager VEDR settings |
| `ManagerMap` | `ManagerMapScreen.js` | Manager | Mobile manager map |
| `ManagerSettings` | `ManagerSettingsScreen.js` | Manager | Mobile settings/mode info |

Driver app core files:

- `driver-app/app.config.js`: Expo app config, bundle ID, permissions, maps key injection.
- `driver-app/eas.json`: EAS build/submit profiles.
- `driver-app/src/services/api.js`: API base URL and driver/manager auth mode handling.
- `driver-app/src/services/auth.js`: session token storage.
- `driver-app/src/context/PortalSessionContext.js`: active driver/manager mode session logic.
- `driver-app/src/components/MobileNavigationDrawer.js`: mobile shell navigation.
- `driver-app/src/utils/vehicleInspection.js`: shared inspection item definitions and helpers.
- `driver-app/src/theme/appTheme.js` and `driver-app/src/theme/managerTheme.js`: app styling tokens.

Driver app checks:

```bash
cd driver-app
npm run check
npm run test
npm run release:prep
```

Driver app EAS release commands:

```bash
cd driver-app
eas build:version:get --platform ios --non-interactive
eas build --platform ios --profile production --auto-submit --non-interactive --wait
```

Only run EAS build/submit after explicit approval.

Driver app environment:

```text
EXPO_PUBLIC_API_URL=https://api.readyroute.org
EXPO_PUBLIC_API_URL_LOCAL=http://127.0.0.1:3001
EXPO_PUBLIC_USE_LOCAL_API=false
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<mobile maps key>
```

## Public Landing Page

Static files:

| File | Purpose |
| --- | --- |
| `landing-page/index.html` | Main public site |
| `landing-page/mvp.html` | MVP landing page |
| `landing-page/about.html` | About page |
| `landing-page/privacy.html` | Privacy page |
| `landing-page/terms.html` | Terms page |
| `landing-page/assets/` | Logo and page imagery |
| `landing-page/vercel.json` | Clean URL routing |

Vercel project:

```text
Project: landing-page
Project ID: prj_jM9cDzf32BBmTWSH4nMoBj2nuLlI
Org/team ID: team_9qgT8TwZoJyK1COICngLd7lK
Production domains: readyroute.org, www.readyroute.org
```

Deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:landing
```

## Database And Supabase

Supabase is the operational data layer for:

- Accounts and CSAs
- Manager users and CSA access
- Drivers and driver documents
- Vehicles, maintenance, odometer records, inspections, inspection photos
- Routes, stops, packages, pickups, deliveries
- Access codes/property intel
- VEDR provider settings
- Notifications
- Timecards/labor/records
- Waitlist/feedback

Relevant files:

- `backend/schema.sql`
- `supabase/migrations/*.sql`
- `supabase/functions/send-waitlist-thank-you-email/index.ts`
- `backend/src/scripts/fx*.sql`
- `backend/src/scripts/v*.sql`

Important recent schema/script areas:

- `fx40_vehicle_inspections.sql`
- `fx42_vehicle_inspection_route_link.sql`
- `fx46_vehicle_inspection_schema_alignment.sql`
- `fx48_vehicle_inspection_2_0_statuses.sql`
- `fx49_vehicle_inspection_photo_bucket.sql`
- `fx52_vehicle_inspection_assignments.sql`

Supabase safety rules:

- Backend uses `SUPABASE_SERVICE_KEY`; client apps should not receive it.
- Do not paste service-role keys into Claude.
- Check Row Level Security before exposing any browser/mobile direct Supabase access.
- Schema changes should be applied deliberately and backed by repo SQL.

## Important Environment Variables

Backend/Cloud Run:

```text
NODE_ENV=production
APP_TIME_ZONE=America/Los_Angeles
PORT=8080
JWT_SECRET
SUPABASE_URL
SUPABASE_SERVICE_KEY
GOOGLE_MAPS_API_KEY
GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID
GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
STRIPE_TRIAL_DAYS
RESEND_API_KEY
RESEND_FROM_EMAIL
MANAGER_PORTAL_URL=https://portal.readyroute.org
READYROUTE_ENABLE_PUBLIC_TRIALS
READYROUTE_PUSH_NOTIFICATIONS
FEDEX_SYNC_WORKER_SECRET
FEDEX_SYNC_MODE
FEDEX_SYNC_MANIFEST_INTERVAL_MS
FEDEX_SYNC_PROGRESS_INTERVAL_MS
FEDEX_SYNC_TICK_INTERVAL_MS
FEDEX_INGEST_SHARED_SECRET
FEDEX_FCC_AUTOMATION_ENABLED=false
```

Manager portal/Vercel:

```text
VITE_API_URL=https://api.readyroute.org
VITE_API_URL_LOCAL=http://localhost:3001
VITE_GOOGLE_MAPS_KEY
```

Driver app/EAS:

```text
EXPO_PUBLIC_API_URL=https://api.readyroute.org
EXPO_PUBLIC_API_URL_LOCAL=http://127.0.0.1:3001
EXPO_PUBLIC_USE_LOCAL_API=false
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
```

Production smoke:

```text
SMOKE_BACKEND_URL=https://api.readyroute.org
SMOKE_PORTAL_URL=https://portal.readyroute.org
SMOKE_MANAGER_EMAIL
SMOKE_MANAGER_PASSWORD
SMOKE_PASSWORD_RESET_EMAIL
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

## Third-Party Login And Admin Dashboard Guide

Do not store credentials in this file. Use the owner's password manager, platform SSO, passkeys, or existing authenticated CLI sessions.

| Platform | Login/admin URL | ReadyRoute use | ReadyRoute identifiers to check after login |
| --- | --- | --- | --- |
| GitHub | `https://github.com/login` | Source code, branches, PRs, Actions | Repo `metzgerphil/readyroute` |
| Vercel | `https://vercel.com/login` | Manager portal and landing hosting, DNS | Team `phillovesjoy-9153s-projects`, org/team ID `team_9qgT8TwZoJyK1COICngLd7lK`; projects `manager-portal`, `landing-page` |
| Google Cloud Console | `https://console.cloud.google.com/` | Cloud Run, Cloud Scheduler, Secret Manager, Google APIs | Project `ready-route-project`, region `us-west1`, service `readyroute-api` |
| Cloud Run direct | `https://console.cloud.google.com/run` | Backend service revisions, logs, traffic, env | Service `readyroute-api`, domain `api.readyroute.org` |
| Google API credentials | `https://console.cloud.google.com/apis/credentials` | Maps keys, service accounts, route optimization credentials | Restrict browser/mobile/server keys correctly |
| Resend | `https://resend.com/login` | Transactional emails | API key used by Cloud Run; sender `ReadyRoute <info@readyroute.org>` when configured |
| Supabase | `https://supabase.com/dashboard/sign-in` | Database, storage, edge functions | Production project; service-role key must stay server-only |
| Stripe | `https://dashboard.stripe.com/login` | Billing, subscriptions, webhooks | Webhook endpoint `https://api.readyroute.org/billing/webhook`; env keys in Cloud Run |
| Expo | `https://expo.dev/login` | EAS app builds and submissions | Account `metzgerphil`, project `driver-app`, project ID `3de49618-8973-4330-b335-f2901d75ac46` |
| Apple App Store Connect | `https://appstoreconnect.apple.com/login` | iOS TestFlight/App Store | ASC app ID `6762488881`; bundle ID `com.readyroute.driverapp` |
| Google Play Console | `https://play.google.com/console` | Android app distribution if/when used | Package `com.readyroute.driverapp` |
| Name.com | `https://www.name.com/account/login` | Domain registrar | Domain `readyroute.org`; active DNS is Vercel DNS |
| ImprovMX | `https://app.improvmx.com/login` | Inbound email forwarding | Preserve MX/SPF records in Vercel DNS |
| FedEx/MyBizAccount/FCC | Use official FedEx/MyBizAccount/FCC login controlled by business owner | Manual manifest download/reference only while automation is paused | ReadyRoute policy: do not store FedEx/MyBizAccount usernames/passwords in ReadyRoute |

CLI login checks:

```bash
gh auth status
npx vercel whoami
gcloud auth list
gcloud config get project
eas whoami
```

Useful CLI login commands when not authenticated:

```bash
gh auth login
npx vercel login
gcloud auth login
gcloud config set project ready-route-project
eas login
```

Google Cloud Run checks:

```bash
gcloud run services describe readyroute-api \
  --project ready-route-project \
  --region us-west1

gcloud run revisions list \
  --service readyroute-api \
  --project ready-route-project \
  --region us-west1 \
  --limit 5
```

Vercel checks:

```bash
npx vercel project ls
npx vercel env ls --cwd manager-portal
npx vercel env ls --cwd landing-page
```

Expo/EAS checks:

```bash
cd driver-app
eas whoami
eas build:list --platform ios --limit 5 --non-interactive
eas build:version:get --platform ios --non-interactive
```

## Deployment Procedures

Backend:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:backend
npm run smoke
```

Manager portal:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:portal
npm run smoke
```

Landing page:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:landing
```

App release prep:

```bash
cd /Users/phillipmetzger/readyroute
npm run release:app:prep
```

iOS EAS build and submit, only after approval:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas build --platform ios --profile production --auto-submit --non-interactive --wait
```

Production smoke:

```bash
cd /Users/phillipmetzger/readyroute
npm run smoke
curl -sS https://api.readyroute.org/health
curl -I https://portal.readyroute.org
curl -I https://readyroute.org
```

## GitHub Actions

| Workflow | File | Purpose |
| --- | --- | --- |
| Backend CI | `.github/workflows/backend-ci.yml` | Runs backend unit tests on backend changes |
| Portal CI | `.github/workflows/portal-ci.yml` | Lints/builds manager portal on portal changes |
| Production Smoke | `.github/workflows/production-smoke.yml` | Manual or dispatch production smoke against live services |

Note: some workflow defaults still mention the old Railway backend URL as fallback. Production docs and current deploy scripts target `https://api.readyroute.org` on Google Cloud Run.

## Security And Policy Notes

- Never commit real `.env` files.
- Never expose `SUPABASE_SERVICE_KEY` to `driver-app` or `manager-portal`.
- Never commit Google service account JSON.
- Never commit Resend, Stripe, Supabase, Google, Apple, EAS, or signing credentials.
- Do not store FedEx/MyBizAccount usernames/passwords in ReadyRoute.
- Keep FCC automation disabled unless FedEx-approved access and a documented credential model exist.
- Manager routes should require manager JWTs.
- Driver routes should require driver JWTs.
- Internal sync routes should require `FEDEX_SYNC_WORKER_SECRET`.
- Billing-protected manager routes should keep `requireActiveSubscription` unless tests explicitly disable it.

## Claude Backcheck Prompt

Suggested prompt to paste into Claude Code with this repo open:

```text
You are reviewing the ReadyRoute repo. Use READYROUTE_CLAUDE_CODE_BACKCHECK.md as the code map. Back-check the current implementation for security, auth, deployment, and product-flow regressions. Prioritize:

1. Manager vs driver auth boundaries.
2. Vehicle inspection detailed options and photo upload/visibility in driver app, mobile manager mode, manager portal, backend, and Supabase schema scripts.
3. Release configuration for Cloud Run, Vercel, Expo EAS, App Store Connect, and production environment variables.
4. Any stale references to old hosting, local APIs, or unsafe secrets.
5. Tests that should cover the most recently changed inspection/photo workflows.

Return findings first, ordered by severity, with file paths and exact reasoning. Do not suggest broad refactors unless they reduce a concrete bug or release risk.
```

## Existing Local Docs Worth Reading

- `README.md`
- `READYROUTE_CODE_MAP.md`
- `READYROUTE_PROCEDURES.md`
- `DEPLOYMENT.md`
- `GITHUB_CLOUD_RUN_SETUP.md`
- `READYROUTE_RELEASE_PLAYBOOK.md`
- `docs/deployment.md`
- `docs/google-cloud-run-migration.md`
- `docs/vehicle-inspection-2-0-spec.md`
- `FCC_DISPATCH_SYNC_PLAN.md`
- `FCC_DISPATCH_SYNC_SPEC.md`

## Official Login References Checked

- GitHub: `https://github.com/login`
- Vercel: `https://vercel.com/login`
- Google Cloud Console: `https://console.cloud.google.com/`
- Google Cloud Run: `https://console.cloud.google.com/run`
- Google API credentials: `https://console.cloud.google.com/apis/credentials`
- Resend: `https://resend.com/login`
- Supabase: `https://supabase.com/dashboard/sign-in`
- Stripe: `https://dashboard.stripe.com/login`
- Expo: `https://expo.dev/login`
- Apple App Store Connect: `https://appstoreconnect.apple.com/login`
- Google Play Console: `https://play.google.com/console`
- Name.com: `https://www.name.com/account/login`
- ImprovMX: `https://app.improvmx.com/login`
