# ReadyRoute Phase 1 Final Checklist

Use this as the single source of truth before calling Phase 1 complete.

## Status Key

- `[x]` Verified
- `[ ]` Not yet verified
- `Local only` = confirmed in local/dev testing, not yet proven in production or with a real route

## Current Reality

As of now, ReadyRoute looks like this:

- Backend implementation: largely complete
- Driver app: implemented and partially tested
- Manager portal: implemented and partially tested
- Automated backend tests: passing locally
- Real production verification: still incomplete
- Full real-world route-day validation: not done yet

That means:

- Phase 1 is **not** ready to call fully complete yet
- Phase 1 is **ready for structured field verification**

## 1. Backend Checklist

### Database / Supabase

- [ ] Confirm all 10 operational tables exist in Supabase
  Tables to verify:
  `accounts`, `drivers`, `vehicles`, `routes`, `stops`, `packages`, `driver_positions`, `timecards`, `road_rules`, `stop_notes`

- [ ] Confirm RLS is enabled on all 10 tables

- [ ] Confirm the `pod-photos` storage bucket exists and behaves correctly

### Production Backend

- [ ] Verify `GET /health` returns `200` on the Railway production URL
  Expected response:
  ```json
  { "status": "ok", "timestamp": "..." }
  ```

- [ ] Confirm Railway env vars are set correctly
  Reference:
  [DEPLOYMENT.md](/Users/phillipmetzger/readyroute/DEPLOYMENT.md)

### Manifest / Routing

- [ ] Upload a real FedEx GPX manifest file
- [ ] Confirm the manifest creates the correct route and stop count
- [ ] Confirm addresses are parsed correctly
- [ ] Confirm route optimization reorders stops logically

### Stop Completion Logic

- [ ] Manually verify `stops/hr` uses the first completed stop time, not departure time
- [ ] Confirm a Code `02` stop saves correctly as `attempted`
- [ ] Confirm delivered stops increment `route.completed_stops`

### Billing

- [ ] Create a real Stripe test subscription at `$15/vehicle`
- [ ] Confirm the Stripe customer is created
- [ ] Confirm the Stripe subscription quantity matches vehicle count
- [ ] Confirm webhook events update account billing state

### Automated Tests

- [x] `npm test` passes locally
  Location:
  [backend](/Users/phillipmetzger/readyroute/backend)

## 2. Driver App Checklist

### Authentication

- [ ] Login works on a real iPhone
- [ ] Login works on a real Android phone

### Route-Day Experience

- [ ] `My Drive` shows the correct current stop
- [ ] Stop banner matches the actual next stop in sequence
- [ ] Manifest screen shows all stops correctly
- [ ] Stop detail shows correct stop/package data

### Delivery Actions

- [ ] Delivering a stop captures a photo successfully
- [ ] After delivery, the app advances to the next stop
- [ ] Attempted stop flow works for common exception codes
- [ ] Code `02` shows the service-score warning before completion

### GPS / Sync

- [ ] GPS position updates post every 30 seconds during an active route
- [ ] Those GPS updates appear in the manager dashboard

### Navigation / Maps

- [ ] In-app map shows the current stop correctly
- [ ] Remaining stops appear correctly on the map
- [ ] External navigation opens Google Maps turn-by-turn on a real device

### Offline / Reliability

- [ ] App still behaves acceptably in airplane mode
- [ ] Offline map behavior is acceptable for your use case
- [ ] Driver can recover cleanly after temporary signal loss

## 3. Manager Portal Checklist

### Deployment / Login

- [ ] Login works in the browser at the Vercel production URL
- [ ] Browser refreshes on nested routes do not 404
  Reference:
  [VERCEL_DEPLOY.md](/Users/phillipmetzger/readyroute/VERCEL_DEPLOY.md)

### Dashboard

- [ ] Dashboard metrics match real route data
- [ ] List-view `stops/hr` is accurate
- [ ] Map view shows live driver positions

### Fleet Map / Manifest Workflow

- [ ] Fleet Map loads correctly in production
- [ ] GPX upload works end to end from the manager portal
- [ ] Route assignment works end to end
- [ ] Route optimization feedback is clear to the manager

### Driver Admin

- [ ] `Add Driver` creates a new driver successfully
- [ ] Newly added driver can log into the driver app
- [ ] Driver deactivation behaves correctly

## 4. Real-World Test Checklist

This is the part that actually determines whether Phase 1 is done.

- [ ] Run one of your own real routes through ReadyRoute
- [ ] Run it alongside GroundCloud for one full delivery day
- [ ] Note every friction point
- [ ] Note every broken feature
- [ ] Note every missing feature
- [ ] Compare ReadyRoute `stops/hr` against GroundCloud
- [ ] Identify where drivers hesitate, get confused, or need extra taps

## 5. Required Output From Real-World Test

Create a simple list with these sections after the route-day test:

### Broken

- Anything that failed or produced the wrong result

### Friction

- Anything that worked but felt slow, awkward, or confusing

### Missing

- Anything GroundCloud supports that ReadyRoute still needs

### Metrics Comparison

- ReadyRoute `stops/hr`
- GroundCloud `stops/hr`
- Any obvious gap and why you think it happened

### Top Phase 2 Priorities

- The top 5 issues to fix next, in priority order

## 6. Call-It-Done Rule

You should only call Phase 1 complete when all of these are true:

- Backend production health check works
- Real FedEx manifest upload works
- Driver app is proven on a real phone
- Manager portal works at the real Vercel URL
- GPS shows up live in the dashboard
- Stripe billing works in test mode
- One full real route day has been completed alongside GroundCloud
- The Phase 2 priority list has been written down

If any of those are still missing, the correct status is:

**Phase 1 implemented, but not fully validated.**
