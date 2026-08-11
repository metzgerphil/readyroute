# Evidence capture risk audit

Status date: 2026-08-10

## Purpose

Knowledge status answers whether the reviewed evidence supports the operational claim under the corpus's authority, currency, scope, and conflict rules. It does not answer whether the underlying evidence is durably preserved for reproducible production review. This audit classifies those questions separately for every operational knowledge record.

## Exact coverage

`knowledge/evidence_capture_risk_coverage.csv` contains one deterministic row for all 144 knowledge records:

| Evidence capture class | Records | Meaning |
|---|---:|---|
| `ALL_EVIDENCE_DURABLE` | 142 | Every evidence source has checksum-protected local bytes |
| `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` | 2 | Every supporting source was fully reviewed in the authenticated browser, but no durable page/source capture is preserved |

The ledger preserves all evidence source IDs, their durable/full-transient/partial-transient partitions, the applicable production capture gate, exact authenticated recapture targets, and required follow-up.

## Verified records with production capture gates

No `VERIFIED` record retains a production evidence-capture gate. The Sideswipe Collisions and Summer Driving originals are now archived and page-reconciled, closing all six former gates. The two transient-only rows are non-verified and remain separately status- and capture-gated.

## Publication interpretation

- `ALL_EVIDENCE_DURABLE` removes only the capture barrier; authority, currency, scope, conflict, human-review, and product-approval gates still apply.
- `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE` requires durable source recapture before production evidence approval.

These gates control evidence readiness, not driver procedure. They never authorize an answer, resolve a conflict, or infer content from an unavailable source.

## Automated control

`scripts/build_evidence_capture_risk_coverage.py` joins knowledge evidence, the 123-row source-capture ledger, and the 264-resource acquisition queue. It rejects unknown evidence sources, unreviewed/inaccessible evidence states, or any transient evidence source missing from the queue. `scripts/validate_corpus_integrity.py` requires exact 144-record coverage, exact deterministic content, valid classes, and nonblank gates/follow-up.

## Remaining limitation

The ledger identifies production evidence-capture risk but cannot resolve it offline. All transient evidence targets remain subject to authenticated acquisition, exact-source/version reconciliation, and renewed validation.
