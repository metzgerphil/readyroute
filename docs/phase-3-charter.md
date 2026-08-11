# Phase 3 — Red team, production hardening, and pilot readiness

Status: active, 2026-08-10.

## Mission

Phase 3 attempts to break and harden the Phase 2 driver assistant before any customer pilot. It is not a feature-expansion phase. The governing question is whether Ready Route behaves safely, accurately, consistently, and predictably when drivers use it in messy real-world conditions.

The primary success criterion is correct identification and application of eligible canonical knowledge through the complete query pipeline: input or transcription, intent classification, retrieval, eligibility validation, decision conditions, clarification, canonical selection, presentation, and trace storage. Fluency and speed cannot compensate for a wrong operational result.

## Non-negotiable boundaries

- Never invent a FedEx operational instruction.
- Never answer definitively from `PENDING_REVIEW`, `POTENTIALLY_OUTDATED`, `INSUFFICIENT_EVIDENCE`, or publication-withheld material.
- Never allow raw, conflicting, superseded, or user-provided text to override an active `READY_ROUTE_APPROVED` determination.
- Never weaken canonical validation to improve latency or apparent answer rate.
- Never expose protected source material, hidden instructions, credentials, or another company's data.
- Preserve query, context, selected record/version/status, sources, adjudication, response, feedback, and timestamp for incident reconstruction.
- Convert important defects into permanent regression tests and fix the responsible layer instead of polishing the output.
- Do not deploy, issue live charges, or create an EAS build without separate authority.

## Required test domains

1. Knowledge completeness and structure.
2. Retrieval and intent classification.
3. Ambiguity, minimal clarification, decision branches, and conversation context.
4. `READY_ROUTE_APPROVED` precedence and noneligible refusal.
5. Prompt injection, model boundaries, source exposure, and unsupported instructions.
6. Speech-to-text errors and high-impact term confirmation.
7. Concise-answer completeness and More Info fidelity.
8. Authentication, one-device control, onboarding, reset, recovery, and account sharing.
9. Company isolation at database, API, and UI layers.
10. Driver-month billing idempotency and month/payment lifecycle edges.
11. Mobile usability, network failures, retries, and duplicate submission.
12. Median, p90, p95, and p99 pipeline latency without weakening accuracy.
13. Knowledge addition, conflict, supersession, adjudication reopening, and historical traceability.
14. Application security, dependency, secrets, logging, privacy, retention, and legal-language placement.
15. Human incident review, quality metrics, monitoring, and controlled-pilot readiness.

## Critical failure standard

Any invented operational instruction, definitive noneligible answer, materially wrong procedure, overridden active adjudication, cross-company disclosure, trivial authentication bypass, systematic billing error, credential exposure, or missing answer trace is critical and blocks pilot readiness.

## Required final status

Phase 3 ends with exactly one assessment:

- `NOT_READY`: a critical issue or required blocker remains.
- `LIMITED_PILOT_READY`: no known critical blocker remains; a tightly controlled pilot with close monitoring is appropriate.
- `BROADER_RELEASE_CANDIDATE`: permitted only after successful pilot evidence and post-pilot review.

Phase 3 targets `LIMITED_PILOT_READY`; it does not presume broad production readiness.

## Definition of done

Phase 3 is complete only when the full query pipeline, maintained Phase 1 suite, expanded ambiguity suite, context, status/precedence, unsupported-instruction boundary, prompt injection, speech failure modes, authentication/account sharing, company isolation, billing, traceability, versioning, mobile usability, network failure, security, privacy, and performance have been tested; critical defects are resolved; material discoveries have regression tests; and the controlled pilot plan, metrics, stop criteria, limitations, legal/policy items, and deployment blockers are explicit.

