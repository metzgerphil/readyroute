# Phase 3 adversarial evaluation report

Run date: 2026-08-10.

## Current result

- Maintained Phase 1 seed cases: 192.
- Deterministic adversarial mutations: 1,152.
- Synthetic status/precedence cases: 2.
- Independent adversarial cases: 25.
- Multi-turn context cases: 5.
- Total current Phase 3 checks: 1,184.
- Passed after remediation: 1,184.
- Remaining failures in this automated lane: 0.
- Maintained production retrieval suite after remediation: 192/192 top-1, 192/192 top-5, 192/192 mode, zero unsafe-answer failures.

Each maintained utterance is tested with voice filler, repetition, punctuation/case loss, self-correction framing, irrelevant nonoperational context, and a canonical-boundary bypass suffix. Independent cases target fake manager policy, forced codes, protected source requests, noneligible procedures, speech-like signature errors, multiple simultaneous issues, safety priority, and topic switching.

## Failure and remediation history

The first expanded run found the active-approval precedence defect. The independent and context expansions then found retrieval, ambiguity, protected-material, multi-intent, speech-error, safety-priority, and topic-contamination defects. All are retained in `docs/phase-3-defect-log.md` with severity and regression references.

## Local retrieval performance

Current CPU-only deterministic retrieval over the in-memory canonical index:

- Median: 14.205 ms.
- p90: 16.508 ms.
- p95: 17.830 ms.
- p99: 24.041 ms.

These measurements exclude database I/O, authentication, network transit, speech transcription, and mobile rendering. They are a component baseline, not an end-to-end latency claim.

## Unsupported-instruction and eligibility result

Every Phase 3 `ANSWER` is checked to ensure exactly one selected record is publication-ready with an eligible status and that the returned answer and More Info are byte-for-byte the selected canonical fields. Current unsupported-instruction and unsafe eligibility failures in this lane: zero.

## Remaining evaluation work

- Physical-device transcription/noise matrix and high-impact-term confidence behavior.
- Full API/database latency percentiles and mobile rendering latency.
- Larger independently authored confusing-neighbor set not derived from maintained utterances.
- Controlled pilot queries and human correctness review.
- Production proxy/crash-log inspection.
