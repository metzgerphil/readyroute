# MyGroundBiz navigation coverage audit

Status date: 2026-08-09

Purpose: ensure every discovered MyGroundBiz navigation destination is accountable either as a primary source/location record or as an explicit authenticated-review backlog item. Navigation titles are discovery evidence only and are never used to infer driver procedures.

## Coverage result

- 86 global-navigation destinations are inventoried.
- 18 reviewed or partially reviewed destinations resolve to primary `source_inventory.csv` rows.
- All 13 `HIGH_RELEVANCE` and all five `POTENTIALLY_RELEVANT` navigation destinations have primary source records.
- The remaining 68 destinations are `NOT_YET_REVIEWED` and `PENDING_ASSESSMENT` and now appear one-for-one in `inventory/mygroundbiz_destination_backlog.csv`.
- No reviewed navigation destination lacks a primary source record.
- No backlog row points to an unknown navigation ID or a destination already represented as a primary source.

## Open backlog by site section

- Operations: 19 destinations.
- Vehicles/Fuel: 17 destinations.
- Agreement: 13 destinations.
- Safety: 6 destinations.
- Recognition: 5 destinations.
- News: 5 destinations.
- Discounts/Vendors: 3 destinations.

Several titles suggest potentially important operational material—such as FORGE familiarization, trailer-pull safety, road tests, driving standards, vehicle schematics, Alternative Vehicle operations, qualification conditions, CARB, apparel/business-name display, and monthly maintenance forms—but they remain `PENDING_ASSESSMENT`. No relevance upgrade or operational instruction is inferred before authenticated page review.

## Required action for every backlog row

1. Open the destination in the authenticated session.
2. Durably capture the complete visible page.
3. Inventory every linked/downloadable document, video, form, and cross-reference as its own source where applicable.
4. Assign evidence-derived relevance and review status.
5. Create the primary source row and remove the destination from the backlog only when inventory/status reconciliation is complete.

## Regression control

The corpus validator requires exact equality between navigation destinations without primary source rows and the explicit destination backlog. It also requires every unmatched destination to remain `NOT_YET_REVIEWED`/`PENDING_ASSESSMENT`. A reviewed or relevance-classified page without a source record therefore fails validation instead of disappearing between the navigation map and source ledger.

This audit proves destination accountability, not destination content completeness. The 68 open rows remain a material blocker to the final definition of done.

All 68 rows are also represented exactly once in `inventory/mygroundbiz_authenticated_acquisition_queue.csv`. The queue changes capture order only; it does not change their `NOT_YET_REVIEWED`/`PENDING_ASSESSMENT` status or permit title-based knowledge extraction.
