# Evidence capture risk audit

Status date: 2026-08-09

## Purpose

Knowledge status answers whether the reviewed evidence supports the operational claim under the corpus's authority, currency, scope, and conflict rules. It does not answer whether the underlying evidence is durably preserved for reproducible production review. This audit classifies those questions separately for every operational knowledge record.

## Exact coverage

`knowledge/evidence_capture_risk_coverage.csv` contains one deterministic row for all 138 knowledge records:

| Evidence capture class | Records | Meaning |
|---|---:|---|
| `ALL_EVIDENCE_DURABLE` | 133 | Every evidence source has checksum-protected local bytes |
| `ALL_EVIDENCE_RENDERED_CAPTURE` | 1 | Every evidence page is preserved in hashed renders, but original source bytes remain unarchived |
| `MIXED_DURABLE_AND_TRANSIENT_EVIDENCE` | 1 | At least one durable source and at least one fully reviewed transient portal source support the record |
| `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` | 2 | Every supporting source was fully reviewed in the authenticated browser, but no durable page/source capture is preserved |
| `EVIDENCE_WITH_PARTIAL_SOURCE` | 1 | The evidence set contains a partially reviewed source; a hashed partial render does not complete the unseen source scope |

The ledger preserves all evidence source IDs, their durable/full-transient/partial-transient partitions, the applicable production capture gate, exact authenticated recapture targets, and required follow-up.

## Verified records with production capture gates

Every operationally `VERIFIED` record now has either durable original source bytes or complete hashed page renders. Two verified records still carry production capture gates:

| Knowledge record | Capture class | Required queue targets |
|---|---|---|
| `KNO-INC-ACCIDENT-SCENE-001` | `EVIDENCE_WITH_PARTIAL_SOURCE` | Orders 1, 35, and 36: OP-135 complete-page/original-byte acquisition plus durable OP-130 and OP-132 recapture; OP-135's five upper views are hashed and the Accident Reporting page is durable |
| `KNO-SAF-DOG-ENCOUNTER-001` | `ALL_EVIDENCE_RENDERED_CAPTURE` | Original Dog Bite Prevention PDF-byte recapture; all seven page renders are already hashed and reviewed |

This does not silently demote the record's knowledge status: each claim remains bounded to exact reviewed content, and OP-135 contributes only its reviewed page-1 fields. It does prevent the corpus from treating the record as production-evidence-ready until the remaining exact sources are completed, durably captured, and revalidated.

## Publication interpretation

- `ALL_EVIDENCE_DURABLE` removes only the capture barrier; authority, currency, scope, conflict, human-review, and product-approval gates still apply.
- `ALL_EVIDENCE_RENDERED_CAPTURE` preserves reproducible page content but still requires original bytes before byte-identity or source-change claims.
- `MIXED_DURABLE_AND_TRANSIENT_EVIDENCE` has durable corroboration but still requires recapture before claiming complete reproducibility or source-change detection.
- `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` requires durable source recapture before production evidence approval.
- `EVIDENCE_WITH_PARTIAL_SOURCE` requires completion of unseen source content and original-byte or complete-page recapture before production evidence approval.

These gates control evidence readiness, not driver procedure. They never authorize an answer, resolve a conflict, or infer content from an unavailable source.

## Automated control

`scripts/build_evidence_capture_risk_coverage.py` joins knowledge evidence, the 106-row source-capture ledger, and the 289-resource acquisition queue. It rejects unknown evidence sources, unreviewed/inaccessible evidence states, or any transient evidence source missing from the queue. `scripts/validate_corpus_integrity.py` requires exact 138-record coverage, exact deterministic content, valid classes, and nonblank gates/follow-up.

## Remaining limitation

The ledger identifies production evidence-capture risk but cannot resolve it offline. All transient evidence targets remain subject to authenticated acquisition, exact-source/version reconciliation, and renewed validation.
