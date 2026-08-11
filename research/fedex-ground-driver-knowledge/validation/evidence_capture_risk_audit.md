# Evidence capture risk audit

Status date: 2026-08-10

## Purpose

Knowledge status answers whether the reviewed evidence supports the operational claim under the corpus's authority, currency, scope, and conflict rules. It does not answer whether the underlying evidence is durably preserved for reproducible production review. This audit classifies those questions separately for every operational knowledge record.

## Exact coverage

`knowledge/evidence_capture_risk_coverage.csv` contains one deterministic row for all 144 knowledge records:

| Evidence capture class | Records | Meaning |
|---|---:|---|
| `ALL_EVIDENCE_DURABLE` | 136 | Every evidence source has checksum-protected local bytes |
| `ALL_EVIDENCE_RENDERED_CAPTURE` | 6 | Every evidence page is preserved in hashed renders, but original source bytes remain unarchived |
| `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` | 2 | Every supporting source was fully reviewed in the authenticated browser, but no durable page/source capture is preserved |

The ledger preserves all evidence source IDs, their durable/full-transient/partial-transient partitions, the applicable production capture gate, exact authenticated recapture targets, and required follow-up.

## Verified records with production capture gates

Every operationally `VERIFIED` record has reviewable evidence, but eight verified records still carry production capture gates:

| Knowledge record | Capture class | Required queue targets |
|---|---|---|
| `KNO-SAF-REDLIGHT-001`; `KNO-SAF-SIDESWIPE-001` | `ALL_EVIDENCE_RENDERED_CAPTURE` | Original Sideswipe Prevention source-byte recapture; complete reviewed renders are hashed |
| `KNO-SAF-DISTRACTION-001`; `KNO-SAF-HYDRATION-001`; `KNO-SAF-SUMMER-TRAFFIC-001`; `KNO-SAF-SUN-EXPOSURE-001` | `ALL_EVIDENCE_RENDERED_CAPTURE` | Original Summer Driving source-byte recapture; complete reviewed renders are hashed |

This does not silently demote a record's knowledge status: each claim remains bounded to exact reviewed content. OP-130, OP-132, OP-135, and Dog Bite Prevention are now durable originals, so their former capture gates are closed. The ledger prevents the corpus from treating other records as production-evidence-ready until remaining exact sources are durably captured and revalidated.

## Publication interpretation

- `ALL_EVIDENCE_DURABLE` removes only the capture barrier; authority, currency, scope, conflict, human-review, and product-approval gates still apply.
- `ALL_EVIDENCE_RENDERED_CAPTURE` preserves reproducible page content but still requires original bytes before byte-identity or source-change claims.
- `MIXED_DURABLE_AND_TRANSIENT_EVIDENCE` has durable corroboration but still requires recapture before claiming complete reproducibility or source-change detection.
- `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` requires durable source recapture before production evidence approval.

These gates control evidence readiness, not driver procedure. They never authorize an answer, resolve a conflict, or infer content from an unavailable source.

## Automated control

`scripts/build_evidence_capture_risk_coverage.py` joins knowledge evidence, the 121-row source-capture ledger, and the 266-resource acquisition queue. It rejects unknown evidence sources, unreviewed/inaccessible evidence states, or any transient evidence source missing from the queue. `scripts/validate_corpus_integrity.py` requires exact 144-record coverage, exact deterministic content, valid classes, and nonblank gates/follow-up.

## Remaining limitation

The ledger identifies production evidence-capture risk but cannot resolve it offline. All transient evidence targets remain subject to authenticated acquisition, exact-source/version reconciliation, and renewed validation.
