# Potentially outdated information report

Status date: 2026-08-10

The exact current-version work queue is maintained in `knowledge/version_confirmation_queue.csv` and explained in `reports/version_confirmation_packet_2026-08-10.md`. It contains all 20 canonical `POTENTIALLY_OUTDATED` records and preserves the existing source/version, exact update needed, evidence-quality requirements, source-gap routing, and qualification gate for each row.

## Record-status index: POTENTIALLY_OUTDATED

- `KNO-FORGE-AUDIO-ALERTS-001` — Driver cannot disable delivery-instruction or pickup-closing audio in FORGE settings.
- `KNO-FORGE-COMBINE-DELIVERY-001` — Scanning packages from separate delivery stops causes FORGE to verify or combine the address.
- `KNO-FORGE-COMMENT-SCOPE-001` — Choosing a package comment or stop comment in FORGE.
- `KNO-FORGE-DEVICE-ROAD-001` — Using a FORGE device while the vehicle is on the road.
- `KNO-FORGE-DOWNLOAD-SYNC-001` — Pickup listing or delivery manifest did not download, or manifest needs refresh before service.
- `KNO-FORGE-DISPLAY-NAV-SETTINGS-001` — Changing FORGE navigation or stop-list display preferences.
- `KNO-FORGE-DEVICE-INFO-001` — Finding FORGE version, build, serial, device ID, or IP information for support.
- `KNO-FORGE-FIRST-LAUNCH-001` — FORGE remains unavailable after first launch because device permissions were denied.
- `KNO-FORGE-LANGUAGE-001` — Changing the displayed language in FORGE.
- `KNO-FORGE-MANIFEST-SEARCH-001` — Filtering or searching Manifest Preview before dispatch.
- `KNO-FORGE-MANIFEST-PERMISSIONS-001` — Manifest Preview remains unavailable because device permissions were denied.
- `KNO-FORGE-MERGE-PICKUP-001` — Linking a zero-package or unlisted pickup to an existing listed pickup.
- `KNO-FORGE-MESSAGING-001` — Sending a pickup or delivery message from FORGE.
- `KNO-FORGE-MULTICODE-001` — Choosing which barcode to scan on a FedEx multicode package label.
- `KNO-FORGE-SPLIT-DELIVERY-001` — Only some packages at a delivery stop can be closed now.
- `KNO-FORGE-STANDARD-DELIVERY-001` — Closing a listed multi-package business delivery in FORGE.
- `KNO-FORGE-STANDARD-PICKUP-001` — Closing a listed multi-package pickup in FORGE.
- `KNO-FORGE-SYNC-QUEUE-001` — Closed FORGE stops have not uploaded because the device was out of network coverage.
- `KNO-FORGE-TIME-REMINDER-001` — FORGE displays a delivery or pickup reminder near the target close time.
- `KNO-PUP-SERVICE-TYPES-001` — Identifying the pickup service type shown in FORGE.

## Source- and reference-level risks

- FORGE Quick Start 1.0 (2023).
- Image-only hand-sheet references with no visible revision identity and 2021-era examples.
- Any application behavior in the April 2025 FORGE 2.8.0 guide that differs from later MyGroundBiz material.
- Status/reason lists that cannot be reconciled to current OP-324/OP-321.
- Filename-based version/date claims that conflict with internal document labels.
- FedEx Authenticated Delivery version history remains time-sensitive: the 8/4/2026 portal announcement described Ground availability as future, while the later, fully reviewed FORGE 3.3 guide documents the current conditional Ground workflow. The guide now controls the active record; the older announcement remains historical evidence and cannot override it.
- FORGE device-use warning: the 2023 FORGE 1.0.0 guide says never to operate the device while on road, but the phrase is undefined and no newer exact wording has been found.
- Status code 030 Retail Refusal/O.S.A.: present in the 2024 OP-119 list, absent from the reviewed 2025-12-15 OP-117 list, and unsupported by current decision criteria.
- FORGE Settings 2.0.0: Delivery Instructions and Pickup Closing audio are documented as non-disableable, but current installed-version behavior has not been corroborated.
- Manifest Preview 4.5.0: the guide says denied location or photos/media/files permissions keep the screen unavailable; current permission names and managed-device behavior require confirmation.
- FORGE 2.8.0 stop-structure UI: combine delivery, split delivery, zero-package revisit, and unlisted-to-listed pickup assignment paths need current-version confirmation.
- FORGE 2.8.0 stop-comment scope and pickup-list/manifest download/refresh availability need current-version confirmation; current OP-117 page 46 independently corroborates the delivery-time Package Comment damage-reason path.
- FORGE 2.8.0 Sync Status manual-upload controls and 30-minute time reminders need current-version confirmation.
- FORGE 2.8.0 first-launch permissions, language settings, routine delivery/pickup close, messaging, multicode scanning, device-information paths, and related menu labels need current-version confirmation.
- FORGE 2.0.0 display/navigation preferences, Manifest Preview 4.5.0 search/filter paths, and OP-119's 2024 pickup-service taxonomy require current-version/source confirmation.
- The 2024 MyGroundBiz locker article says beside-locker placement may occur with complex-staff agreement, but the newer OP-117 v2 (2025-12-15) says a package should never be left on, under, or near an unusable locker. Current Ready Route guidance follows the newer prohibition and preserves the older clause only as superseded source history.
- The 2022 STAR special-shipper notice directs entry of `SRA` as the recipient name/signature after its no-recipient branch. The newer OP-117 v2 (2025-12-15) defines the current FORGE REMOVE ALL, release, and door-tag workflow but does not repeat that SRA-entry step. Current Ready Route guidance therefore excludes the old SRA entry unless a current authoritative source or current FORGE prompt re-establishes it; the dated notice remains only as version history and mixed-shipper context.

Potentially outdated material remains preserved as evidence but cannot silently override a newer or controlling source.
