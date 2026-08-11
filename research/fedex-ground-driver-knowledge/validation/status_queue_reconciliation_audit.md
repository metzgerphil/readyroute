# Status-queue reconciliation audit

Status date: 2026-08-09

Purpose: ensure every structured record that cannot support an unconditional approved answer is present in the correct human-readable queue, and ensure queue indexes do not silently retain stale or misclassified record IDs.

## Reconciled status counts

- `CONFLICT`: 2 records, both indexed in `reports/conflicts.md`.
- `HUMAN_REVIEW_REQUIRED`: 32 records, all indexed in `reports/human_review_queue.md`.
- `POTENTIALLY_OUTDATED`: 21 records, all indexed in `reports/potentially_outdated.md`.
- `UNRESOLVED`: 0 literal-status records. `reports/unresolved_knowledge.md` explicitly distinguishes its issue-level research gaps from structured record status.
- `VERIFIED`: 78 records. Verified records are not included in exception-queue indexes.

## Repairs made

- Added complete machine-readable record-status indexes to all four exception reports.
- Corrected the stale/nonexistent `KNO-SEC-STOLEN-VEHICLE-CONFLICT-001` reference to the actual `KNO-SEC-STOLEN-VEHICLE-001` conflict record.
- Preserved `KNO-DEL-TOBACCO-001` as `HUMAN_REVIEW_REQUIRED`; its discussion in the conflict report is a conflict candidate, not a change to literal record status.
- Separated record-level potentially outdated entries from broader source/reference version risks.
- Clarified that unresolved issue bullets may describe missing sources or incomplete research even when no record has the generic `UNRESOLVED` status.

## Regression control

The corpus validator extracts only the explicit `Record-status index` section from each report and compares it exactly with the current record set for that status. Validation fails when a non-verified record is omitted, a stale ID remains, or a record is indexed under the wrong status. Narrative cross-references outside the index remain allowed so reports can discuss related conflict candidates and source gaps.

This audit verifies status/report synchronization, not resolution of the underlying conflicts, version risks, or human-review obligations.

Resolution-path accountability is now provided separately by `knowledge/nonverified_resolution_coverage.csv`: all 54 non-verified record IDs are validator-reconciled to an evidence/decision requirement, authority class, dependency set, and status-consistent publication gate.
