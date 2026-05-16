# ReadyRoute Grouped Stops Same Address QA

Acceptance rule: ReadyRoute may group stops visually by address, but a grouped address is never an operational stop. Every completion, delivery code, exception code, note, proof item, and status update must apply only to the individual stop the driver selected unless a deliberate bulk action exists with confirmation.

## Test Fixture

Create or simulate one dispatched driver route with these stops:

- Address A: one delivery stop.
- Address B: two delivery stops at the same address.
- Address C: three delivery stops at the same address.
- Address D: one pickup stop and one delivery stop at the same address, as separate stops when the manifest treats them separately.

Record the canonical stop ids before testing:

- Address A stop id:
- Address B stop 1 id:
- Address B stop 2 id:
- Address C stop 1 id:
- Address C stop 2 id:
- Address C stop 3 id:
- Address D pickup stop id:
- Address D delivery stop id:

## Driver Route List Checklist

1. Single stop address
- Open the route list.
- Confirm Address A appears as a normal stop row.
- Open Address A.
- Expected: the normal stop detail view opens.
- Complete Address A.
- Expected: completion works as before and route progress increases by 1.

2. Two stops at same address
- Open the route list.
- Confirm Address B appears as one grouped address row or a clearly grouped presentation.
- Confirm the row shows the address, `2 stops`, completed count, total packages, and a status summary.
- Open Address B.
- Expected: two individual stop cards appear.
- Expected: each card shows SID or stop identifier, sequence number when available, contact name, package count, pickup/delivery type, status, and code if present.
- Expected: each card has its own Complete action and code action.

3. Three stops at same address
- Open Address C.
- Expected: three individual stop cards appear.
- Expected: package records stay under the correct stop card.
- Expected: no generic parent-level Complete button appears unless it is explicitly labeled as a bulk action and requires confirmation.

## Driver Action Checklist

1. Complete one stop in a group
- Open Address B.
- Complete only stop 1.
- Expected: stop 1 changes to completed.
- Expected: stop 2 remains pending and actionable.
- Expected: parent group shows `1 of 2 complete`.
- Expected: route progress increases by 1, not by 2.
- Network/API check: completion request uses Address B stop 1 id, not address text, address group key, normalized address, or SID.

2. Add a code to one stop in a group
- Open Address B.
- Add a delivery or exception code to stop 1.
- Expected: stop 1 shows the code.
- Expected: stop 2 does not show the code.
- Network/API check: code request uses Address B stop 1 id, not the grouped address identity.

3. Complete all stops in a group
- Open Address C.
- Complete stop 1.
- Expected: parent group shows `1 of 3 complete`.
- Complete stop 2.
- Expected: parent group shows `2 of 3 complete`.
- Complete stop 3.
- Expected: parent group shows completed only after all three child stops are complete.
- Expected: route progress increases by 3 total, one per child stop.

4. Pickup and delivery at same address
- Open Address D.
- Expected: pickup and delivery appear as separate child stop cards.
- Complete only the delivery.
- Expected: pickup remains pending and actionable.
- Add a code to the pickup.
- Expected: delivery does not show the pickup code.
- Expected: route progress and pickup summary each reflect the individual stop states.

## Driver Map Checklist

1. Grouped pin opens grouped detail
- Tap the Address B grouped pin.
- Expected: grouped address detail opens.
- Expected: two child stop cards are visible and individually actionable.

2. Partial group status
- After completing one Address B stop, return to the map.
- Expected: the grouped pin/card shows partial progress, not fully complete.
- Expected: the pin becomes completed only after every child stop at that address is complete.

3. Navigation
- Tap Navigate from a grouped address.
- Expected: navigation uses the shared address/pin.
- Expected: no child stop is completed or coded by navigating.

## Manager Checklist

1. Manager route detail
- Open the same route in the manager view.
- Expected: the route still reports the operational stop total, not the grouped address count.
- Example: 8 operational stops may display as fewer grouped addresses, but progress remains out of 8.

2. Partial grouped address
- Complete one Address B child stop as the driver.
- Refresh manager route detail.
- Expected: manager sees one completed child stop and one pending child stop.
- Expected: Address B does not appear fully completed.
- Expected: individual stop details remain accessible for both Address B stops.

3. Pickup plus delivery
- Complete only the Address D delivery.
- Refresh manager route detail.
- Expected: pickup remains pending and delivery appears complete.

## Backend/API Checklist

1. Driver route data
- Call the driver route data endpoint.
- Expected: same-address stops are returned as individual stops with a shared address group key, or as a virtual group containing an array of individual stop objects.
- Expected: no backend response collapses Address B, C, or D into one operational stop record.

2. Required child stop fields
- Confirm each individual stop includes id or route stop id, SID, sequence number, address, package count/packages, status, completion data, code data, contact data when available, and notes when available.

3. Completion identity
- Complete Address B stop 1.
- Expected: the completion endpoint receives the individual stop id.
- Expected: database update filters by stop id.
- Expected: no completion endpoint relies on address, normalized address, address group key, or non-unique SID.

4. Code identity
- Add a code to Address C stop 2.
- Expected: the code update is attached to Address C stop 2 only.
- Expected: sibling stops at Address C remain unchanged.

5. Route progress
- Complete child stops one at a time.
- Expected: route progress increments by exactly one for each newly completed individual stop.
- Expected: route progress never increments by the number of stops in a visual group from one child action.

6. Authorization
- Attempt to complete a stop from a route not assigned to the driver.
- Expected: request is rejected.
- Attempt to view or modify a stop outside the selected manager CSA.
- Expected: request is rejected or hidden.

## Automated Regression Coverage

Run from `/Users/phillipmetzger/readyroute/backend`:

```sh
node --test src/routes/routes.test.js
```

Required backend assertions:

- Same-address route fixture returns multiple distinct stop records.
- Same-address stops share a visual `address_group_key`.
- Packages remain attached to the correct stop id.
- Completion updates only the selected same-address stop id.
- Completion update does not filter by address.
- Route progress increments by 1 for one completed child stop.

Run from `/Users/phillipmetzger/readyroute/driver-app`:

```sh
npm test -- --runTestsByPath src/screens/MyDriveScreen.interaction.test.js src/screens/MyDriveScreen.test.js
```

Required driver assertions:

- Single-stop addresses keep the normal stop flow.
- Grouped pins or rows open grouped address detail.
- Grouped detail renders one child card per stop.
- Child Complete actions call the API with that child stop id.
- Child code actions call the API with that child stop id.
- Partial completion renders as partial progress.

## Release Fail Conditions

Fail the release if any of these occur:

- A grouped address can be completed by one unlabeled parent-level Complete button.
- Completing one child stop completes any sibling stop.
- Adding a code to one child stop adds the same code to any sibling stop.
- Route progress counts grouped addresses instead of operational stops.
- Manager view shows a partially completed grouped address as fully completed.
- Any completion or code request uses address text, normalized address, address group key, or non-unique SID as the operational identity.
