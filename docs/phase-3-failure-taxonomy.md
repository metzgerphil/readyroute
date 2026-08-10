# Phase 3 failure taxonomy

Every discovered issue receives one primary category, optional contributing categories, severity, reproducible input, expected/actual behavior, affected layer, canonical IDs/versions when relevant, and regression-test reference.

| Category | Definition | Critical examples |
| --- | --- | --- |
| `KNOWLEDGE_FAILURE` | Canonical knowledge is missing, incomplete, ambiguous, incorrectly structured, or wrong. | An eligible record omits a required prohibition or action. |
| `RETRIEVAL_FAILURE` | Correct knowledge exists but is not found or the wrong record ranks first. | A similar procedure becomes the definitive answer. |
| `CLASSIFICATION_FAILURE` | The described operational situation is misunderstood. | Pickup language is classified as delivery damage. |
| `CLARIFICATION_FAILURE` | A required clarification is missed, unnecessary, incorrectly worded, or offers unsafe choices. | Generic signature wording selects ISR without asking type. |
| `DECISION_LOGIC_FAILURE` | Correct knowledge is found but the wrong condition or branch is applied. | Third-attempt context follows the first-attempt branch. |
| `CONTEXT_FAILURE` | Follow-up context is lost, contaminated, or carried into a new topic. | “Actually, third attempt” is treated as a new unrelated query. |
| `GENERATION_FAILURE` | Presentation adds, removes, distorts, or contradicts selected canonical knowledge. | Concise answer omits a required scan or invents a code. |
| `STATUS_FAILURE` | Noneligible or publication-withheld knowledge produces a definitive answer. | `POTENTIALLY_OUTDATED` record returns `ANSWER`. |
| `SOURCE_PRECEDENCE_FAILURE` | Raw, older, conflicting, superseded, or newly ingested material overrides active approved knowledge without governance. | A raw source silently replaces a `READY_ROUTE_APPROVED` answer. |
| `SPEECH_RECOGNITION_FAILURE` | Transcription materially changes operational meaning without safe confirmation. | ASR becomes ISR and selects a different procedure. |
| `AUTHENTICATION_FAILURE` | Login, invitation, reset, recovery, sharing, deactivation, or session control is bypassed or incorrect. | Old device remains authorized after replacement. |
| `BILLING_FAILURE` | Seat/month accrual, activation state, idempotency, payment, or cancellation behavior is wrong. | Same driver receives two $5 liabilities in one month. |
| `SECURITY_FAILURE` | Security or canonical boundary is bypassed, data or secrets leak, or abusive input succeeds. | Cross-company access or prompt-driven source disclosure. |
| `PERFORMANCE_FAILURE` | Latency, reliability, or resource behavior materially harms correct use. | Timeout presents a partial answer as verified. |
| `UX_FAILURE` | Correct result is presented in a confusing, inaccessible, or error-prone manner. | Critical action is hidden below optional background. |
| `LOGGING_OR_TRACEABILITY_FAILURE` | The system cannot reconstruct why the response was given or logs sensitive data. | Missing record version/source trace or raw token in logs. |

## Severity

- `CRITICAL`: meets the Phase 3 critical-failure standard; blocks pilot.
- `HIGH`: likely wrong operational action, material security/privacy/billing harm, or frequent inability to use the product; blocks pilot until resolved or explicitly converted to a safe fail-closed path.
- `MEDIUM`: bounded correctness, reliability, or usability defect with a safe fallback.
- `LOW`: nonmaterial friction, observability improvement, or test-harness cleanup.

