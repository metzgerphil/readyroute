# Temporal metadata and version audit

Audit date: 2026-08-10

## Scope and intended use

This audit tests whether source, evidence, and knowledge-record dates are sufficiently complete and internally consistent for traceability and status gating. The corpus grain is one row per primary source in `inventory/source_inventory.csv`, one JSON object per operational knowledge record, and one nested evidence object per cited source/locator.

It does not establish that a document is current merely because its recorded dates are valid. Currency still depends on controlling-source acquisition, supersession analysis, and human review.

## Checks performed

- ISO-format validity for populated source `created_at`, `modified_at`, `effective_date`, and `last_reviewed_at` fields.
- Required `last_reviewed_at` for every `FULLY_REVIEWED` and `PARTIALLY_REVIEWED` primary source.
- ISO-format and chronology checks for record `created_at` and `updated_at`.
- Evidence `reviewed_at` format and the constraints `reviewed_at <= record.updated_at` and `reviewed_at <= today`.
- Required nonblank `source_date_or_version` on every knowledge record.
- Status gating for records supported by `TIME_SENSITIVE_RELEVANCE` sources.
- Strict `MM/DD/YYYY` parsing of Safety Topic Library posted dates, with exact exception-ledger coverage for any malformed source display.

These checks are enforced by `scripts/validate_corpus_integrity.py`.

## Findings

| Finding | Evidence | Risk | Severity | Confidence | Remediation |
|---|---|---|---|---|---|
| Reviewed-source audit-date coverage is complete; descriptive source-date recovery is partial | 89/89 fully or partially reviewed primary sources have `last_reviewed_at`; 66/89 currently retain at least one populated creation/modification/effective/version field after the controlled inventory recovery and current-source pass | Audit timing is intact, but 23 reviewed-source descriptive date/version cells require authoritative reconstruction, including the six reviewed historical videos whose catalog timestamps are preserved separately | Medium | High | Keep automated review-date checks and reconcile the 23 descriptive metadata gaps under `validation/source_inventory_recovery_audit.md` |
| Record chronology is internally valid | 144/144 records have valid dates and `created_at <= updated_at <= 2026-08-10`; 34 were last updated 2026-08-08, 104 on 2026-08-09, and six on 2026-08-10 | No current chronology failure | Low | High | Retain chronology validation for every edit |
| Evidence review timing is internally valid | 385/385 evidence objects have `reviewed_at` no later than their record update or the audit date; 95 are dated 2026-08-08, 281 are dated 2026-08-09, and nine are dated 2026-08-10 | No current time-travel condition | Low | High | Continue rejecting future or post-update evidence review dates |
| Record source-version field is complete | 144/144 records have nonblank `source_date_or_version` | Reduces detachment of driver summaries from version context | Low | High | Require this field for all future records |
| Time-sensitive evidence is status-gated | Four sources are marked `TIME_SENSITIVE_RELEVANCE`; the two August Authenticated Delivery announcement representations are retained as zero-mapping historical context after the later FORGE 3.3 guide established the active conditional workflow. The Recent Customer Alerts page remains in its separate time-aware alert layer and the Micron notice has no general-record mapping | Prevents future-facing or customer-specific announcements from becoming unqualified approved procedure | High if violated; no current violation | High | Automated validation requires every time-sensitive zero-mapping source to retain an explicit reviewed-context disposition and prevents it from overriding later controlling evidence |
| One portal date is malformed at the source display | `MGB-SAFETY-TOPIC-0077` displays `12/31/0` | Inferring a year from the filename could create false chronology or supersession conclusions | Medium | High that the captured display is malformed; unknown corrected date | Preserve the raw value in `inventory/date_ambiguities.csv`; reacquire from the authenticated portal without substituting the filename date |

## Important chronology interpretation

The validator deliberately does not impose a universal order among a source's creation, modification, effective, and review dates. A document can legitimately be uploaded after its effective date, and a future-effective announcement can be reviewed before it takes effect. Cross-field chronology therefore remains evidence-specific rather than a generic hard constraint.

## Open temporal/version risks

- The current Drive connector folder and all 37 direct children are metadata- and raw-byte-reconciled; future folder revisions still require deliberate comparison.
- Seventeen reviewed-source rows require descriptive source date/version reconstruction after the controlled inventory recovery; operational record version fields and exact evidence locators remain intact.
- Several filename/body version discrepancies remain preserved in the conflict and potentially-outdated reports.
- Current controlling versions of OP-324, OP-321, OP-207/OP-207Res, HZ-035, SF-920P, and other referenced material remain unacquired.
- The corrected posted date for `MGB-SAFETY-TOPIC-0077` is unresolved.

## Result

The current record/evidence chronology is internally consistent and safe for traceability under the stated limitations. Source-inventory review dates are complete, but descriptive source-date/version metadata is only partially restored. The corpus is not current or complete; controlling-source acquisition and exact metadata reconstruction remain open.
