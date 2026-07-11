# ReadyRoute Code Map

This file explains where the ReadyRoute code lives and what each part of the repository is responsible for.

## Main Surfaces

| Folder | What it is | Live product |
| --- | --- | --- |
| `backend/` | Node/Express API, business logic, Supabase access, email sending, route/driver/vehicle logic | `https://api.readyroute.org` |
| `manager-portal/` | Web app for managers and CSA operators | `https://portal.readyroute.org` |
| `driver-app/` | Expo React Native app for iPhone, iPad, Android phone, and Android tablet | App Store / TestFlight / Android builds |
| `landing-page/` | Public marketing and MVP interest pages | `https://readyroute.org` and `https://www.readyroute.org` |
| `supabase/` | Supabase edge functions and database-related project files | Supabase project |
| `scripts/` | Release, smoke-test, deploy, and setup scripts | Local/GitHub/Cloud Shell operations |
| `docs/` | Focused QA, migration, and feature notes | Internal documentation |

## Backend

Location:

```text
backend/
```

The backend owns:

- Manager login and manager access control.
- Driver login and PIN access.
- CSA switching and CSA linking.
- Route, stop, manifest, package, pickup, delivery, and dispatch logic.
- Driver, vehicle, maintenance, inspection, VEDR, records, and access-code APIs.
- Supabase reads/writes using the service role key.
- Resend email calls.
- Stripe billing/webhook handling.
- Google Maps/route/geocoding server-side integrations where needed.
- Production smoke-test script.

Important files:

| Path | Purpose |
| --- | --- |
| `backend/src/index.js` | API startup |
| `backend/src/routes/manager.js` | Main manager portal/app API routes |
| `backend/src/routes/auth.js` | Auth and account setup routes |
| `backend/src/routes/waitlist.js` | Landing/MVP waitlist and feedback routes |
| `backend/src/lib/supabase.js` | Supabase client setup |
| `backend/src/scripts/productionSmoke.js` | Production smoke checks |
| `backend/schema.sql` | Backend schema reference |

Run locally/check:

```bash
cd backend
npm test -- --runInBand
```

Deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:backend
```

## Manager Portal

Location:

```text
manager-portal/
```

The manager portal owns the browser experience for:

- Dashboard.
- Morning setup.
- Fleet map.
- Routes.
- P&D time commits.
- Drivers.
- Vehicles.
- Access codes/property intel.
- Records.
- CSA access/workspace management.
- VEDR providers.
- Login, setup, trial activation, and password reset.

Important files:

| Path | Purpose |
| --- | --- |
| `manager-portal/src/pages/DriversPage.jsx` | Driver directory, manager invite modal, driver profile/docs |
| `manager-portal/src/pages/VehiclesPage.jsx` | Vehicle fleet, maintenance, inspections |
| `manager-portal/src/pages/CsaPage.jsx` | CSA access, linked workspaces, MyBizAccount reference record |
| `manager-portal/src/pages/RoutesPage.jsx` | Route operations |
| `manager-portal/src/pages/RoutePage.jsx` | Individual route map/stop review |
| `manager-portal/src/pages/DashboardPage.jsx` | CSA dashboard |
| `manager-portal/src/index.css` | Main portal styling |
| `manager-portal/vercel.json` | Vercel SPA routing config |

Build/check:

```bash
cd manager-portal
npm run build
```

Deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:portal
```

## Driver App

Location:

```text
driver-app/
```

The app owns both driver and manager mobile/tablet workflows.

Driver mode includes:

- Driver home and route list.
- Map view.
- Stop detail.
- Pickup/delivery completion.
- Notes, access instructions, and corrected pins.
- Timecard/labor workflows.
- Vehicle inspection flows.

Manager mode includes:

- Manager overview.
- CSA switching.
- Map view.
- Routes.
- Vehicles.
- Maintenance and inspections.
- Drivers.
- Access codes.
- VEDR.
- Settings.

Important files:

| Path | Purpose |
| --- | --- |
| `driver-app/app.config.js` | Expo app config, app name/icon/build config |
| `driver-app/eas.json` | EAS build profiles |
| `driver-app/src/screens/ManagerDriversScreen.js` | Manager driver area in app |
| `driver-app/src/screens/ManagerVehiclesScreen.js` | Manager vehicle area in app |
| `driver-app/src/screens/ManagerOverviewScreen.js` | Manager home/overview |
| `driver-app/src/services/managerOperations.js` | Manager API calls used by app |
| `driver-app/src/components/MobileNavigationDrawer.js` | Mobile manager/driver navigation menu |
| `driver-app/assets/` | App icons, splash, and image assets |

Prepare/check:

```bash
cd /Users/phillipmetzger/readyroute
npm run release:app:prep
```

Builds:

```bash
cd driver-app
eas build --platform ios --profile production
eas build --platform android --profile production
```

Important: app builds must not be started without explicit approval because users get app changes through TestFlight/App Store/Android install paths.

## Landing Page

Location:

```text
landing-page/
```

The landing page owns:

- Public ReadyRoute website.
- MVP page.
- Waitlist and feedback forms.
- Marketing copy and pricing copy.

Deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:landing
```

## Scripts

Location:

```text
scripts/
```

| Script | Purpose |
| --- | --- |
| `scripts/verify.sh` | Run broad local verification |
| `scripts/release-backend.sh` | Test and deploy backend to Google Cloud Run |
| `scripts/release-portal.sh` | Build and deploy manager portal to Vercel |
| `scripts/release-landing.sh` | Deploy landing page to Vercel |
| `scripts/release-smoke.sh` | Run production smoke checks |
| `scripts/setup-cloud-scheduler-fedex-sync.sh` | Configure Cloud Scheduler jobs for FedEx sync endpoint |

Root commands:

```bash
npm run verify
npm run deploy:backend
npm run deploy:portal
npm run deploy:landing
npm run smoke
```

## Database And Schema

Production data lives in Supabase. Code should not store secrets in Git.

Supabase is used for:

- Accounts/CSAs.
- Manager users.
- Drivers.
- Vehicles.
- Routes/stops/packages.
- Access codes/property intel.
- Maintenance and inspection records.
- VEDR providers.
- Records and operational history.

Schema changes should be applied deliberately in Supabase SQL editor or migration tooling, then documented in the repo.

## What Not To Commit

Do not commit:

- `.env` files with real secrets.
- Google service account JSON files.
- Resend API keys.
- Supabase service-role keys.
- Apple signing credentials.
- Android keystores.
- Generated `node_modules/`.
- Local build artifacts unless intentionally needed.

## Source Of Truth

GitHub should remain the source of truth for code. Production can be deployed manually when necessary, but every production code change should also be committed and pushed so the live system is reproducible.
