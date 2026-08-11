# Knowledge release status

Status date: 2026-08-10

The current release is a validated foundation, not a claim that the entire possible FedEx corpus is complete.

## Current release

- 144 canonical operational records.
- 90 `SOURCE_VERIFIED` records.
- 7 `READY_ROUTE_APPROVED` adjudications from the explicit 2026-08-10 human-verification packet.
- 27 `PENDING_REVIEW` records; partial, absent, and CXPC/management-dependent items from the packet remain gated.
- 20 `POTENTIALLY_OUTDATED` records.
- 91 records pass status, durable-capture, and exact claim-trace publication gates.
- 6 additional status-eligible records remain evidence-gated; see [`operations/publication-gaps.jsonl`](operations/publication-gaps.jsonl).
- 121 primary source-registry records and 3,242 claim-provenance/allocation records.
- 192 formal operational driver-language cases, 17 canonical reference-language cases, and 724 indexed operational question variants.

## Material remaining source work

The research [goal completion matrix](../research/fedex-ground-driver-knowledge/reports/goal_completion_matrix.md) remains controlling for completeness. Material gaps include authenticated MyGroundBiz acquisition, unacquired Safety Topic documents, current referenced procedures/forms such as OP-324, OP-321, OP-207/OP-207Res and other named artifacts, partially reviewed sources, executed agreement schedules/attachments, version-sensitive FORGE workflows, pending conflicts, and expert/legal/safety adjudications.

The authenticated acquisition ledger currently contains 272 queued resources, and the referenced-source ledger contains 42 explicit missing-source obligations. These are not silently treated as reviewed or irrelevant. The latest source batches completed the current FORGE 3.3, OP-130/132/135, Download Pickup List, Dog Bite Prevention, current Equipment Terms, Vehicle Appearance FAQ, SRS/SRI FAQ, four byte-identical portal/Drive reconciliations, the 89-page OP-117 render comparison, and bounded older pickup-reference reviews. The seven approvals resolve only the narrow human-reviewed determinations; every stated gap, version-sensitive workflow, and partial branch remains preserved.

## Next priorities

1. Resolve the 6 source-verified publication gaps without weakening evidence controls.
2. Process high-value mainstream pending-review and outdated records through current source acquisition and human adjudication.
3. Acquire/review the prioritized MyGroundBiz and referenced-source queue while preserving exact identity and version.
4. Reopen an approval when newer applicable evidence materially conflicts; add further adjudications only after explicit Ready Route approval.
5. Repeat quality-control and adversarial-completeness passes after each meaningful source batch.

The first safe intake pass over the owner-supplied candidate evaluation pack mapped 17 mainstream code questions to the canonical reference layer without importing candidate answers. It preserves definition-versus-workflow limits, namespace collisions, unknown code tokens, auto-applied results, and human-review boundaries. The remaining 128 candidate prompts are still unmapped, including all 32 deterministic holdout prompts.

The current human-decision lane is available as a 27-question validator-enforced packet at [`human_adjudication_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/human_adjudication_packet_2026-08-10.md), backed by the machine-readable `research/fedex-ground-driver-knowledge/knowledge/human_adjudication_queue.csv`. It excludes the seven active approvals and keeps version-confirmation work separate.

The current-version lane is separately available as a 20-question validator-enforced packet at [`version_confirmation_packet_2026-08-10.md`](../research/fedex-ground-driver-knowledge/reports/version_confirmation_packet_2026-08-10.md), backed by `research/fedex-ground-driver-knowledge/knowledge/version_confirmation_queue.csv`. It preserves the exact older source/version and locator, requested controlling update, owner class, current safe boundary, and publication gate for every canonical `POTENTIALLY_OUTDATED` record.

## Restored archive verification

The original source-bearing USB workspace was rechecked at `/Volumes/USB322FD/readyroute` on 2026-08-10. The clone already contained every USB source, capture, and video-visual review file plus newer acquisitions. An ignore-existing copy left no USB file missing, all 69 registered archive checksums passed, and the portable and full-corpus validation stack passed. The detailed evidence is in [`workspace_restoration_audit_2026-08-10.md`](../research/fedex-ground-driver-knowledge/validation/workspace_restoration_audit_2026-08-10.md).

The first six publication gaps remain unchanged because their two original safety PDFs are not present on the USB or in the supplied Drive folder. MyGroundBiz returned `Access Denied` during the current recapture attempt, so the complete hashed rendered captures remain evidence rather than being mislabeled as original bytes.

No interface or deployment work is authorized by this release status.
