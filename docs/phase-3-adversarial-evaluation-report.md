# Phase 3 adversarial evaluation report

Run date: 2026-08-10.

## Current result

- Maintained Phase 1 seed cases: 192.
- Deterministic adversarial mutations: 1,152.
- Synthetic status/precedence cases: 2.
- Independent adversarial and confusing-neighbor cases: 85.
- Multi-turn context cases: 5.
- Publication-ready record coverage: 97/97, enforced by the validator.
- Total current Phase 3 checks: 1,244.
- Passed after remediation: 1,244.
- Remaining failures in this automated lane: 0.
- Maintained production retrieval suite after remediation: 192/192 top-1, 192/192 top-5, 192/192 mode, zero unsafe-answer failures.

Each maintained utterance is tested with voice filler, repetition, punctuation/case loss, self-correction framing, irrelevant nonoperational context, and a canonical-boundary bypass suffix. Independent cases target fake manager policy, forced codes, protected source requests, noneligible procedures, speech-like signature errors, multiple simultaneous issues, safety priority, and topic switching.

## Failure and remediation history

The first expanded run found the active-approval precedence defect. The independent and context expansions then found retrieval, ambiguity, protected-material, multi-intent, speech-error, safety-priority, and topic-contamination defects. All are retained in `docs/phase-3-defect-log.md` with severity and regression references.

The post-Phase-1 reconciliation run initially found 20 adversarial ranking failures and one separate Phase 2 holdout failure. Root causes were conversational filler contaminating intent, underweighted specialized workflows, and an underspecified boundary-bypass refusal. The retrieval layer was corrected, permanent unit regressions were added, and the maintained, holdout, candidate, and Phase 3 suites all returned to full pass.

The subsequent supplied-evaluation audit added 60 independently worded confusing-neighbor cases. Their first run found 23 additional failures: 18 retrieval, four classification, and one clarification failure. Root-layer remediation added explicit service-type precedence, generic no-answer clarification, specialized pickup/FORGE/hazmat/security/incident/HOS intent handling, noneligible-neighbor protection, and bounded direct-mode rules. All 60 new cases now pass without weakening the maintained suites.

## Local retrieval performance

Current CPU-only deterministic retrieval over the in-memory canonical index:

- Median: 10.066 ms.
- p90: 10.828 ms.
- p95: 11.107 ms.
- p99: 11.673 ms.

These measurements exclude database I/O, authentication, network transit, speech transcription, and mobile rendering. They are a component baseline, not an end-to-end latency claim.

## Unsupported-instruction and eligibility result

Every Phase 3 `ANSWER` is checked to ensure exactly one selected record is publication-ready with an eligible status and that the returned answer and More Info are byte-for-byte the selected canonical fields. Current unsupported-instruction and unsafe eligibility failures in this lane: zero.

## Remaining evaluation work

- Physical-device transcription/noise matrix and high-impact-term confidence behavior.
- Full API/database latency percentiles and mobile rendering latency.
- Larger independently authored confusing-neighbor set not derived from maintained utterances.
- Controlled pilot queries and human correctness review.
- Production proxy/crash-log inspection.
