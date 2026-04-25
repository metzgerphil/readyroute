# FCC Dispatch Sync Spec

## Purpose

Define the ReadyRoute product and technical model for GroundCloud-aligned FCC manifest syncing, route staging, manager dispatch, and post-dispatch exception handling.

This spec captures the implementation direction that now exists across:

- `/Users/phillipmetzger/readyroute/backend`
- `/Users/phillipmetzger/readyroute/manager-portal`
- `/Users/phillipmetzger/readyroute/driver-app`

It is intended to be concise, implementation-ready, and durable in the repo.

## Product Goal

ReadyRoute should prepare routes from FCC with minimal manager overhead while still matching the real operating model used today:

1. routes are prepared in the background
2. lead managers review readiness
3. lead managers dispatch the day
4. drivers receive only dispatched routes
5. late FCC changes are treated as operational exceptions

This deliberately avoids a fully automatic publish model.

## Source-System Assumptions

### FCC

- FCC `Combined Manifest` is the primary source for route-day manifest data.
- Both `.xls` and `.gpx` are required for a complete route import.
- FCC does not expose a clearly visible, trustworthy manifest-complete flag in the observed portal experience.

### GroundCloud

- GroundCloud appears to re-process manifests repeatedly while FCC data is still changing.
- A lead manager still performs a real `Dispatch` action.
- The best parity target is therefore:
  - automatic background preparation
  - manager-controlled release
  - exception handling after release

## Core Workflow

### 1. Background sync and staging

ReadyRoute prepares routes before dispatch.

- FCC manifest data is synced in the background.
- Route data is staged in ReadyRoute.
- Staged data can be refreshed as FCC data changes.
- Routes are not yet visible as live driver routes.

### 2. Manager dispatch review

The manager portal acts as the dispatch board.

- Managers can see which routes are:
  - blocked
  - under review
  - ready
  - already dispatched
- Managers can see staged stop/package counts and recent route sync history.
- Managers can dispatch all eligible routes or only selected routes.

### 3. Dispatch release

Dispatch is the authoritative release boundary.

- A lead manager triggers `Dispatch Routes`.
- Only selected, non-blocked routes are dispatched.
- Dispatched routes become active in the driver experience.
- Dispatch is timestamped and auditable.

### 4. Post-dispatch monitoring

ReadyRoute continues watching for route changes after dispatch.

- If FCC changes a dispatched route, the change is classified.
- Lower-risk changes become driver warnings.
- Higher-risk in-progress changes become manager-review-required exceptions.

## Route Lifecycle

### Dispatch state

- `staged`
- `dispatched`

### Sync state

- `sync_pending`
- `syncing`
- `staged_changed`
- `staged_stable`
- `dispatch_blocked`
- `changed_after_dispatch`
- `needs_attention`
- `sync_failed`

These states drive both backend validation and manager-facing dispatch guidance.

## Backend Responsibilities

### Route persistence

Routes now carry dispatch and sync metadata, including:

- `dispatch_state`
- `dispatched_at`
- `dispatched_by_manager_user_id`
- `sync_state`
- `last_manifest_sync_at`
- `last_manifest_change_at`
- `manifest_stop_count`
- `manifest_package_count`
- `manifest_fingerprint`
- `last_manifest_sync_error`

### Route event audit trail

ReadyRoute records route sync and dispatch events in `route_sync_events`, including:

- manifest staged/updated
- assignment changes
- dispatch
- post-dispatch change handling

This is the audit backbone for support and manager visibility.

### Dispatch rules

Dispatch is blocked when routes are missing operational prerequisites, including:

- missing driver
- missing vehicle
- unstable or failed sync states
- explicit blocked review states

Dispatch is warning-only, not blocking, for selected reviewable states such as:

- `staged_changed`
- `changed_after_dispatch`

### Multi-CSA and multi-timezone support

ReadyRoute must not assume one national day or one national dispatch window.

Each account/CSA now carries configurable local operating context:

- `operations_timezone`
- `dispatch_window_start_hour`
- `dispatch_window_end_hour`
- `manifest_sync_interval_minutes`

Manager APIs return local-day and local-window context per CSA so readiness is computed from local operations, not a shared global clock.

## Manager Portal Responsibilities

### Manifest page

The manifest page is the dispatch board.

It must show:

- blocking routes
- review-before-dispatch routes
- ready routes
- dispatch counts
- route sync history
- route-level inclusion/exclusion for partial dispatch

### CSA page

The CSA page is the operations-configuration and linked-workspace surface.

It must show:

- each linked CSA's local date
- readiness summary counts
- timezone and dispatch window context
- FCC polling cadence settings

## Driver App Responsibilities

### Before dispatch

Drivers should not receive staged routes as active routes.

The app should clearly distinguish:

- `unassigned`
- `awaiting_dispatch`
- `dispatched`

### After dispatch

Once dispatched:

- the route becomes visible as the live route
- drivers can proceed normally through Home, My Drive, and Manifest flows

### After dispatch changes

If FCC changes a live route:

- lower-risk changes surface as visible driver warnings
- higher-risk in-progress changes require stronger manager review handling

The driver app should favor clear notices over silent route rewrites.

## Current Implementation Status

The following slices are now implemented:

1. staged vs dispatched route gating
2. sync metadata persistence
3. sync-state-based dispatch rules
4. manifest dispatch board UX
5. driver pre-dispatch and post-dispatch states
6. post-dispatch change policy
7. route sync event audit history
8. CSA timezone, dispatch window, and sync cadence settings
9. per-CSA local readiness summaries and partial dispatch selection

## Background Sync Worker

The backend worker entrypoint is `backend/src/scripts/runFedexSync.js`.

`FEDEX_SYNC_MODE` controls the sync lane:

- `both` runs manifest sync and FCC progress sync.
- `manifests` discovers route manifests, downloads both `.xls` and `.gpx`, fingerprints changes, and stages route records.
- `progress` checks FCC Combined Manifest rows during the delivery day and marks ReadyRoute stops complete when FCC reports completed deliveries.

The intended production cadence is:

- Run manifest sync every 5-15 minutes during each CSA's local dispatch sync window.
- Run progress sync every 2-5 minutes through the active delivery day, because FCC completion rows update as drivers scan packages in the FedEx scanner.
- Keep the scheduler global and frequent; each CSA account resolves its own current work date from `operations_timezone`.

## Remaining Major Work

The main remaining gap is live FCC hardening:

- validate the runner against real FCC sessions over multiple CSAs
- harden selectors around FCC UI variations
- add retry/backoff behavior for FCC login, MFA, and timeout cases
- confirm the route/work-area discovery rules against real dispatch-day examples
- decide the production scheduler host and cadence

## Success Criteria

ReadyRoute succeeds when:

- managers no longer manually upload manifests in the normal flow
- managers can trust the manifest board before dispatch
- dispatch remains the clear release event for the day
- drivers never receive pre-dispatch staged routes as live routes
- late FCC changes are visible, classified, and auditable
- the system works per CSA and local timezone without assuming one national operating schedule
