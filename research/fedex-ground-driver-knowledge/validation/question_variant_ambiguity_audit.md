# Question-variant ambiguity audit

Status date: 2026-08-09

Purpose: adversarially test whether natural driver phrasing could retrieve a materially different procedure and ensure ambiguous language triggers clarification or status-sensitive withholding instead of a confident but incorrect answer.

## Library quality

- 138 records contain 665 embedded driver-question variants.
- Every record has four to eight variants; no record falls below the current four-variant floor.
- Twenty-five tagged supplemental variants close per-record surface gaps, producing 690 unique normalized variant utterances in `validation/driver_variant_index.jsonl`.
- The validation library now contains 185 unique normalized utterances.
- All 138 records remain covered by at least one validation case.

## Near-collision findings

Pairwise normalized-string comparison at a 0.78 similarity threshold identified six cross-record collision families:

1. “Nothing ready at pickup” can mean an ordinary listed zero-package pickup or a call tag that is not ready.
2. “Form/barcode” language can refer to the package shipping label, manual package-barcode entry, or a non-barcoded Shipment Release Authorization form.
3. “FORGE says no OP-201” can refer to the unresolved ordinary business-release conflict or the distinct enrolled-shipper authorization branch.
4. “Minor crash/no injuries” can invoke both immediate accident-scene actions and electronic/video evidence reporting and preservation.
5. “Pickup closed/not sent” can refer either to normal pickup closeout or to a closed event waiting in the sync queue.
6. “Pickup scans/counts do not match” can refer to closeout-count accuracy, an accepted package that was not scanned, or both.

Six threshold-driven multi-record adversarial cases now require the smallest discriminating clarifications and preserve the correct response mode. The OP-201 collision is deliberately conflict-withheld even when the utterance resembles the verified shipper-release branch; `FORGE-037` preserves current-version confirmation for the pickup/sync collision, and `PUP-020` separates closeout-count accuracy from pickup scan integrity.

A fifth semantic case, `AMB-005`, covers ordinary delivery refusal, ASR ID refusal, and call-tag refusal. It was added even though those phrases do not cross the character-similarity threshold because the driver intent is materially ambiguous. The language pass also exposed and closed the missing ordinary-refusal record/gap described in `validation/driver_variant_index_audit.md`.

## Regression controls

The corpus validator now enforces:

- At least four embedded driver-question variants per record.
- Exact one-to-one equality among 665 embedded variants, 25 supplemental variants, and the generated 690-row variant index.
- One short and one extended surface for every record across variants and formal cases.
- Unique normalized validation utterances.
- Full record coverage by validation cases.
- A multi-record validation case for every cross-record near-collision at the current similarity threshold.
- Existing status-aware sufficiency and response-mode behavior after multi-record matching.

The similarity check is a discovery control, not a production retrieval model. It does not claim semantic completeness, and it must be rerun as new source-derived terminology and variants are added.
