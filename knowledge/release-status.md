# Knowledge release status

Status date: 2026-08-10

The current release is a validated foundation, not a claim that the entire possible FedEx corpus is complete.

The requirement-by-requirement decision is recorded in the research [`Phase 1 completion audit`](../research/fedex-ground-driver-knowledge/reports/phase_1_completion_audit_2026-08-10.md). It confirms that restoration, checksums, current-corpus quality control, adversarial evaluation, and validation are complete while the remaining source, version, publication-evidence, and human-decision queues still prevent a truthful Phase 1 completion claim.

## Current release

- 144 canonical operational records.
- 90 `SOURCE_VERIFIED` records.
- 7 `READY_ROUTE_APPROVED` adjudications from the explicit 2026-08-10 human-verification packet.
- 27 `PENDING_REVIEW` records; partial, absent, and CXPC/management-dependent items from the packet remain gated.
- 20 `POTENTIALLY_OUTDATED` records.
- 91 records pass status, durable-capture, and exact claim-trace publication gates.
- 6 additional status-eligible records remain evidence-gated; see [`operations/publication-gaps.jsonl`](operations/publication-gaps.jsonl).
- 121 primary source-registry records and 3,242 claim-provenance/allocation records.
- 192 formal operational driver-language cases, 23 canonical reference-language cases, 69 non-indexed candidate operational cases, 21 candidate knowledge-gap cases, and 724 indexed operational question variants.

## Material remaining source work

The research [goal completion matrix](../research/fedex-ground-driver-knowledge/reports/goal_completion_matrix.md) remains controlling for completeness. Material gaps include authenticated MyGroundBiz acquisition, unacquired Safety Topic documents, current referenced procedures/forms such as OP-324, OP-321, OP-207/OP-207Res and other named artifacts, partially reviewed sources, executed agreement schedules/attachments, version-sensitive FORGE workflows, pending conflicts, and expert/legal/safety adjudications.

The authenticated acquisition ledger currently contains 266 queued resources, and the referenced-source ledger contains 42 explicit missing-source obligations. These are not silently treated as reviewed or irrelevant. The latest source batches completed the current FORGE 3.3, OP-130/132/135, Download Pickup List, Dog Bite Prevention, current Equipment Terms, Vehicle Appearance FAQ, SRS/SRI FAQ, four byte-identical portal/Drive reconciliations, the 89-page OP-117 render comparison, bounded older pickup-reference reviews, and complete audio-visual review of six preserved 2017 FCC videos. Those videos remain historical manager-facing context with no canonical mappings. The seven approvals resolve only the narrow human-reviewed determinations; every stated gap, version-sensitive workflow, and partial branch remains preserved.

All 21 candidate knowledge-gap cases are now reconciled to an existing acquisition target, a new source/authority obligation, clarification-only handling, or exact context required before queueing. Direct retrieval attempts for the newest inventoried Backing and Railroad intersections documents returned HTTP 403; no access-denied response was admitted as source evidence.

## Next priorities

1. Resolve the 6 source-verified publication gaps without weakening evidence controls.
2. Process high-value mainstream pending-review and outdated records through current source acquisition and human adjudication.
3. Acquire/review the prioritized MyGroundBiz and referenced-source queue while preserving exact identity and version.
4. Reopen an approval when newer applicable evidence materially conflicts; add further adjudications only after explicit Ready Route approval.
5. Repeat quality-control and adversarial-completeness passes after each meaningful source batch.

The completed development-set intake over the owner-supplied candidate evaluation pack mapped 23 prompts to the canonical reference layer, 69 to canonical operational records, and 21 to explicit knowledge-gap or insufficient-context boundaries without importing candidate answers. All 113 development prompts are classified; only the 32 deterministic holdout prompts remain unmapped and untouched. After root-layer remediation, the non-indexed operational suite achieves 69/69 top-1, top-5, and response-mode matches, with 11 correct publication-withheld escalations and zero unsafe answer-gating failures. The maintained 192-case suite remains 192/192 for retrieval and response mode with zero unsafe gating failures. No candidate prompt was added as a retrieval synonym.

The current human-decision lane is available as a 27-question validator-enforced packet at [`human_adjudication_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/human_adjudication_packet_2026-08-10.md), backed by the machine-readable `research/fedex-ground-driver-knowledge/knowledge/human_adjudication_queue.csv`. It excludes the seven active approvals and keeps version-confirmation work separate.

The current-version lane is separately available as a 20-question validator-enforced packet at [`version_confirmation_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/version_confirmation_packet_2026-08-10.md), backed by `research/fedex-ground-driver-knowledge/knowledge/version_confirmation_queue.csv`. It preserves the exact older source/version and locator, requested controlling update, owner class, current safe boundary, and publication gate for every canonical `POTENTIALLY_OUTDATED` record.

## Restored archive verification

The original source-bearing USB workspace was rechecked at `/Volumes/USB322FD/readyroute` on 2026-08-10. The clone already contained every USB source, capture, and video-visual review file plus newer acquisitions. An ignore-existing copy left no USB file missing, all 69 registered archive checksums passed, and the portable and full-corpus validation stack passed. The detailed evidence is in [`workspace_restoration_audit_2026-08-10.md`](../research/fedex-ground-driver-knowledge/validation/workspace_restoration_audit_2026-08-10.md).

The first six publication gaps remain unchanged because their two original safety PDFs are not present on the USB or in the supplied Drive folder. A restored connector listing and complete raw-byte hash reconciliation confirmed 35 current direct Drive files, representing 31 unique archive-matched objects, without either missing safety PDF. MyGroundBiz returned `Access Denied` during the current recapture attempt, so the complete hashed rendered captures remain evidence rather than being mislabeled as original bytes.

No interface or deployment work is authorized by this release status.
