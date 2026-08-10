# High-risk multi-procedure interaction audit

Status date: 2026-08-09

## Purpose

Record-level language coverage does not prove that Ready Route can safely handle a driver statement involving two interacting procedures. A generic rule may be individually correct and still become unsafe when a specialized service, emergency, custody requirement, source conflict, or recovery sequence applies.

This audit makes every multi-record driver-language case independently accountable in `validation/high_risk_interaction_coverage.csv`.

## Coverage

- 185 total realistic driver-language cases.
- 138/138 operational knowledge records retain at least one case.
- 33 cases intentionally require two or more knowledge records.
- Every multi-record case has a named interaction family, risk class, exact expected knowledge set, and explanation of the failure it prevents.

## Risk classes

The 33 interactions cover ambiguous branches, specialized-service overrides, immediate safety priority, source-authority limits, recovery/scan integrity, document custody, vehicle/compliance closeout, version/synchronization state, and combined capacity/time risk.

## Representative closed interaction gaps

1. Alcohol plus ASR when the adult has no ID.
2. Pickup scanner failure plus an unidentified/manual “Blue Sheet.”
3. Mid-route vehicle change plus EOD/DVIR accountability.
4. Wrong-work-area package plus FORGE unmanifested-delivery capability.
5. Misdelivery recovery plus truthful scan chronology.
6. Leaking call-tag package plus hazardous-material emergency handling.
7. Delivered hazmat plus remaining paperwork/manifest custody.
8. Non-HAL package appearing at a HAL transfer stop.
9. FORGE address edit plus physical package notation.
10. Missing manifest plus Delayed Login.
11. Hazmat signature requirement versus an otherwise safe porch.
12. Pickup vehicle capacity plus a closing service window.
13. Dog safety takes priority while package disposition remains a separate clarification branch.

The specialized-override cases deliberately include direct-answer tests: a safe porch does not authorize unattended hazmat release, and an adult without acceptable ID does not satisfy alcohol/ASR requirements. Human-review and version-sensitive interactions remain source-limited rather than being forced into an answer.

## Current sufficiency distribution

- 21 `SUFFICIENT`.
- 94 `CONDITIONALLY_SUFFICIENT`.
- 41 `INSUFFICIENT_FOR_APPROVED_ANSWER`.
- 25 `INSUFFICIENT_WITHOUT_VERSION_CONFIRMATION`.
- 4 `INSUFFICIENT_CONFLICT`.

## Automated controls

`scripts/validate_corpus_integrity.py` derives the required interaction set from every case containing more than one expected knowledge ID. It rejects a missing or stale interaction row, an unknown case, a knowledge set that differs from the case, an unsupported risk class, or a missing family/rationale. New multi-record cases therefore cannot enter the library without explicit interaction-risk accountability.

## Limitation

These cases validate expected mapping and response behavior against the current source-grounded knowledge structure. They do not execute a retrieval model, speech recognizer, chatbot, or production interface, which remain outside this phase.
