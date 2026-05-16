# ReadyRoute Multiple CSA Switching QA

Acceptance rule: the app must never show data from one CSA under the name of another CSA. CSA names are display-only; every selection, query, API request, and cache entry must be scoped by the canonical CSA/account id.

## Test Data

Use two linked CSAs on the same manager login with clearly different data.

CSA A:
- Name: `CSA A Test`
- Route: `A Route 101`
- Driver: `A Driver`
- Vehicle: `A Vehicle`
- Record: `A Record`

CSA B:
- Name: `CSA B Test`
- Route: `B Route 202`
- Driver: `B Driver`
- Vehicle: `B Vehicle`
- Record: `B Record`

Record both CSA ids before starting:
- CSA A id:
- CSA B id:

## Web Manager Portal Checklist

1. Linked CSA list
- Log in as the manager with access to both test CSAs.
- Open the CSA switcher.
- Confirm both `CSA A Test` and `CSA B Test` are visible.
- Confirm the CSA Access page shows a unique id for each CSA.

2. Open CSA A
- Select `CSA A Test`.
- Confirm the header/sidebar shows `CSA A Test`.
- Open Routes and confirm only `A Route 101` appears.
- Open Drivers and confirm only `A Driver` appears.
- Open Vehicles and confirm only `A Vehicle` appears.
- Open Records and confirm only `A Record` appears.
- Confirm no `CSA B Test`, `B Route 202`, `B Driver`, `B Vehicle`, or `B Record` data is visible.

3. Switch to CSA B
- Select `CSA B Test` from the CSA switcher.
- Confirm the header/sidebar changes to `CSA B Test`.
- Open Routes and confirm only `B Route 202` appears.
- Open Drivers and confirm only `B Driver` appears.
- Open Vehicles and confirm only `B Vehicle` appears.
- Open Records and confirm only `B Record` appears.
- Confirm no CSA A data remains visible after the CSA B load completes.

4. Switch back to CSA A
- Select `CSA A Test`.
- Confirm the header/sidebar changes back to `CSA A Test`.
- Confirm Routes, Drivers, Vehicles, and Records show only CSA A data.
- Confirm no CSA B data remains visible.

5. Refresh behavior
- Select `CSA B Test`.
- Refresh the browser.
- Confirm the app opens with `CSA B Test` selected by id.
- Confirm Routes, Drivers, Vehicles, Records, and map data still belong to CSA B.

6. Stale localStorage behavior
- In devtools, set `localStorage.readyroute_selected_csa_id = "invalid-csa-id"`.
- Reload the app.
- Confirm the app does not crash.
- Confirm the invalid id is cleared or replaced with an authorized CSA id.
- Confirm the displayed CSA name is derived from the linked CSA list, not from storage.

7. Duplicate name safety
- If possible, rename both linked CSAs to the same display name temporarily.
- Confirm both workspaces still appear or can be reached by unique id.
- Switch between them and confirm data changes according to CSA id.
- Restore the original names after the test.

8. Query cache safety
- Select CSA A and load Routes.
- Switch to CSA B.
- While loading and after loading, confirm `A Route 101` is not shown under the CSA B header.
- In React Query devtools or network logs, confirm CSA-scoped query keys include the selected CSA id.

9. Deep link behavior
- Open a manager page directly, such as `/routes`, after selecting CSA B.
- Confirm the selected CSA and data remain CSA B.
- If CSA id route params are added later, verify unauthorized CSA ids are blocked by the backend.

## Mobile App Checklist

1. Log in with the same manager account.
2. Open the CSA/workspace drawer.
3. Confirm both `CSA A Test` and `CSA B Test` are listed.
4. Select CSA A and confirm the app header, route list, map pins, drivers, and manifest views show only CSA A data.
5. Select CSA B and confirm the app header, route list, map pins, drivers, and manifest views show only CSA B data.
6. Force close and reopen the app while CSA B is selected.
7. Confirm CSA B remains selected and no CSA A data appears under the CSA B name.

## Regression Signals

Fail the test if any of these occur:
- A CSA name is used as a selection key.
- A page displays CSA A data under the CSA B name, or vice versa.
- Refreshing reverts to the wrong CSA.
- An invalid stored CSA id crashes the app.
- The CSA switcher hides a linked CSA because it has the same display name as another CSA.
- Routes, drivers, vehicles, records, map pins, or VEDR data load without a selected CSA id in the cache key.
