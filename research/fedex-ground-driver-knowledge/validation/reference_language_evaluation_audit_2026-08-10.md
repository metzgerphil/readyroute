# Reference-language evaluation audit

Status date: 2026-08-10

## Purpose

The maintained operational evaluation suite maps driver language to canonical procedure records. The owner-supplied candidate pack exposed a distinct mainstream question type: a driver asking what a numeric code means, comparing two codes, or asking for a code without enough situation or namespace information. Forcing these questions onto one procedure record produced misleading diagnostic retrieval results.

`validation/reference_language_cases.jsonl` creates a separate canonical-reference evaluation lane. It does not change operational knowledge or accept the candidate pack's expected answers.

## Current coverage

- 17 independently reviewed development prompts.
- 16 delivery-status reference questions and one broad pickup-reason selection question.
- 19 unique delivery-status references exercised.
- 32 deterministic candidate holdout prompts remain untouched.
- 95 candidate prompts remain `NEEDS_CANONICAL_MAPPING` after the separate operational-mapping batch.

The cases cover:

- direct code comparisons (`002` versus `003`, `004` versus `007`, and `014` versus `019`);
- terse code selection with missing operational context;
- delivery-versus-pickup namespace ambiguity;
- reference definitions whose complete workflow remains absent or human-review gated;
- auto-applied results that must not become driver-selection instructions;
- an Express-only security-delay code contrasted with the Ground security-prevention branch;
- the unknown candidate token `106`, which is withheld because it is absent from the canonical reference dataset;
- broad pickup-reason selection that must clarify the actual outcome before choosing a reason.

## Safety boundary

A `VERIFIED` reference definition establishes what the code means within its documented namespace. It does not automatically establish:

- that the driver may choose the code;
- that every condition for the code is known;
- the complete scan, documentation, custody, return, reattempt, or escalation procedure;
- that an auto-applied or outside-Ground code may be manually selected.

Each case therefore names expected references and related knowledge records separately, records required clarification, and lists prohibited behavior. `ANSWER_REFERENCE_WITH_WORKFLOW_BOUNDARY` permits the verified definition while preserving missing or gated procedure steps. `CLARIFY_BEFORE_REFERENCE_SELECTION` prevents guessing. `WITHHOLD_UNKNOWN_REFERENCE` prevents an unregistered code token from entering canonical truth.

## Automated controls

`scripts/validate_reference_data.py` now validates every reference-language case against all 50 delivery-status and seven pickup-reason records, all 144 knowledge IDs, allowed response modes, sufficiency states, unique candidate trace, and required `must_not_do` boundaries.

The generated release now includes:

- `knowledge/reference/delivery-status-codes.jsonl`;
- `knowledge/reference/pickup-reason-codes.jsonl`;
- `knowledge/evaluations/reference-language-cases.jsonl`.

The release manifest checksums all three files, and `scripts/validate-ready-route-knowledge.js` verifies their foreign keys.

## Remaining work

Continue mapping only development prompts until the evaluation design is frozen. Do not add holdout prompts as retrieval synonyms. Current OP-324, OP-321, and the 21 definition-only delivery workflows remain source-acquisition obligations; the reference suite must preserve those limits until controlling evidence is acquired and reviewed.
