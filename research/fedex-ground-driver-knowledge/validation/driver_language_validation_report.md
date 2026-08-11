# Driver-language validation report

Status date: 2026-08-09

Scope: the 138 structured operational records currently present in `knowledge/records.jsonl`. This is a validation of the knowledge structure and expected response behavior, not a test of a production retrieval model or chatbot.

## Validation design

The case library includes clear questions, shorthand, incomplete statements, misspellings, incorrect terminology, rare procedures, emergency situations, multi-record interactions, conflicts, version-sensitive material, and situations that require the smallest available clarification.

Every case now records:

- the expected knowledge record or records;
- facts that must be clarified;
- actions the answer must not recommend;
- the expected information-sufficiency classification; and
- the response mode Ready Route should eventually use.

The response modes prevent a successful knowledge-ID match from being mistaken for permission to give an approved answer.

## Results

- 192 realistic driver-language cases plus a generated 724-variant retrieval-oracle index containing 699 embedded and 25 supplemental test surfaces.
- 138 of 138 operational knowledge records have at least one formal case.
- All 83 `VERIFIED` records are covered.
- All 32 `HUMAN_REVIEW_REQUIRED` records are covered.
- All 20 `POTENTIALLY_OUTDATED` records are covered.
- Both `CONFLICT` records are covered.
- Every case has at least one explicit `must_not_do` guardrail.
- Every expected record ID exists.
- All expected sufficiency and response-mode classifications pass the status-aware validator.
- All 192 cases have an exact generated clarification strategy and stop rule; twenty-seven direct cases ask nothing, while all 165 non-direct cases preserve ordered decision or escalation facts.

### Expected information sufficiency

- 21 cases: `SUFFICIENT` — a direct source-grounded answer is available without another fact.
- 94 cases: `CONDITIONALLY_SUFFICIENT` — verified source knowledge exists, but one or more situation variables must be clarified.
- 41 cases: `INSUFFICIENT_FOR_APPROVED_ANSWER` — required source knowledge is unresolved, absent, or human-review limited and must be bounded and escalated.
- 25 cases: `INSUFFICIENT_WITHOUT_VERSION_CONFIRMATION` — the matching application or availability information is potentially outdated.
- 4 cases: `INSUFFICIENT_CONFLICT` — the disputed operational step must be withheld and escalated.

## Failures found and corrected

1. The initial case set covered only 94 of 104 records. Ten records had no realistic-language test.
2. The missing cases were added for mixed HAL/non-HAL transfer, wrong-scan deletion, physical package notation, scanning integrity, successful call-tag pickup, unlisted pickup, L10 activation, business-closure messaging, Delayed Login, and Manifest Preview.
3. The original cases did not explicitly state whether the available source information was sufficient to answer. Every case now has `information_sufficiency` and `response_mode`.
4. The corpus validator now fails if any operational record lacks a language case, if a case references a nonexistent record or source-gap ID, or if a case's sufficiency/response classification contradicts the expected record status or an explicitly required missing source.
5. A near-collision pass found cross-record ambiguity families. Cases `AMB-001` through `AMB-005` and `DOC-001` now test ordinary versus call-tag zero pickups, package barcode versus SRA form language, ordinary OP-201 conflict versus enrolled-shipper release, accident-scene versus evidence-reporting obligations, refusal branches, and source-limited hand-sheet/HAL language.
6. The FORGE page-completeness pass added eleven record-specific cases plus `FORGE-037`, which distinguishes a normally closed pickup from an unsent/sync-queued stop.
7. A high-risk interaction pass added cases for specialized-service overrides, source-authority limits, safety priority, recovery/scan integrity, document custody, vehicle/EOD accountability, capacity/time-window interaction, qualification, and trailer-pull safety. All 30 multi-record cases are now reconciled in `validation/high_risk_interaction_coverage.csv`.
8. A surface-language adversarial pass found weak explicit coverage for misspellings, incomplete phrases, and incorrect terminology. Fourteen source-bounded cases raised those dimensions to ten each without adding operational instructions; validator minimums now prevent regression.
9. Twenty-five tagged paraphrases close the historical short/extended surface gaps without adding operational content; all 144 records now pass the deterministic short-plus-extended surface ledger.
10. The MGB-119 reconciliation added `DLV-032` for shorthand around a missed first attempt on a PA+ package. It requires exact-label, attempt-state, safety, and signature clarification; it forbids expanding the undefined abbreviation or generalizing the same-day reattempt rule.
11. The rendered page-2 security follow-up added `SEC-012`, which tests whether a driver may leave keys in a locked van. It requires the source's independent key control—remove the keys or secure them in a key lockbox—and separately checks the applicable bulkhead door and windows.
12. Exact allocation review of the three-attempt record removed unsupported documentation, disposition, exception, and independent-authority claims. `DEL-032` now directly returns the sourced QA handoff after the third unsuccessful attempt while preserving the unresolved authorization boundary for a fourth attempt.
13. Exact delivery-scan review reconciled OP-117, OP-119, MGB-119, and package-placement guidance. `DLV-028` now directly rejects end-of-route delay scanning because the utterance already supplies the attempted-delivery context; no redundant clarification is asked.
14. Exact no-safe-place review initially removed an unsupported dog-safety inference from placement evidence. Complete review of the current 2026 Dog Bite Prevention topic now supplies the separate safety branch. `DLV-005` gives immediate source-backed dog safety, then asks only for the package/service fact needed by the separate release decision; `DOG-001` through `DOG-003` directly test approach, knockdown, and post-bite language.

## Important interpretation limits

- This pass validates expected mapping and answerability against the source-grounded records. It does not measure an embedding model, reranker, LLM, speech-to-text system, or production retrieval pipeline; product development is intentionally out of scope for this phase.
- A record-level case proves at least one tested expression, not exhaustive paraphrase coverage. More variants are still needed for newly acquired sources and for adversarial combinations among procedures.
- Cases mapped to verified safety guidance can still expose a separate operational gap. `DLV-005` now answers the dog-safety branch from `KNO-SAF-DOG-ENCOUNTER-001`, but does not invent a delivery status, package disposition, or internal business-reporting step; those questions remain separately sourced or escalated.
- Validation must be rerun whenever records, statuses, sources, or conflicts change.

## Reproducible gate

Run:

`python3 scripts/validate_corpus_integrity.py`

The gate enforces record coverage and status-aware answerability classifications and reports the current sufficiency distribution.

## Remaining validation work before final completion

- Add cases derived from every newly acquired MyGroundBiz child source.
- Increase paraphrase depth for records that currently have only one validation case.
- Expand multi-procedure cases where delivery, signature, placement, status, documentation, and escalation rules interact.
- Conduct the final retrieval/runtime evaluation only after a production storage/retrieval design is separately authorized; do not build it during this knowledge phase.
