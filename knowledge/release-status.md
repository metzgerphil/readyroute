# Knowledge release status

Status date: 2026-08-10

The current release is a validated foundation, not a claim that the entire possible FedEx corpus is complete.

The agreed mainstream daily-driver Phase 1 decision is recorded in the research [`completion report`](../research/fedex-ground-driver-knowledge/reports/phase_1_mainstream_daily_driver_completion_2026-08-10.md). Restoration, checksums, current-corpus quality control, adversarial evaluation, and validation are complete for that scope. Remaining specialist, administrative, historical, version, and human-decision work is preserved as a deferred governed lane and cannot independently generate definitive driver instructions.

## Current release

- 144 canonical operational records.
- 90 `SOURCE_VERIFIED` records.
- 7 `READY_ROUTE_APPROVED` adjudications from the explicit 2026-08-10 human-verification packet.
- 27 `PENDING_REVIEW` records; partial, absent, and CXPC/management-dependent items from the packet remain gated.
- 20 `POTENTIALLY_OUTDATED` records.
- All 97 status-eligible records pass durable-capture and exact claim-trace publication gates.
- 0 status-eligible records remain evidence-gated; [`operations/publication-gaps.jsonl`](operations/publication-gaps.jsonl) is empty.
- 123 primary source-registry records and 3,254 claim-provenance/allocation records.
- 192 formal operational driver-language cases, 23 canonical reference-language cases, 69 non-indexed candidate operational cases, 21 candidate knowledge-gap cases, and 724 indexed operational question variants.

## Material remaining source work

The research [goal completion matrix](../research/fedex-ground-driver-knowledge/reports/goal_completion_matrix.md) remains controlling for completeness. Material gaps include authenticated MyGroundBiz acquisition, unacquired Safety Topic documents, current referenced procedures/forms such as OP-324, OP-321, OP-207/OP-207Res and other named artifacts, partially reviewed sources, executed agreement schedules/attachments, version-sensitive FORGE workflows, pending conflicts, and expert/legal/safety adjudications.

The authenticated acquisition ledger currently contains 264 queued resources, and the referenced-source ledger contains 42 explicit missing-source obligations. These are not silently treated as reviewed or irrelevant; specialist and non-daily-driver items are preserved as deferred work rather than blocking the current milestone. The latest source batches completed the current FORGE 3.3, OP-130/132/135, Download Pickup List, Dog Bite Prevention, current Equipment Terms, Vehicle Appearance FAQ, SRS/SRI FAQ, four byte-identical portal/Drive reconciliations, the 89-page OP-117 render comparison, bounded older pickup-reference reviews, complete audio-visual review of six preserved 2017 FCC videos, and original-byte reconciliation of Sideswipe Collisions and Summer Driving. The seven approvals resolve only the narrow human-reviewed determinations; every stated gap, version-sensitive workflow, and partial branch remains preserved.

All 21 candidate knowledge-gap cases are now reconciled to an existing acquisition target, a new source/authority obligation, clarification-only handling, or exact context required before queueing. Direct retrieval attempts for the newest inventoried Backing and Railroad intersections documents returned HTTP 403; no access-denied response was admitted as source evidence.

## Next priorities

1. Continue product work only against the 97 publication-ready canonical records and preserve safe no-answer behavior for every other status.
2. Process future high-value mainstream pending-review or outdated records only through controlling evidence or explicit authorized adjudication.
3. Keep specialist, administrative, linehaul, historical, and other non-daily-driver acquisition work in the deferred ledger until deliberately reprioritized.
4. Reopen an approval when newer applicable evidence materially conflicts; add further adjudications only after explicit Ready Route approval.
5. Repeat quality-control and adversarial-completeness passes after each meaningful source or adjudication batch.

The completed development-set intake over the owner-supplied candidate evaluation pack mapped 23 prompts to the canonical reference layer, 69 to canonical operational records, and 21 to explicit knowledge-gap or insufficient-context boundaries without importing candidate answers. All 113 development prompts are classified; only the 32 deterministic holdout prompts remain unmapped and untouched. After root-layer remediation, the non-indexed operational suite achieves 69/69 top-1, top-5, and response-mode matches, with 11 correct publication-withheld escalations and zero unsafe answer-gating failures. The maintained 192-case suite remains 192/192 for retrieval and response mode with zero unsafe gating failures. No candidate prompt was added as a retrieval synonym.

The current human-decision lane is available as a 27-question validator-enforced packet at [`human_adjudication_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/human_adjudication_packet_2026-08-10.md), backed by the machine-readable `research/fedex-ground-driver-knowledge/knowledge/human_adjudication_queue.csv`. It excludes the seven active approvals and keeps version-confirmation work separate.

The current-version lane is separately available as a 20-question validator-enforced packet at [`version_confirmation_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/version_confirmation_packet_2026-08-10.md), backed by `research/fedex-ground-driver-knowledge/knowledge/version_confirmation_queue.csv`. It preserves the exact older source/version and locator, requested controlling update, owner class, current safe boundary, and publication gate for every canonical `POTENTIALLY_OUTDATED` record.

## Restored archive verification

The original source-bearing USB workspace was rechecked at `/Volumes/USB322FD/readyroute` on 2026-08-10. The clone already contained every USB source, capture, and video-visual review file plus newer acquisitions. An ignore-existing copy left no USB file missing, all 69 registered archive checksums passed, and the portable and full-corpus validation stack passed. The detailed evidence is in [`workspace_restoration_audit_2026-08-10.md`](../research/fedex-ground-driver-knowledge/validation/workspace_restoration_audit_2026-08-10.md).

The connector now lists 37 direct Drive files representing 33 unique checksum-matched objects. The two latest unique files are the original Sideswipe Collisions and Summer Driving PDFs. Their exact bytes are archived, all fourteen pages were visually reconciled to the prior complete reviews, and all six former publication gaps are closed without changing the operational instructions.

No interface or deployment work is authorized by this release status.
