# Delivery-status operational translation audit

Audit date: 2026-08-09

## Purpose

A verified code definition does not necessarily establish a complete driver procedure. This audit compares all 50 `DELIVERY_STATUS` references with the operational knowledge layer so reference-table entries are not mistaken for approval, authorization, documentation, custody, or final-disposition workflows.

## Classification results

| Translation status | Codes | Count |
|---|---|---:|
| `OPERATIONAL_RECORD_LINKED` | 001, 002, 006, 010, 017, 018, 024, 029, 079, 081, 095, 100, 250, 353 | 14 |
| `OPERATIONAL_RECORD_SET_LINKED` | 004, 007, 011, 014, 019, 021 | 6 |
| `AUTO_APPLIED_REFERENCE_ONLY` | 009, 013, 363 | 3 |
| `DEFINITION_ONLY_WORKFLOW_GAP` | 003, 012, 015, 016, 025, 026, 027, 028, 034, 082, 083, 251, 252, 253, 351, 352, 354, 355, 356, 357, 361 | 21 |
| `OUTSIDE_GROUND_SCOPE_REFERENCE` | 358, 359, 360, 364 | 4 |
| `STATUS_LIMITED_REFERENCE` | 030, 362 | 2 |
| **Total** |  | **50** |

The row-level rationale, knowledge links, source-scope assessment, and required follow-up are preserved in `knowledge/status_code_translation_coverage.csv`.

## Knowledge extracted

Two code entries contained enough source-established action to promote complete narrow records:

- `KNO-DEL-SECURITY-NODELIVERY-001`: customer security prevents delivery → do not bypass/deliver, apply code 001, complete matching notation, and return to station. It distinguishes prevention from a delay-only security protocol.
- `KNO-DEL-DAMAGE-INSPECTION-001`: possible ordinary delivery-package damage → do not deliver, apply code 010, complete matching notation, and return for station inspection. It diverts leaking/damaged hazmat to the emergency branch and keeps pickup/call-tag rules separate.

Both use current OP-117 pages 36 and 40 and are `VERIFIED`. No door-tag, attempt-photo, approval, or other step was added unless the reviewed source established it.

## Material workflow gaps

Twenty-one entries provide a condition/outcome but not a complete operational procedure. Examples include unable-to-locate address, after-dispatch misload, hold request, manifest-not-on-van, USPS/interline/Canada Post tender, no-attempt authorization, weather/holiday approval, service-limit refusal, after-cutoff pickup, and package retrieval. These remain reference definitions, not driver-facing approval.

`REFSRC-030` now tracks the controlling status-specific operational procedures and approval criteria as a P0 acquisition obligation. Existing `REFSRC-002` separately tracks the current OP-324 code card; a current code card alone may still be insufficient if it only repeats definitions.

## Scope and status safeguards

- Codes 009, 013, and 363 are auto-applied; the future driver interface must not tell the driver to select them.
- Codes 358-360 are identified by OP-117 as Canada Express-only.
- Code 364 is Express-only and informational on Ground; it is retained to distinguish delay from Ground code-001 prevention.
- Code 362 remains `HUMAN_REVIEW_REQUIRED` because the supplied geographic wording is internally unclear.
- Older code 030 remains `POTENTIALLY_OUTDATED` and cannot substitute for current ordinary-refusal code 006.

## Automated controls

`scripts/validate_reference_data.py` now requires:

- exact one-to-one code coverage between the 50-row translation ledger and `status_codes.jsonl`;
- exact label agreement;
- valid linked knowledge IDs;
- one record for `OPERATIONAL_RECORD_LINKED` and multiple records for `OPERATIONAL_RECORD_SET_LINKED`;
- a follow-up action for every workflow gap;
- a non-verified reference status for every `STATUS_LIMITED_REFERENCE`; and
- explicit Express/Ground source-scope notes for every outside-Ground classification.

## Result

All 50 delivery-status references are operationally accountable. Twenty codes have current operational record coverage, while the remaining entries are explicitly prevented from masquerading as complete Ground procedures. Full resolution still requires acquisition and review of the 21 definition-only workflows and current OP-324.
