# Source inventory recovery audit

Status date: 2026-08-09

## Event and containment

During the OP-135 partial-capture migration, a CSV schema mismatch interrupted a rewrite of `inventory/source_inventory.csv` after 33 rows. The operational record and evidence-mapping writes completed, but the source inventory was left truncated. Validation was stopped immediately; no completion claim or publication state was advanced.

## Recovery basis

The 33 rows written before the mismatch retained their full prior metadata. The remaining 73 source identities were reconstructed from the last validator-controlled companion ledgers:

- `inventory/source_capture_coverage.csv` for source ID, title, source system/type, review status, capture state, and exact local archive path where original bytes exist;
- `inventory/source_knowledge_coverage.csv` for relevance status, coverage basis, and required follow-up;
- `inventory/mygroundbiz_authenticated_acquisition_queue.csv` and `inventory/mygroundbiz_navigation.csv` for exact authenticated URLs;
- source-specific review artifacts for explicit review dates and any explicitly labeled URL/version/update metadata.

The recovered baseline contained exactly 106 unique source IDs and passed reference, knowledge, and full corpus-integrity validation. Subsequent authenticated research added `SRC-MGB-DOC-0038` and `SRC-MGB-DOC-0039` from the fully reviewed August 2026 Sideswipe Collisions and July 2026 Summer Driving sources, bringing the current inventory to 108. Generated capture, source-knowledge, queue, and evidence-risk ledgers are rebuilt from the inventory rather than accepted from stale output.

The inventory now carries `metadata_recovery_status` and `metadata_recovery_basis` on every row. The validator requires exactly 33 `ORIGINAL_ROW_RETAINED` rows, 73 `RECONSTRUCTED_FROM_CONTROLLED_LEDGERS` rows, and two `NEW_AUTHORITATIVE_ROW_AFTER_RECOVERY` rows, with a nonblank basis on each. This preserves the recovery boundary while allowing later authenticated additions to remain truthfully classified.

## Preserved and remaining limits

Core source identity, title, type, review/access/relevance state, evidence eligibility, exact known URL, original-byte archive path, and review date are restored. Where review artifacts did not explicitly preserve earlier parent-container, apparent-subject, apparent-audience, creation/modification/effective-date, duplicate/supersession, or cross-reference fields, those cells remain blank instead of being guessed.

This is therefore a controlled metadata-recovery state, not proof that every descriptive cell is identical to the pre-interruption inventory. The missing descriptive relationships must be re-established from authoritative source/review evidence during subsequent inventory quality-control passes. Operational evidence locators and knowledge claims remain separately validator-exact and were not reconstructed from memory.
