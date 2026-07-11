# ReadyRoute Procedures And Platforms

This is the plain-English operating guide for ReadyRoute: what each service is used for, where production lives, and what to do when updating the system.

## Platform Map

| Platform | What ReadyRoute uses it for | Production details |
| --- | --- | --- |
| GitHub | Source code, branches, pull requests, history | Repository: `metzgerphil/readyroute` |
| Vercel | Public website and manager portal hosting | `readyroute.org`, `www.readyroute.org`, `portal.readyroute.org` |
| Google Cloud Run | Backend API hosting | `api.readyroute.org`, service `readyroute-api`, project `ready-route-project`, region `us-west1` |
| Google Cloud Scheduler | Scheduled backend worker calls | FedEx sync endpoints when enabled |
| Google Secret Manager / Cloud Run env | Backend secrets and production config | Supabase, JWT, Resend, Stripe, maps, worker secrets |
| Supabase | Production database/data layer | Accounts, CSAs, managers, routes, vehicles, drivers, records |
| Resend | ReadyRoute transactional email | Feedback, waitlist, password reset/invite email |
| Stripe | Billing/subscription system | Subscription checkout and webhook handling |
| Expo EAS | Native app builds | iOS and Android production builds |
| Apple App Store Connect | iOS App Store/TestFlight distribution | ReadyRoute iOS app |
| Google Play / Android build artifacts | Android testing/distribution | APK/AAB from EAS |
| Google Maps Platform | Maps, geocoding, routing/map keys | Browser and mobile API keys should be restricted |
| Name.com / Vercel DNS | Domain/DNS ownership and records | DNS hosted through Vercel nameservers |

## Production URLs

| Surface | URL |
| --- | --- |
| Public site | `https://readyroute.org` |
| Public site www | `https://www.readyroute.org` |
| MVP page | `https://readyroute.org/mvp` |
| Manager portal | `https://portal.readyroute.org` |
| Backend API | `https://api.readyroute.org` |
| Backend health check | `https://api.readyroute.org/health` |

## Normal Change Process

Use this flow for most changes:

1. Make the code change locally.
2. Run the relevant local check.
3. Review `git diff`.
4. Commit and push to GitHub.
5. Deploy the affected surface.
6. Run production smoke checks.

For app builds, get explicit approval before starting EAS builds or submitting to Apple/Android.

## What To Deploy For Each Type Of Change

| Change type | Deploy needed |
| --- | --- |
| Backend API/business logic | Google Cloud Run backend |
| Manager portal UI | Vercel manager portal |
| Public website/MVP page | Vercel landing page |
| Driver app or manager app mobile UI | New EAS app build |
| Supabase schema only | Apply SQL in Supabase, then smoke affected flows |
| Email template/API behavior | Backend deploy, Resend config if needed |
| DNS/domain/email authentication | Vercel DNS/Name.com/Resend; no code deploy unless app URLs changed |

## Root Commands

Run from:

```text
/Users/phillipmetzger/readyroute
```

Commands:

```bash
npm run verify
npm run deploy:backend
npm run deploy:portal
npm run deploy:landing
npm run smoke
```

## Backend Procedure

Use when changing API routes, auth, database access, route logic, billing, email, or server-side behavior.

Check/deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:backend
npm run smoke
```

Confirm live backend:

```bash
curl -sS https://api.readyroute.org/health
```

Cloud Run details:

```text
Project: ready-route-project
Region: us-west1
Service: readyroute-api
Domain: api.readyroute.org
```

Useful Cloud Shell command:

```bash
gcloud run revisions list \
  --service readyroute-api \
  --project ready-route-project \
  --region us-west1 \
  --limit 5
```

Rollback:

1. Open Google Cloud Run.
2. Open `readyroute-api`.
3. Go to Revisions.
4. Route traffic to the last known-good revision.
5. Run:

```bash
curl -sS https://api.readyroute.org/health
npm run smoke
```

## Manager Portal Procedure

Use when changing portal pages, manager workflows, maps, tables, forms, or portal styling.

Check/deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:portal
npm run smoke
```

Vercel details:

```text
Project: manager-portal
Production domain: portal.readyroute.org
Production env: VITE_API_URL=https://api.readyroute.org
```

Rollback:

1. Open Vercel.
2. Open project `manager-portal`.
3. Go to Deployments.
4. Promote the last known-good deployment to Production.
5. Run:

```bash
npm run smoke
```

## Landing Page Procedure

Use when changing the public site, MVP page, feedback form copy, waitlist copy, or pricing copy.

Deploy:

```bash
cd /Users/phillipmetzger/readyroute
npm run deploy:landing
```

Vercel details:

```text
Project: landing-page
Production domains: readyroute.org, www.readyroute.org
```

Quick check:

```bash
curl -I https://readyroute.org
curl -I https://www.readyroute.org
```

## App Build Procedure

Use when changing anything in:

```text
driver-app/
```

Important: do not start an EAS deploy/build without explicit approval.

Prep:

```bash
cd /Users/phillipmetzger/readyroute
npm run release:app:prep
```

iOS build:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas build --platform ios --profile production
```

iOS submit:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas submit --platform ios --profile production
```

Android build:

```bash
cd /Users/phillipmetzger/readyroute/driver-app
eas build --platform android --profile production
```

Android APK builds are useful for direct tablet testing. AAB builds are used for Google Play style distribution.

## Supabase Procedure

Use Supabase for data and schema.

Supabase stores:

- CSA/account records.
- Manager users and access.
- Drivers.
- Vehicles.
- Routes, stops, packages, pickups, deliveries.
- Access codes/property intel.
- Maintenance and inspections.
- VEDR provider data.
- Records and labor/timecard data.

Rules:

- Do not store Supabase service-role keys in Git.
- Backend uses service-role access; browser/mobile apps should go through the backend API.
- Before major SQL changes, know whether a rollback is possible.
- After applying SQL, run the relevant portal/app/backend smoke checks.

## Resend Procedure

Use Resend for ReadyRoute emails.

Current email responsibilities:

- Waitlist/feedback email.
- Manager invites/password reset emails when configured.
- Other transactional emails as added.

Rules:

- API key should live in Google Secret Manager / Cloud Run environment.
- DNS records should live in Vercel DNS.
- Do not commit Resend API keys.
- If email fails, check Cloud Run logs and Resend domain/API key status.

## Google Maps Procedure

ReadyRoute uses Google Maps for portal and mobile map experiences.

Keys should be restricted:

- Browser key: website restrictions for portal/landing as needed.
- iOS key: iOS bundle restrictions.
- Android key: Android package name and SHA-1 restrictions.
- Server key: backend/server-side restrictions where possible.

If maps fail:

1. Confirm the correct key is being used.
2. Confirm the API is enabled.
3. Confirm restrictions match the app/domain.
4. Check browser/app console/logs for key or API errors.

## FedEx / MyBizAccount Policy

Current policy:

- ReadyRoute should not collect or store FedEx/MyBizAccount usernames or passwords.
- FedEx-approved access should be used before automated FedEx data access is active.
- Manual manifest upload remains the safe workflow until approved integration access exists.

If this policy changes, document the FedEx approval, security model, and credential handling before building or enabling it.

## Security Rules To Preserve

- Do not commit secrets.
- Do not expose Supabase service-role keys to client apps.
- Manager CSA linking requires an invitation/authorized manager record for that CSA.
- Backend protected routes should require manager/driver auth.
- App store and EAS signing credentials should be handled through Apple/EAS, not copied into the repo.
- Production deploys should be reproducible from Git.

## Production Smoke Checks

Run after backend or portal deploys:

```bash
cd /Users/phillipmetzger/readyroute
npm run smoke
```

Quick manual checks:

```bash
curl -sS https://api.readyroute.org/health
curl -I https://portal.readyroute.org
curl -I https://readyroute.org
```

## Storage / External Drive Notes

The ReadyRoute code can live on an external drive if needed, but GitHub should remain the source of truth.

When moving the repo:

1. Make sure all important work is committed or backed up.
2. Copy the repo folder to the external drive.
3. Open the external-drive repo in the editor.
4. Run:

```bash
git status
npm run verify
```

Do not rely on a single external drive as the only copy of uncommitted production work.
