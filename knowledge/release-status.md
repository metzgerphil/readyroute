# Knowledge release status

Status date: 2026-08-09

The current release is a validated foundation, not a claim that the entire possible FedEx corpus is complete.

## Current release

- 144 canonical operational records.
- 89 `SOURCE_VERIFIED` records.
- 0 `READY_ROUTE_APPROVED` adjudications; none have been inferred without explicit human approval.
- 34 `PENDING_REVIEW` records: 32 former human-review-required records and 2 conflicts.
- 21 `POTENTIALLY_OUTDATED` records.
- 80 records pass status, durable-capture, and exact claim-trace publication gates.
- 9 additional source-verified records remain evidence-gated; see [`operations/publication-gaps.jsonl`](operations/publication-gaps.jsonl).
- 108 primary source-registry records and 3,228 claim-provenance/allocation records.
- 192 formal driver-language cases and 724 indexed question variants.

## Material remaining source work

The research [goal completion matrix](../research/fedex-ground-driver-knowledge/reports/goal_completion_matrix.md) remains controlling for completeness. Material gaps include authenticated MyGroundBiz acquisition, unacquired Safety Topic documents, current referenced procedures/forms such as OP-324, OP-321, OP-207/OP-207Res and other named artifacts, partially reviewed sources, executed agreement schedules/attachments, version-sensitive FORGE workflows, pending conflicts, and expert/legal/safety adjudications.

The authenticated acquisition ledger currently contains 289 queued resources, and the referenced-source ledger contains 42 explicit missing-source obligations. These are not silently treated as reviewed or irrelevant.

## Next priorities

1. Resolve the 9 source-verified publication gaps without weakening evidence controls.
2. Process high-value mainstream pending-review and outdated records through current source acquisition and human adjudication.
3. Acquire/review the prioritized MyGroundBiz and referenced-source queue while preserving exact identity and version.
4. Add adjudications only after explicit Ready Route approval.
5. Repeat quality-control and adversarial-completeness passes after each meaningful source batch.

No interface or deployment work is authorized by this release status.
