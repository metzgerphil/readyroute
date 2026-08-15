# Ready Route Answers v2 selective recovery — 2026-08-15

## Scope

The product owner authorized a selective pull from the archived Ready Route Answers v1 dataset based on `ReadyRoute_Session_Report_2026-08-14.md`. This was not a bulk restore.

The intake preserved the partner report, the two partner-created Markdown transcriptions, and four original PDFs from the private v1 archive. The original PDFs remain the operational evidence; the Markdown files are search aids and provenance.

## Recovered and re-reviewed

Six records passed the v2 source and evidence gates:

- `KNO-PUP-CANCELED-001` — created from the handoff and narrowed to the exact Code 24 and Code 11 conditions.
- `KNO-PUP-ZERO-001` — recovered from v1 and checked against FORGE pages 59-61 and OP-117 page 71.
- `KNO-DEL-BUS-CLOSED-001` — recovered and narrowed to Code 004, door-tag, and notation claims supported by OP-117.
- `KNO-DEL-DAMAGE-INSPECTION-001` — recovered and narrowed to Code 010, notation, and station inspection return.
- `KNO-DEL-BARCODE-001` — recovered and checked against OP-117 page 46.
- `KNO-FORGE-MANUAL-BARCODE-001` — recovered and checked against FORGE pages 178-181 and 242 plus OP-117 page 46.

## Initial documentary-review result

The first documentary review withheld two candidates because the cited manuals did not establish every step:

- `KNO-DEL-MISLOAD-AFTERDISPATCH-001` — Code 012 and its after-dispatch definition are verified, but the cited pages do not establish the complete no-delivery, SID-removal, and station-return sequence proposed in the handoff.
- `KNO-FORGE-MANIFEST-PREVIEW-001` — the archived guide establishes Manifest Preview 4.5.0 behavior, but does not establish the current Bulk Transfer workflow or cross-work-area authority.

## Owner-verification policy update

Later on 2026-08-15, the product owner established that information he supplies is verified process information and may be used without a matching PDF or external document. Ready Route now records that knowledge as `READY_ROUTE_APPROVED`, preserving the owner and exact supplied scope rather than mislabeling it document-sourced.

This approval promoted the full wrong-route disposition, the predispatch Bulk Transfer path, and all six field procedures from the partner report. The explicitly pending Code 20 item remains excluded because the report itself says not to add it until confirmed.

## Important corrections to v1 language

- SID-sticker removal remains outside the source-verified business-closed and damage answers. It is included in the wrong-route answer through the product owner's explicit approval.
- The attempted pickup branch was narrowed: Code 11 is `Closed - Attempted, No Packages`; it is not treated as the answer for every cancellation reported after arrival.
- Bulk Transfer is now owner-approved rather than represented as document-verified.

## Private source preservation

Accepted source bytes are stored under `research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-15/`, which is excluded from Git. Checksums and evidence limitations are recorded in `research/fedex-ground-driver-knowledge/inventory/source_inventory.csv`.
