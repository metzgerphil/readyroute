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

## Preserved but withheld

Two candidates remain review-only and cannot support definitive instructions:

- `KNO-DEL-MISLOAD-AFTERDISPATCH-001` — Code 012 and its after-dispatch definition are verified, but the cited pages do not establish the complete no-delivery, SID-removal, and station-return sequence proposed in the handoff.
- `KNO-FORGE-MANIFEST-PREVIEW-001` — the archived guide establishes Manifest Preview 4.5.0 behavior, but does not establish the current Bulk Transfer workflow or cross-work-area authority.

The six field tips and the remembered Code 20 item in the partner report were not converted into definitive records. They remain intake leads pending authoritative support or an explicit product policy for clearly labeled field knowledge.

## Important corrections to v1 language

- SID-sticker removal was removed from the business-closed, damage, and wrong-route answers because it was not found on the cited pages.
- The attempted pickup branch was narrowed: Code 11 is `Closed - Attempted, No Packages`; it is not treated as the answer for every cancellation reported after arrival.
- The previous human-approved Bulk Transfer wording was not inherited because the archived Manifest Preview guide did not support all of it.

## Private source preservation

Accepted source bytes are stored under `research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-15/`, which is excluded from Git. Checksums and evidence limitations are recorded in `research/fedex-ground-driver-knowledge/inventory/source_inventory.csv`.
