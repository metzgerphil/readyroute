# Phase 3 test plan

## Strategy

Freeze the Phase 2 commit, test the narrow production V1 as implemented, classify every failure, fix the responsible layer, add a regression, and rerun the complete maintained suite after each hardening batch. No feature expansion is included.

## Test lanes

| Lane | Method | Required evidence |
| --- | --- | --- |
| Canonical retrieval | Maintained 192 cases, independent holdout, deterministic adversarial mutations, confusing-neighbor cases | Top-1/top-5 ID, response mode, status gate, failure layer |
| Clarification and decisions | Ambiguous pairs, omitted variables, already-supplied variables, branch corrections | Required/minimal clarification, branch selected, no guessing |
| Context | Multi-turn sessions, corrections, topic switches, returns to earlier topic | Context before/after, selected record, contamination checks |
| Status and precedence | All 7 approvals, publication-withheld eligible records, every noneligible status, synthetic conflicting source update | Approved trace wins; noneligible target escalates; history preserved |
| Presentation fidelity | Compare answer, More Info, structure, procedure, documentation, prohibitions, escalation | Unsupported-instruction count and omitted-critical-step count |
| Prompt/security boundary | Injection corpus, fake policy, requested raw sources/instructions, malformed and oversized input | No policy override, source leakage, or unauthorized answer |
| Authentication/onboarding | Applied local database plus API/UI tests | Replay, expiry, reset, device replacement, deactivation, recovery, brute force |
| Company isolation | Two-company RLS, API object substitution, UI route/state tests | Zero cross-company reads/writes across drivers, billing, analytics, interactions |
| Billing | Database and service boundary tables covering all stated calendar/payment edges | One ledger row per account/driver/month; explicit provider-blocked scenarios |
| Network/reliability | Delays, timeout, database failure, duplicate retry, offline/partial response | Clear retry state; no stale/partial answer misrepresented as verified |
| Performance | Instrumented local runs and later physical-device runs | median, p90, p95, p99 by transcription, API, retrieval, DB, rendering |
| Mobile usability and speech | Automated screen tests plus representative physical phones/tablets and recorded noise matrix | Tap/readability/error-state findings; transcript meaning-change rate |
| Knowledge updates | Synthetic add, clarify, conflict, approval conflict, supersession, partial branch change | History/version preservation, review reopening, affected evaluation changes |
| Traceability/incident review | Random response samples and negative/unanswered workflows | Complete query-to-source/adjudication reconstruction without raw-log archaeology |
| Privacy/legal/operations | Data map, logs, retention, consent/legal placement, reviewer workflow | Documented storage/access/minimization; counsel and policy gates explicit |

## Automated adversarial expansion

Each maintained case is deterministically mutated with voice filler, repetition, punctuation removal, irrelevant but nonoperational words, self-correction framing, and boundary-bypass suffixes. Separate independent cases cover similar procedures, multiple simultaneous issues, topic switches, high-impact codes/signature terms, fake manager policy, source requests, and noneligible targets. The supplied 155-case evaluation pack is treated as a language input rather than operational authority; its audit and the 60-case confusing-neighbor expansion are recorded in `phase-3-supplied-evaluation-audit.md`. Mutations inherit only the canonical expected IDs and production response policy of their seed case.

## Quality metrics

- Knowledge match accuracy: correct canonical record in top 1 and top 5.
- Clarification accuracy: required clarifications asked; sufficient questions answered without unnecessary clarification.
- Production eligibility accuracy: correct status/publication behavior.
- Procedure fidelity: required actions, documentation, prohibitions, and escalation preserved.
- Unsupported instruction rate: instructions with no selected eligible canonical support.
- Negative feedback and no-answer rates.
- Median, p90, p95, and p99 latency.

## Exit and pilot rule

No known critical failure may remain. Automated correctness and isolation lanes must pass; device, privacy/legal, payment, and production-observability gates must be explicitly completed or the final status remains `NOT_READY`. A controlled pilot plan must specify participants based on support capacity, duration, monitoring, incident workflow, success criteria, and stop criteria without inventing unsupported numbers.
