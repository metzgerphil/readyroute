# FCC Dispatch Sync Plan

## Goal

Preserve the planning direction for GroundCloud-parity FCC manifest syncing inside ReadyRoute so the work does not live only in chat or on one laptop.

The product goal is to let ReadyRoute prepare routes from FCC with minimal manager overhead while still matching the current operating model used in GroundCloud.

## What We Learned

### FCC / MyBizAccount observations

- FCC `P&D Manifests` is the clearest source of route-day manifest data.
- FCC `Combined Manifest` exposes the route/day presence plus the export actions needed for sync.
- Both `.xls` and `.gpx` are required for a complete import.
- We did not find a visible FCC-only `ready`, `finalized`, or `dispatch now` status for manifests.
- FCC `Service Area Status` appears to be about FORGE/login/pickup assignment conditions, not manifest completion.
- `Service Area Status` does show a `last updated` timestamp, so FCC does expose refresh timing on some pages.

### GroundCloud observations

- GroundCloud has a `P&D Manifests` page, but in this account it looks like an upload ledger, not the source of truth for auto-sync state.
- GroundCloud event logs show repeated `Automated Manifest` parse/import events through the morning.
- On April 24, 2026, repeated parse waves were visible at:
  - `7:39 AM`
  - `7:57 AM`
  - `8:14 AM`
  - `8:32 AM`
  - `8:50 AM`
  - `9:09 AM`
- The same manifest IDs were parsed multiple times and stop counts changed between waves.
- That strongly suggests GroundCloud is polling and re-importing while the source data changes, not waiting on one explicit FCC completion flag.

### New operational information

- The lead manager currently clicks a `Dispatch` button in GroundCloud.
- That means the real current workflow is not "fully automatic publish."
- The manager dispatch action appears to be the authoritative release moment for the day.

## Product Direction For ReadyRoute

ReadyRoute should mirror the current manager mental model:

1. FCC data is synced and staged in the background.
2. Route data can keep changing before dispatch.
3. The lead manager performs a final `Dispatch Routes` action.
4. Only then do routes go live to drivers.
5. Changes after dispatch are handled as exceptions, not normal pre-dispatch staging.

This keeps ReadyRoute close to GroundCloud while still reducing manual work.

## Recommended ReadyRoute Model

### Before dispatch

- ReadyRoute monitors FCC manifests in the background.
- It fetches both `.xls` and `.gpx` for each route.
- It stages route data without making it active in the driver app.
- It tracks repeated changes over time.
- Managers do not need to manually upload manifests in the normal flow.

### Dispatch moment

- A lead manager clicks `Dispatch Routes` in ReadyRoute.
- ReadyRoute validates that staged routes are good enough to release.
- The dispatch action becomes the official go-live event for the day.
- Routes become active for drivers at that point.

### After dispatch

- ReadyRoute continues watching FCC for late changes.
- Post-dispatch changes are treated more carefully than pre-dispatch changes.
- Significant changes should generate manager exceptions and, where appropriate, driver-visible notices.

## Key Design Principles

### 1. Background sync, not background publish

ReadyRoute can do the prep work automatically, but should not assume the day is live until dispatch happens.

### 2. Change-driven sync behavior

The transport may still be scheduled polling, but the business logic should react to detected route changes, not arbitrary time alone.

### 3. Dispatch is the release boundary

Dispatch is the moment when staged data becomes operationally active for drivers.

### 4. Local operations, not one national clock

This must work across many CSAs, terminals, and time zones. Background syncing should run per CSA/terminal/local operating window, while dispatch remains a per-day local manager action.

## Route States To Support

Recommended high-level route states:

- `sync_pending`
- `syncing`
- `staged_changed`
- `staged_stable`
- `dispatch_blocked`
- `dispatched`
- `changed_after_dispatch`
- `needs_attention`

## Suggested Manager Experience

In the manager portal, the manifest/dispatch page should show:

- which routes were found in FCC
- whether both files were pulled
- staged stop/package counts
- whether a route is still changing
- whether a route looks stable
- whether the route was dispatched
- exceptions such as:
  - missing route
  - missing `.xls`
  - missing `.gpx`
  - repeated changes
  - late post-dispatch changes

Primary action:

- `Dispatch Routes`

Secondary actions:

- `Refresh Now`
- route-level review and exception handling

## Suggested Driver Experience

Before dispatch:

- the driver app should not treat staged routes as active live routes

After dispatch:

- the dispatched route should appear as the driver's live route for the day

After dispatch changes:

- use guarded updates
- prefer alerts/banners over silent rewrites when the driver is already operating on the route

## Technical Planning Direction

This feature should be designed across:

- `backend`
  - FCC polling and file retrieval
  - manifest parsing
  - staged route persistence
  - dispatch activation
  - post-dispatch change detection
- `manager-portal`
  - staged route review
  - dispatch status UI
  - dispatch action
  - exception handling
- `driver-app`
  - pre-dispatch waiting state
  - post-dispatch live route activation
  - late-change handling after dispatch

## Open Questions

- Should dispatch be all-routes-at-once, selected routes only, or terminal-scoped?
- What exact validations should block dispatch?
- Which post-dispatch changes should silently update versus require manager review?
- Should drivers see staged route placeholders before dispatch, or only a "not dispatched yet" state?
- Should ReadyRoute continue polling after dispatch for the full operating day, or for a limited post-dispatch window?

## Working Assumption To Preserve

Until proven otherwise, ReadyRoute should assume:

- FCC does not provide a single trustworthy visible manifest-complete flag.
- GroundCloud behavior is best approximated by background re-sync plus a manager-controlled dispatch action.
- The right parity target is:
  - automatic background prep
  - manual dispatch release
  - careful post-dispatch exception handling
