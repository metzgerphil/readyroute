# ReadyRoute Vehicle Inspection 2.0 Product Spec

Status: product/process specification, implementation in progress
Last updated: 2026-06-27

## Objective

Vehicle Inspection 2.0 should keep the driver experience fast while making inspection results more useful for managers.

The current inspection is valuable because it is simple. This spec keeps that strength. Drivers should still be able to complete a clean inspection quickly. The system should only ask for more information when the driver marks an item as an issue.

The larger product goal is to turn inspections into the starting point for safety, maintenance, manager review, and later notifications.

## Product Philosophy

The driver reports what they see. The manager decides what happens to the vehicle.

That distinction is the core of the feature.

- Drivers should not directly set the vehicle to `Out of Service`, `At the shop`, `Not on Schedule B`, or `Needs Repair`.
- Drivers can mark an issue as `Unsafe`.
- `Unsafe` means `Urgent Manager Review`, not an automatic vehicle status change.
- Managers review the inspection and choose the final operational status.
- Inspection-critical notifications should be included in the first build if platform setup cooperates, but notifications should not be the source of truth.
- The source of truth should be a durable inspection, review item, or maintenance issue inside ReadyRoute.

## Current ReadyRoute Context

ReadyRoute already has vehicle status options on the manager portal:

- `Active`
- `Out of Service`
- `At the shop`
- `Not on Schedule B`
- `Needs Repair`

Vehicle Inspection 2.0 should work with this existing status model.

The driver app should collect structured evidence. The manager portal and manager app should remain the place where operational vehicle status is decided.

## Key Product Terms

### Vehicle Inspection

The complete checklist submission for a vehicle on a date, usually tied to a driver and route.

Example:

```text
Vehicle 204526
Driver: Phillip
Route: 811
Odometer: 65,000
Inspection date: 2026-06-27
Status: Urgent Manager Review
```

### Inspection Item

One checklist item inside the inspection.

Example:

```text
Tires
Check Engine Light
Coolant
Brake Fluid
Truck Cleanliness
```

### Inspection Issue

The structured issue reported by the driver for a specific inspection item.

Example:

```text
Tires
Position: Back Right
Issue: Low pressure
Severity: Maintenance Soon
```

Inspection issues are evidence. They should mostly remain immutable after submission. Managers can review or resolve them, but they should not rewrite what the driver reported.

### Maintenance Issue

An open operational follow-up item created from an inspection issue.

Example:

```text
Back Right Tire - Low pressure
Priority: Maintenance Soon
Status: Open
Source: Vehicle inspection from 2026-06-27
```

This is not the same thing as completed maintenance.

### Maintenance Record

A completed maintenance or repair history record.

Example:

```text
Replaced back right tire
Service date: 2026-06-28
Mileage: 65,120
Vendor: Tire shop
```

Vehicle Inspection 2.0 should not turn driver-reported issues directly into completed maintenance records.

## Surfaces

Vehicle Inspection 2.0 affects three ReadyRoute surfaces:

1. Driver app route-start inspection
2. Manager app vehicle inspection and review flow
3. Manager portal vehicle inspection and review flow

For this phase of product design, app visuals matter most for the driver flow. Portal visuals are not required yet, but the portal workflow must be defined clearly because managers make the final vehicle decision there.

## Manager-Assigned Inspections

Managers must be able to assign a vehicle inspection manually at any time.

The manager assignment flow should allow:

- Selecting a truck
- Selecting a driver
- Selecting a due date
- Marking the assignment as normal or urgent
- Adding an optional driver-facing note
- Choosing whether the inspection is required before route start

A manual assignment should create a durable `pending` inspection assignment. It should not create a completed inspection record by itself.

When the driver completes the assigned inspection:

- A normal vehicle inspection submission is created.
- The assignment is marked `completed`.
- The assignment stores the completed inspection ID.
- Manager review and urgent-review logic still comes from the submitted inspection details.

Manual assignments can exist without a route. This matters because a manager may want a driver to inspect a truck before a route is assigned or outside the normal route-start flow.

If a manual assignment is not marked as required before route start, it should appear to the driver without blocking route actions. If it is marked as required before route start, it may block route start until submitted.

## Inspection Order

The inspection should be ordered by operational importance.

### Vehicle Information

Shown at the top of the inspection.

- Vehicle ID
- Current odometer
- Inspection date
- Completion progress
- Current issue count

Example:

```text
Vehicle 204526
Odometer: 65,000
Progress: 3 of 9 completed
Issues marked: 2
```

### Critical Safety Items

These determine whether the vehicle may be unsafe to operate.

- Tires
- Check Engine Light
- Lights
- Brake Fluid

Brake fluid should be treated as critical safety because brake behavior can directly affect whether a vehicle should operate.

### Safety Equipment

These confirm that required vehicle safety systems are present and working.

- VEDR
- Back Up Camera
- Turn Cameras
- Parking Sensors
- Horn

Safety equipment items should stay simple for drivers. The primary answer is still `Pass` or `Issue`.

### Maintenance Items

These usually indicate maintenance needs, but can still escalate to manager review if severe.

- Coolant
- Engine Oil
- Windshield Fluid
- Wipers

### Vehicle Condition

These are lower-priority condition items and should not visually compete with safety items.

- Truck Cleanliness

### Driver Notes

Driver notes should remain at the bottom of the inspection.

Driver notes are a catch-all. They should not replace structured issue reporting.

## Universal Inspection Item Behavior

Every inspection item starts in a neutral state.

```text
Gray = Not answered
Green = Pass
Orange = Issue
Red = Unsafe / Urgent Manager Review
```

Items must not default to passed.

### Collapsed State

Every item should be quick to answer.

```text
Tires                       Pass | Issue
Coolant                     Pass | Issue
Truck Cleanliness           Clean | Dirty | Needs Attention
```

Truck cleanliness uses condition labels instead of generic `Pass` / `Issue`, but it still maps into the same inspection status model.

### Pass

When the driver selects `Pass`:

- Item turns green.
- Item stays collapsed.
- No additional fields are shown.
- Item counts toward completion progress.

### Issue

When the driver selects `Issue`:

- Item turns orange.
- Item expands.
- Driver answers only the additional questions needed for that item.
- Issue type is required.
- Severity is required.
- Notes are optional.
- Photos are optional and should be included in the first build if feasible.

### Unsafe

When an issue is marked `Unsafe`:

- The inspection becomes `Urgent Manager Review`.
- Route start is not automatically blocked by the driver's unsafe selection in the first build.
- The vehicle status should not automatically change.
- Manager decides whether the vehicle remains active, needs repair, goes to the shop, or is out of service.

## Universal Issue Fields

Every issue should follow the same high-level shape.

```text
status: issue
severity: minor | maintenance_soon | unsafe
manager_review_required: true | false
maintenance_followup_required: true | false
issue_details: item-specific structured answers
notes: optional
photos: optional
```

### Severity Values

#### Minor

The issue is noted but does not currently require urgent action.

Examples:

- Windshield fluid low
- Wipers streaking lightly
- Cab has trash

Expected behavior:

- Route can start.
- Inspection issue is saved.
- Manager can review later.
- No automatic maintenance issue unless manager chooses.

#### Maintenance Soon

The issue should be addressed soon but does not necessarily block the route.

Examples:

- Back right tire low pressure
- Coolant leak suspected
- Wipers torn

Expected behavior:

- Route can start.
- Inspection issue is saved.
- Open maintenance issue should be created or queued.
- Manager review item should be visible.

#### Unsafe

The driver believes the vehicle may not be safe to operate.

Examples:

- Exposed cord on tire
- Brake warning light
- Check engine light flashing
- Vehicle overheating

Expected behavior:

- Route is not automatically blocked by ReadyRoute in the first build.
- Inspection status becomes `Urgent Manager Review`.
- Manager should review as soon as possible.
- Vehicle status does not automatically change.
- Manager decides final vehicle status.

## Item Schemas

### Tires

Category: Critical Safety

Positions:

- `Front Left`
- `Front Right`
- `Back Left`
- `Back Right`

Issue types:

- `Low pressure`
- `Uneven wear`
- `Damage`
- `Exposed cord`
- `Flat`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- Tire position is required when `Issue` is selected.
- Issue type is required.
- Severity is required.
- Driver may select more than one tire position if the same issue applies to multiple tires.
- If different tires have different problems, the system should eventually allow multiple tire issue entries.
- `Unsafe` creates `Urgent Manager Review`.
- Manager decides final vehicle status later.

Manager summary example:

```text
Tires
Position: Back Right
Issue: Low pressure, Damage
Severity: Maintenance Soon
Driver note: Tire looks low and sidewall has visible damage.
```

### Check Engine Light

Category: Critical Safety

Issue types:

- `Light on`
- `Flashing`
- `Warning message`
- `Reduced power`
- `Other`

Additional question:

```text
Is the vehicle showing signs it should not be driven?
```

Suggested answers:

- `No, no driving symptoms`
- `Maybe, manager should review`
- `Yes, unsafe`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- `Flashing`, `Reduced power`, or `Unsafe` should require manager review.
- The driver should not decide vehicle status.
- The manager reviews and decides whether the vehicle remains active or needs another status.

Manager summary example:

```text
Check Engine Light
Issue: Flashing
Severity: Unsafe
Driver note: Light started flashing after leaving terminal.
Status: Urgent Manager Review
```

### Lights

Category: Critical Safety

Light types:

- `Marker Lights`
- `Back Turn Signals`
- `Front Turn Signals`
- `Headlights`
- `Cargo Light`
- `License Plate Light`

Issue types:

- `Out`
- `Dim`
- `Cracked`
- `Intermittent`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- Light type is required.
- Issue type is required.
- Front and back turn signals are separate light types so the driver does not need to choose an additional front/rear position.
- Some light issues may be maintenance soon, but turn signals, headlights, marker lights, or license plate lights may become unsafe depending on severity and operating conditions.

Manager summary example:

```text
Lights
Light: Back Turn Signals
Issue: Out
Severity: Unsafe
```

### Brake Fluid

Category: Critical Safety

Issue types:

- `Low`
- `Empty`
- `Leak suspected`
- `Brake warning light`
- `Soft brake pedal`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- Brake fluid issues should be treated conservatively.
- `Empty`, `Leak suspected`, `Brake warning light`, `Soft brake pedal`, or `Unsafe` should require manager review.
- Manager decides whether the vehicle can operate.

Manager summary example:

```text
Brake Fluid
Issue: Brake warning light
Severity: Unsafe
Status: Urgent Manager Review
```

### Safety Equipment

Category: Safety Equipment

Items:

- `VEDR`
- `Back Up Camera`
- `Turn Cameras`
- `Parking Sensors`
- `Horn`

Driver choices:

- `Pass`
- `Issue`

Optional when `Issue` is selected:

- Notes
- Photo

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Rules:

- Safety equipment should stay simple in the driver app.
- Each safety equipment item is answered as `Pass` or `Issue`.
- No extra issue type is required for the first version.
- If the driver marks `Issue`, the app can ask for severity and optional notes/photos.
- `Horn` issues should be treated conservatively because the horn is an active safety device.
- Camera, sensor, or VEDR issues may not always block route start, but they should be visible to managers as equipment issues.
- `Unsafe` creates `Urgent Manager Review`.

Manager summary examples:

```text
Safety Equipment
Item: Back Up Camera
Status: Issue
Severity: Maintenance Soon
Driver note: Screen is black when truck is in reverse.
```

```text
Safety Equipment
Item: Horn
Status: Issue
Severity: Unsafe
Status: Urgent Manager Review
```

### Coolant

Category: Maintenance

Issue types:

- `Low`
- `Empty`
- `Leak suspected`
- `Warning light`
- `Overheating`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- `Empty`, `Warning light`, `Overheating`, or `Unsafe` should strongly suggest manager review.
- `Leak suspected` should usually create maintenance follow-up.
- Manager decides whether the vehicle should continue operating.

Manager summary example:

```text
Coolant
Issue: Leak suspected
Severity: Maintenance Soon
Driver note: Small puddle under front passenger side.
```

### Engine Oil

Category: Maintenance

Issue types:

- `Low`
- `Empty`
- `Leak suspected`
- `Oil light`
- `Oil change due`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- `Empty`, `Oil light`, or `Unsafe` should require manager review.
- `Oil change due` should connect to mileage-based maintenance intelligence.
- Oil change due/overdue should be shown to the driver when ReadyRoute has enough mileage and service interval data.

Manager summary example:

```text
Engine Oil
Issue: Oil change due
Severity: Maintenance Soon
Current mileage: 65,000
Next service: 66,500
```

### Windshield Fluid

Category: Maintenance

Issue types:

- `Low`
- `Empty`
- `Reservoir leak`
- `Sprayer not working`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- Most windshield fluid issues should be `Minor` or `Maintenance Soon`.
- In severe weather or poor visibility, the driver may mark it `Unsafe`.
- `Unsafe` requires manager review.

Manager summary example:

```text
Windshield Fluid
Issue: Empty
Severity: Minor
```

### Wipers

Category: Maintenance

Position:

- `Left`
- `Right`
- `Both`

Issue types:

- `Streaking`
- `Torn blade`
- `Not moving`
- `Missing`
- `Other`

Severity:

- `Minor`
- `Maintenance Soon`
- `Unsafe`

Optional:

- Notes
- Photo

Rules:

- Position is required.
- Issue type is required.
- `Not moving`, `Missing`, or weather-related visibility concerns may require manager review.

Manager summary example:

```text
Wipers
Position: Both
Issue: Torn blade
Severity: Maintenance Soon
```

### Truck Cleanliness

Category: Vehicle Condition

Driver choices:

- `Clean`
- `Dirty`
- `Needs Attention`

Optional when `Dirty` or `Needs Attention` is selected:

- Notes
- Photo

Rules:

- Truck cleanliness should appear near the bottom of the inspection.
- `Clean` is the normal pass equivalent.
- `Dirty` records a condition issue without making the inspection feel like a safety failure.
- `Needs Attention` means the truck condition needs manager awareness or follow-up.
- Cleanliness should not visually compete with critical safety items.
- If the condition creates a safety obstruction, the driver should choose `Needs Attention` and explain it in notes.

Manager summary examples:

```text
Truck Cleanliness
Condition: Dirty
Driver note: Cargo area has loose trash from prior route.
```

```text
Truck Cleanliness
Condition: Needs Attention
Driver note: Loose items are blocking the cargo walkway.
```

Implementation mapping:

```text
Truck Cleanliness
Clean -> pass
Dirty -> issue, default severity Minor
Needs Attention -> issue, default severity Maintenance Soon or manager review depending on notes
```

### Driver Notes

Driver notes are separate from structured inspection issues.

Rules:

- Driver notes stay at the bottom of the inspection.
- Driver notes are optional.
- Driver notes should not be the primary way to report issues.
- If an issue belongs to a checklist item, it should be captured through that item.

## Driver Workflow

### 1. Inspection Required

The driver sees an inspection card before route start when an inspection is required.

The card should show:

- Vehicle ID
- Inspection date
- Last recorded odometer
- Current odometer input
- Completion progress
- Checklist grouped by importance

Example:

```text
Required before route start
Vehicle Inspection
Vehicle 204526
Progress: 0 of 9 completed
```

### 2. Driver Enters Odometer

Odometer remains required.

The existing odometer range validation should continue to protect against accidental bad entries.

### 3. Driver Answers Checklist Items

Every checklist item starts unanswered.

The driver must explicitly select:

- `Pass`
- `Issue`

Items cannot silently default to passed.

### 4. Clean Inspection

If every item is passed:

```text
Inspection status: Safe to Operate
Route start: Allowed
Manager review: Not required
Maintenance follow-up: Not created
```

Completion screen example:

```text
Vehicle Inspection Complete
Vehicle: 204526
Completed: 7:12 AM
Status: Safe to Operate
```

### 5. Inspection With Minor Issues

If one or more issues are `Minor`:

```text
Inspection status: Safe to Operate
Route start: Allowed
Manager review: Optional/later
Maintenance follow-up: Manager optional
```

Completion screen example:

```text
Vehicle Inspection Submitted
Vehicle: 204526
Status: Safe to Operate
Minor issues reported: 1
```

### 6. Inspection With Maintenance Soon Issues

If one or more issues are `Maintenance Soon` and none are `Unsafe`:

```text
Inspection status: Safe with Maintenance Reported
Route start: Allowed
Manager review: Visible in review queue
Maintenance follow-up: Open issue should be created or queued
```

Completion screen example:

```text
Vehicle Inspection Submitted
Vehicle: 204526
Status: Safe with Maintenance Reported
Maintenance issues: 2
```

### 7. Inspection With Unsafe Issue

If any issue is `Unsafe`:

```text
Inspection status: Urgent Manager Review
Route start: Not automatically blocked
Manager review: Required
Maintenance follow-up: Open issue created or queued for manager confirmation
Vehicle status: Unchanged until manager decision
```

Driver-facing message:

```text
Urgent Manager Review Sent

You reported an unsafe vehicle issue.
ReadyRoute has flagged this for manager review.

If you believe the vehicle should not be driven, contact your manager before starting the route.
```

The app should avoid saying:

```text
Vehicle failed
Vehicle out of service
Vehicle needs repair
```

Those are manager decisions.

## Route Start Rules

```text
No issues
-> Route can start

Minor issues
-> Route can start
-> Manager can review later

Maintenance Soon issues
-> Route can start
-> Maintenance issue/review item is created

Unsafe issue
-> Route is not automatically blocked
-> Urgent Manager Review
-> Driver is told to contact manager if they believe the vehicle should not be driven
```

## Manager Workflow

### 1. Inspection Appears In Review Queue

Manager review should be decision-focused.

The queue should show:

- Vehicle
- Driver
- Route
- Inspection date/time
- Status
- Critical issue count
- Maintenance issue count
- Highest severity

Example:

```text
Vehicle 204526
Driver: Phillip
Route: 811
Status: Urgent Manager Review
Highest severity: Unsafe
Critical Safety Issues: 1
Maintenance Issues: 2
```

### 2. Manager Opens Inspection

The manager should see issue cards first.

Passed items should be collapsed below the issue section.

Example:

```text
Issue Cards

Tires
Severity: Unsafe
Position: Back Right
Issue: Exposed cord
Driver note: Cord visible on outside edge
Photo: Attached

Coolant
Severity: Maintenance Soon
Issue: Leak suspected
Driver note: Small puddle under front passenger side
Photo: Attached

Passed Items
6 passed
```

### 3. Manager Decision Area

Manager chooses one primary decision.

```text
Safe to Continue
Continue + Maintenance Follow-up
Do Not Operate
```

### 4. Manager Vehicle Status Choice

If the manager needs to change the vehicle status, they choose from the existing portal status list:

- `Active`
- `Out of Service`
- `At the shop`
- `Not on Schedule B`
- `Needs Repair`

The driver does not choose these statuses.

### 5. Manager Decision Outcomes

#### Safe to Continue

Expected outcome:

- Driver/route may continue if the manager confirms operation is acceptable.
- Inspection marked reviewed.
- Vehicle may remain `Active`.
- Maintenance issue may be dismissed or left open at manager discretion.

#### Continue + Maintenance Follow-up

Expected outcome:

- Driver/route may continue if the manager confirms operation is acceptable.
- Maintenance issue stays open.
- Vehicle may remain `Active` or become `Needs Repair`.
- Inspection marked reviewed.

#### Do Not Operate

Expected outcome:

- Manager tells operations the vehicle should not be used for the route.
- Manager sets vehicle status.
- Maintenance issue remains open or scheduled.
- Inspection marked reviewed after decision is saved.

Typical status choices:

- `Out of Service`
- `At the shop`
- `Needs Repair`

### 6. Mechanic Handoff

Managers will sometimes need to send the inspection issue to a mechanic, vendor, or shop.

The first version should support a simple, reliable mechanic handoff without requiring ReadyRoute to manage mechanic contacts yet.

Recommended first version:

```text
Copy Mechanic Summary
```

This action should generate a clean text summary that the manager can paste into email, text, or a shop portal.

Example copied summary:

```text
ReadyRoute Vehicle Inspection Issue

Vehicle: 204526
Odometer: 65,000
Driver: Phillip
Route: 811
Inspection Date: 2026-06-27
Inspection Status: Urgent Manager Review

Issue:
Tires - Back Right
Problem: Exposed cord
Severity: Unsafe
Driver Note: Cord visible on outside edge.

Manager Decision:
Do Not Operate
Vehicle Status: Needs Repair

Requested Action:
Inspect and repair/replace back right tire.
```

Why this should come first:

- It works with any mechanic, vendor, email client, SMS thread, or shop system.
- It avoids needing mechanic contact management immediately.
- It avoids deliverability, reply tracking, and attachment rules in the first release.
- It gives managers control over exactly where the information goes.

Future version:

```text
Email Mechanic
```

A direct email option would be useful later, but it should be designed as a real workflow.

Future direct email should include:

- Mechanic/vendor contact list
- Email recipient entry
- Subject and editable message
- Selected inspection issues
- Photos or secure photo links when photos exist
- Manager note/requested action
- Audit log showing who sent it and when
- Optional link back to the ReadyRoute inspection or maintenance issue

Direct email should not replace the copy/share option. Managers should have both.

## Inspection Statuses

Product-level inspection statuses should be separated from vehicle statuses.

Recommended inspection statuses:

```text
safe_to_operate
safe_with_maintenance_reported
manager_review_required
urgent_manager_review
reviewed
```

Vehicle statuses remain:

```text
Active
Out of Service
At the shop
Not on Schedule B
Needs Repair
```

This separation prevents driver-submitted inspection data from automatically changing fleet status.

## Maintenance Follow-Up Model

Vehicle Inspection 2.0 should distinguish between inspection evidence and maintenance work.

### Pass

```text
Inspection issue: no
Maintenance issue: no
Maintenance record: no
```

### Minor

```text
Inspection issue: yes
Maintenance issue: optional
Maintenance record: no
```

### Maintenance Soon

```text
Inspection issue: yes
Maintenance issue: yes, open or queued
Maintenance record: no
```

### Unsafe

```text
Inspection issue: yes
Maintenance issue: yes, needs manager review
Maintenance record: no
Route start: not automatically blocked by ReadyRoute in the first build
Manager attention: urgent
```

## Maintenance Issue Lifecycle

Maintenance issue statuses should support future workflow.

Recommended statuses:

```text
Needs Manager Review
Open
Scheduled
At the Shop
Resolved
Dismissed
```

Example:

```text
Back Right Tire - Exposed cord
Priority: Unsafe
Status: Needs Manager Review
Source: Inspection 204526 / 2026-06-27
```

## Duplicate Handling

ReadyRoute should avoid creating duplicate maintenance issues for the same unresolved problem.

If the same vehicle already has an open issue for the same component, a new inspection should attach to the existing issue instead of creating endless duplicates.

Example:

```text
Back Right Tire Issue
Opened: 2026-06-25
Reported by: 3 inspections
Latest severity: Unsafe
Status: Open
```

This makes inspections more useful over time and helps managers see recurring problems.

## Photo Support In The First Build

Photos should be included in the first build if feasible because they directly improve inspection value.

Photo scope for the first build:

- Optional only
- Available only when an item is marked `Issue`
- Start with one photo per issue
- Driver can submit without a photo
- Photo upload failure should not destroy the inspection draft
- Manager review should show the photo or photo link
- Copy mechanic summary should include photo links if available

First-build photo examples:

- Tire damage
- Coolant leak
- Oil leak
- Broken light
- Dirty truck or cargo-area condition
- Safety equipment screen/camera issue

Future photo enhancements:

- Multiple photos per issue
- Required photo rules for certain severe issue types
- Offline upload retry
- Photo annotations

## Notification MVP

Inspection-critical notifications should be included in the first build if platform setup cooperates.

The source of truth should still be an in-app queue or review item. Push notifications are only a delivery channel.

First-build notification events:

- Manager assigns an upcoming vehicle inspection to a driver.
- Driver submits an `Unsafe` issue.
- Driver submits an inspection with `Urgent Manager Review`.
- Manager reviews an unsafe inspection.
- Manager decides the vehicle should not operate.

Future notification events:

- Driver has an inspection due before route start.
- Driver misses a required inspection close to route start time.
- Manager requests more information or a photo from the driver.
- Maintenance issue is opened from an inspection.
- Maintenance issue is resolved.

### Notification Permissions

Notification permission should be separate from location permission.

Location is required for route tracking. Notifications should be optional but strongly encouraged.

Driver prompt concept:

```text
Allow notifications so ReadyRoute can alert you when your manager assigns a route,
requests an inspection, or reviews a vehicle issue.
```

Manager prompt concept:

```text
Allow notifications for unsafe vehicle reports, missed inspections,
and route-impacting issues.
```

Do not request notification permission cold on first app launch unless there is a clear product reason. Better moments:

- After driver login when a route or required inspection is visible.
- When a manager enables inspection requirements.
- When the user first sees a screen that depends on timely alerts.

Notification MVP should not block the inspection release if App Store, Expo, APNs, FCM, or real-device setup becomes the long pole. In that case, the durable review queue still ships first and push delivery follows immediately after platform setup is complete.

## Phased Release Boundary

### Phase 1: Smarter Driver Inspection

Goal: improve inspection quality without turning it into a long form.

Scope:

- Neutral unanswered state
- Explicit `Pass` / `Issue` selection
- Progress indicator
- Reordered sections by importance
- Structured issue details per item
- Simplified safety equipment items:
  - `VEDR`
  - `Back Up Camera`
  - `Turn Cameras`
  - `Parking Sensors`
  - `Horn`
- Simplified truck cleanliness choices:
  - `Clean`
  - `Dirty`
  - `Needs Attention`
- Severity selection
- Optional photo upload for issue items, if feasible
- Completion screen
- Unsafe issue creates `Urgent Manager Review`
- Unsafe issue does not automatically block route start
- Inspection-critical notification MVP, if platform setup cooperates

Deferred:

- Full maintenance issue lifecycle
- Duplicate maintenance issue matching
- Advanced mileage intelligence beyond what already exists

### Phase 2: Manager Review and Vehicle Decision

Goal: make manager review decision-focused.

Scope:

- Manager review queue
- Issue-first inspection detail
- Actions:
  - `Safe to Continue`
  - `Continue + Maintenance Follow-up`
  - `Do Not Operate`
- Manager can choose existing vehicle status:
  - `Active`
  - `Out of Service`
  - `At the shop`
  - `Not on Schedule B`
  - `Needs Repair`
- Manager decision records whether the vehicle may continue or should not operate
- Copy mechanic summary for manager handoff to a mechanic, vendor, or shop

### Phase 3: Maintenance Issue System

Goal: turn inspection issues into real maintenance workflow.

Scope:

- Open maintenance issues from inspection issues
- Maintenance issue statuses
- Duplicate maintenance issue matching
- Recurring issue history
- Link maintenance issues to completed maintenance records when resolved

### Phase 4: Notification And Photo Enhancements

Goal: improve evidence and alerting beyond the first-build MVP.

Scope:

- Multiple photos per inspection issue
- Offline/retry support for photo uploads
- Required photo rules for selected issue types
- Expanded notification preferences
- Additional push notifications for maintenance and follow-up events
- Expanded in-app notification center
- Direct email-to-mechanic workflow, if mechanic/vendor contact handling and audit logging are defined

## Phase 1 Acceptance Criteria

Phase 1 should be considered successful when:

- Drivers can complete a no-issue inspection nearly as fast as today.
- No checklist item appears passed by default.
- Drivers can clearly see how many items remain.
- Issue items collect structured details.
- Tire issues use only four tire positions:
  - `Front Left`
  - `Front Right`
  - `Back Left`
  - `Back Right`
- Lights use the agreed inspection list:
  - `Marker Lights`
  - `Back Turn Signals`
  - `Front Turn Signals`
  - `Headlights`
  - `Cargo Light`
  - `License Plate Light`
- Safety equipment items exist as simple `Pass` / `Issue` checks:
  - `VEDR`
  - `Back Up Camera`
  - `Turn Cameras`
  - `Parking Sensors`
  - `Horn`
- Truck cleanliness uses:
  - `Clean`
  - `Dirty`
  - `Needs Attention`
- Optional issue photos are supported if feasible.
- Inspection-critical notifications are supported if platform setup cooperates.
- `Unsafe` creates `Urgent Manager Review`.
- `Unsafe` does not automatically change vehicle status.
- `Unsafe` does not automatically block route start in the first build.
- Manager has enough structured information to decide without calling the driver in most cases.

## Non-Goals For The First Build

The first build should not attempt to solve everything at once.

Do not include in the first build unless explicitly re-scoped:

- Automated vehicle status changes
- Full maintenance work-order lifecycle
- Duplicate maintenance issue matching
- Direct email-to-mechanic workflow
- Automatic completed maintenance records
- Complex tire layouts beyond four tire positions
- Driver ability to choose portal vehicle statuses

Photo upload and inspection-critical notifications are in first-build scope, but notifications may ship behind the durable in-app review queue if platform setup becomes the long pole.

## Deferred Workflow Rationale

The following items are intentionally deferred from the first build because they are separate workflows, not just inspection improvements.

### Full Maintenance Issue Lifecycle

This is effectively a maintenance/work-order module.

It requires product decisions about:

- Who can create and assign issues
- Whether drivers can see open maintenance issues
- What statuses exist
- What `Resolved` means
- Whether resolving an issue creates a completed maintenance record
- How this interacts with the current completed-service `vehicle_maintenance` records

The first inspection build should capture structured inspection evidence and manager review decisions cleanly. The maintenance lifecycle should build on top of that evidence later.

### Duplicate Maintenance Issue Matching

Duplicate matching depends on the maintenance issue model existing first.

It requires product decisions about:

- What counts as the same issue
- Whether matching uses vehicle, item, position, issue type, severity, or time window
- How to handle a new unsafe report for an issue previously marked minor
- How to handle manager-dismissed issues
- How to avoid hiding important new safety reports

Bad duplicate matching can hide new safety information. It should come after the maintenance issue lifecycle is defined.

### Direct Mechanic Email

Direct mechanic email is useful, but it is a communication workflow.

It requires product decisions about:

- Mechanic/vendor contacts
- Editable outgoing messages
- Photos as attachments or secure links
- Sent-message audit logs
- Delivery failure handling
- Reply expectations
- Per-CSA vendor behavior

The first build should include `Copy Mechanic Summary` instead. That gives managers immediate value while avoiding premature email infrastructure and contact-management decisions.

## Core Principle To Preserve

Vehicle Inspection 2.0 should ask better questions only when necessary.

A clean inspection should remain fast.

An issue inspection should collect enough detail that the manager can act.

An unsafe inspection should require manager review without giving the driver authority to permanently change vehicle status.
