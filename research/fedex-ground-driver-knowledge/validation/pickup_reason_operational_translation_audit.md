# Pickup-reason operational translation audit

Audit date: 2026-08-09

## Purpose

Pickup reasons occupy a separate numeric namespace from delivery statuses. A familiar number or reason label must not be treated as a complete approved pickup procedure, especially while the current OP-321 Pickup Reason Codes Card remains unacquired.

## Classification results

| Translation status | Codes | Count |
|---|---|---:|
| `OPERATIONAL_RECORD_LINKED` | 26 | 1 |
| `STATUS_LIMITED_RECORD_LINKED` | 10, 11, 15, 20 | 4 |
| `STATUS_LIMITED_RECORD_SET_LINKED` | 17 | 1 |
| `OUTSIDE_GROUND_STATUS_LIMITED` | 21 | 1 |
| **Total** |  | **7** |

The row-level rationale and required follow-up are stored in `knowledge/pickup_reason_translation_coverage.csv`.

## Findings

- Pickup reason 26 is the only complete current operational branch. `KNO-PUP-SCANNER-FAIL-001` preserves the technology-failure condition, pickup time/package count capture, and station manual-update handoff.
- Reasons 10, 11, 15, and 20 connect to the general zero-package record, but remain `HUMAN_REVIEW_REQUIRED` as reason selections because OP-117 lists them without complete OP-321 criteria.
- Reason 17 connects the zero-package, hazmat acceptance, and leaking-hazmat emergency records. Those safety rules remain controlling, but they do not independently establish every payable-attempt/code-selection condition.
- Reason 21 is expressly an Express pickup cancellation reference and remains outside approved Ground guidance.
- Reasons 01, 14, 16, and 25 appeared only in a partially reviewed `Common Reason Codes` source whose viewer title identifies 2017 while its portal path is filed under 2023. They were excluded from the active reference layer rather than retained as historical data.
- Numeric values 10, 11, 15, 17, 21, and 26 collide with active delivery-status values. Namespace clarification is mandatory before interpretation.

## Source obligations

No new OP-321 acquisition row was required because `REFSRC-003` already tracks it as a P0 source obligation. The rejected version-ambiguous source is not assumed to be OP-321 and receives no further review priority. Six of seven active pickup reasons cannot become approved selection guidance until a current controlling source establishes their conditions.

## Automated controls

`scripts/validate_reference_data.py` now requires:

- exact one-to-one coverage of all seven active pickup reasons;
- exact label agreement;
- valid linked record IDs and correct single/set cardinality;
- a verified reference status for the sole complete operational branch;
- a non-verified reference status and explicit follow-up for every status-limited branch;
- an Express source-scope note for the outside-Ground entry; and
- continued symmetric warnings for all six active delivery/pickup numeric collisions.

## Result

All seven active pickup reasons are operationally accountable without overstating approval. One has a complete verified workflow; five remain linked but status-limited; and one remains an Express-only status-limited reference. Four version-ambiguous historical reasons are excluded from the active layer.
