# ReadyRoute Phase 1 Release-Readiness Checklist

Last updated: `2026-07-11`

This is the source of truth for deciding whether ReadyRoute is ready for a controlled live pilot. It separates checks the release pipeline can prove from checks that require a real phone, driver, vehicle, and route day.

## Current Status

ReadyRoute is feature-complete enough for structured field validation, but Phase 1 is not fully proven until a real route day succeeds.

Current decisions:

- Delivery signatures are not part of ReadyRoute and have been removed from the app, portal, API, database, and storage.
- Driver location updates remain approximately every 5 seconds during active tracking.
- Route billing remains in shadow mode until ReadyRoute is approved to charge customers.
- Planned billing is `$15 USD` per imported route, including routes above the customer's original monthly commitment after authorization.
- Do not create a new TestFlight build until the current product work is ready for a coordinated mobile release.

## 1. Automated Release Gate

These checks must pass on every production backend release through GitHub Actions.

- [x] Backend unit tests pass.
- [x] Required database schema version matches production.
- [x] Supabase migrations apply before Cloud Run deployment.
- [x] Cloud Run reports the exact Git commit being served.
- [x] `/health` reports `compatible: true` for the database schema.
- [x] Manager portal production routes respond successfully.
- [x] Manager login succeeds with the isolated smoke account.
- [x] Manager driver creation, persistence, production-list filtering, and cleanup succeed.
- [x] Manager vehicle creation and cleanup succeed using explicitly marked test data.
- [x] Detailed manager inspection submission preserves issue choice and severity.
- [x] Manager inspection photo upload uses the private `vehicle-inspection-photos` bucket.
- [x] Inspection detail returns temporary signed photo access.
- [x] Production smoke records and their private photos are removed after each run.

Release workflow: `.github/workflows/release-production.yml`

Production smoke: `backend/src/scripts/productionSmoke.js`

## 2. Production Infrastructure

- [x] Operational storage buckets are private.
- [x] Legacy delivery-signature storage is removed.
- [x] Customer and ReadyRoute staff authentication are separate.
- [x] Staff-only support and CRM routes reject customer manager tokens.
- [x] Request limits, rate limits, CORS, and structured request logging are enabled.
- [x] Production deployment uses GitHub Actions, Supabase migrations, and immutable Cloud Run releases.
- [x] Account cancellation retains data for the configured recovery period instead of deleting immediately.
- [ ] Perform and document one database restore rehearsal from a Supabase backup.
- [ ] Confirm production alert recipients and escalation ownership for Cloud Run/API failures.

## 3. Manager Portal Field Validation

Run these checks in `https://portal.readyroute.org` with a controlled pilot company.

- [ ] Manager login and password reset work in a real browser.
- [ ] Dashboard metrics match the pilot company's actual route data.
- [ ] Fleet readiness reasons link to the correct inspection, maintenance, or document record.
- [ ] Manager-created inspections show the same detailed choices as driver inspections.
- [ ] Inspection photos remain visible to managers after submission and refresh.
- [ ] Unsafe inspection review requires an explicit vehicle decision.
- [ ] Vehicle readiness and vehicle operating status remain consistent across Fleet and Inspections.
- [ ] Real FedEx manifest upload creates the expected route, stops, packages, and assignments.
- [ ] Route dispatch and post-dispatch change warnings behave correctly.
- [ ] Live driver position appears on the manager map.

## 4. Driver App Field Validation

Run on the current internal build first. A new TestFlight build is a separate release decision.

- [ ] Login works on a real iPhone.
- [ ] Login works on a real Android phone before Android launch is claimed.
- [ ] Background and always-location permission flow is understandable and successful.
- [ ] Active tracking posts approximately every 5 seconds without unacceptable battery or heat impact.
- [ ] Driver inspection starts neutral and requires every enabled item to be answered.
- [ ] Driver and manager inspection issue choices match exactly.
- [ ] Inspection photo upload survives ordinary cellular conditions.
- [ ] Submitted photos are visible in the manager portal.
- [ ] `My Drive`, manifest, stop detail, and map all agree on the current/next stop.
- [ ] External navigation opens the expected destination.
- [ ] Delivered and attempted stops save the correct status and advance correctly.
- [ ] Temporary signal loss queues work safely and recovers without duplicate completion.
- [ ] Driver can recover cleanly after force-closing and reopening the app.

## 5. Real Route-Day Pilot

This is the final Phase 1 proof and cannot be replaced by automated tests.

- [ ] Import one real route into ReadyRoute.
- [ ] Run ReadyRoute alongside the current operating system for one complete delivery day.
- [ ] Compare route stop count, package count, sequence, and assignments before dispatch.
- [ ] Compare completed and attempted stop results after the route.
- [ ] Compare ReadyRoute stops-per-hour with the existing system.
- [ ] Confirm location continuity from departure through return.
- [ ] Confirm inspection issues, photos, manager review, and vehicle readiness end to end.
- [ ] Record every failure, confusing interaction, unnecessary tap, and missing capability.

## 6. Pilot Findings Template

Record the route-day result under these headings:

### Broken

Behavior that failed, saved incorrect data, or prevented work.

### Friction

Behavior that worked but was slow, confusing, repetitive, or easy to misuse.

### Missing

Capabilities required for the pilot company to operate without a fallback product.

### Metrics

- ReadyRoute stops per hour
- Existing-system stops per hour
- Location gaps or delayed updates
- Failed or retried uploads
- Battery usage over the route day

### Decision

- Continue pilot
- Continue after fixes
- Pause pilot

## 7. Phase 1 Completion Rule

Phase 1 is complete only when:

- the automated production release gate passes;
- the manager portal field checks pass;
- the driver app field checks pass on real hardware;
- one complete real route day succeeds;
- no unresolved issue can lose customer route, stop, inspection, photo, location, or billing data; and
- the top five Phase 2 priorities are written from observed pilot evidence.

Until then, the accurate status is:

**Phase 1 implemented and production-hardened, pending controlled field validation.**
