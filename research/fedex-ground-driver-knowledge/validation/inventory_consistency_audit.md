# Inventory and navigation consistency audit

Status date: 2026-08-10

## Purpose

Verify that source review work is represented consistently across the primary source inventory, MyGroundBiz navigation ledger, per-source reviews, and coverage report.

## Failures found

1. `SRC-MGB-DOC-0007` (OP-132) had a complete one-page review artifact and was described as fully reviewed in the access ledger, but `source_inventory.csv` still marked it `NOT_YET_REVIEWED`.
2. `SRC-MGB-DOC-0008` (OP-135) had page 1 of 5 visually reviewed and a partial review artifact, but the source inventory still marked it `NOT_YET_REVIEWED`.
3. Seventeen MyGroundBiz navigation rows still showed `NOT_YET_REVIEWED/PENDING_ASSESSMENT` although the source inventory page with the same URL had been fully reviewed and assigned a relevance status.

## Corrections

- OP-132 is now `FULLY_REVIEWED`, identified as a one-page PDF, and carries its 8/2025 revision plus review limits.
- OP-135 is now `PARTIALLY_REVIEWED`, identified as a five-page PDF with revision 9/2025, and explicitly limits evidence to page 1.
- All 17 matching navigation rows now mirror the source inventory's review and relevance status.
- A follow-up semantic audit reclassified the fully examined Drive folder, 78-row secondary workbook, and complete announcement screenshot as `FULLY_REVIEWED`. Their secondary/time-sensitive evidence roles remain unchanged.
- Current primary inventory totals are 85 fully reviewed, four partially reviewed, 25 not yet reviewed, and seven inaccessible. The exact Drive connector folder moved from inaccessible to fully reviewed after its 35 current children were raw-byte hashed and reconciled to 31 registered archive objects. Six fully reviewed sources have durable hashed video captures and are dispositioned as historical FCC context without canonical mappings. Two fully reviewed sources have complete hashed page renders without original PDF bytes, and two partially reviewed sources have hashed partial-page renders without original PDF bytes.
- The corpus validator now fails when a MyGroundBiz navigation URL and source-inventory URL disagree on review or relevance status.

## Acquisition result for OP-135 and the sample agreement

- Still-open direct tabs confirm their official document identities.
- OP-135's page-assets inventory was empty; fresh page-addressed viewer tabs exposed complete page 1 and upper regions of pages 2-5, but native download did not expose a file and the lower regions remain unreviewed.
- The sample ISP Agreement tab confirms the official filename; screenshot/file extraction was not available.
- Read-only requests to the exact URLs outside the authenticated browser returned not-found/no-access responses.

The earlier OP-135 mismatch was bounded until the complete original arrived. OP-135 is now fully reviewed and checksum-preserved; the sample agreement's remaining pages and the January 2026 Vehicle Appearance FAQ's unseen lower regions remain explicit acquisition targets.

## Reproducible check

`python3 scripts/validate_corpus_integrity.py`

The check now validates 87 unique navigation rows and enforces cross-ledger status agreement for every URL present in both inventories.
