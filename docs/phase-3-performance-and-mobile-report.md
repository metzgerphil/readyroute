# Phase 3 performance, network, and mobile review

Run date: 2026-08-10.

## Measured component performance

The 1,184-case local adversarial run measured deterministic retrieval against the in-memory canonical index at 14.205 ms median, 16.508 ms p90, 17.830 ms p95, and 24.041 ms p99. These figures do not include authentication, database, network, speech recognition, model processing, or rendering and therefore are not an end-to-end performance claim.

End-to-end percentile measurement remains blocked until an authorized production-like environment and physical test devices exist. Accuracy and eligibility checks must not be bypassed to reduce latency.

## Network and retry behavior

- A timeout or connection failure explicitly says that no verified answer was received; it never presents a partial or cached result as current.
- The driver receives a retry action and an urgent-management path.
- Duplicate submission is disabled while a request is pending.
- A previous answer that remains on screen during follow-up verification is explicitly labeled as the previous answer.
- Automated mobile regressions cover timeout copy, stale-answer labeling, and duplicate-submit prevention.

Database timeout, retrieval-service failure, model-provider failure, speech-upload failure, and proxy retry behavior still require production-like fault injection. The current device-native speech architecture does not upload audio to the Ready Route backend.

## Mobile review

The portable driver-app suite passes 29/29 suites and 225/225 tests, including the core Driver Help answer, clarification, escalation, feedback, traceability, timeout, pending-follow-up, and duplicate-submit flows. Expo configuration validation also passes.

The manager portal passes lint, production build, and 23/23 portable tests.

Static and automated review confirms the primary microphone/text interaction, structured answer hierarchy, selectable clarifications, More Info, loading state, and retry state exist. Physical iPhone/Android and representative tablet review remains required for tap targets, keyboard behavior, screen-reader use, noisy-environment speech, long-answer scanning, permissions, reinstall, and replacement-device behavior.

## Current disposition

Portable performance and mobile behavior are green. End-to-end latency, production-like failure injection, and physical-device usability are open pre-pilot gates.
