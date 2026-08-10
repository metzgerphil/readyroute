# Non-verified answer publication-safety audit

Audit date: 2026-08-09

## Purpose

Driver-facing text must not sound like an approved complete procedure when the underlying knowledge status is `HUMAN_REVIEW_REQUIRED`, `UNRESOLVED`, `CONFLICT`, or `POTENTIALLY_OUTDATED`. This audit evaluates the presentation layer separately from the preserved source-truth fields.

## Scope

- 55 non-verified operational records
- 32 `HUMAN_REVIEW_REQUIRED`
- 21 `POTENTIALLY_OUTDATED`
- 2 `CONFLICT`
- 0 literal `UNRESOLVED`

## Publication-safety contract

- `HUMAN_REVIEW_REQUIRED` and `UNRESOLVED`: the concise answer must begin by stating that the supplied sources do not establish the complete approved procedure. Source-established immediate safety or preservation steps may follow, but the missing authority cannot be hidden in metadata or More Info.
- `CONFLICT`: the concise answer must explicitly disclose the source conflict and preserve escalation; it must not silently choose the disputed branch.
- `POTENTIALLY_OUTDATED`: the concise answer must expose its version/currency limitation and tell the driver how to verify or escalate current behavior.
- Every non-verified record must contain an escalation requirement.

The contract is now enforced by `scripts/validate_corpus_integrity.py`.

## Findings and corrections

| Finding | Evidence | Risk | Severity | Confidence | Correction |
|---|---|---|---|---|---|
| Human-review limits were not uniformly visible at the start of concise answers | Several of the original 27 records began with source-backed steps and placed incompleteness only later in the answer or More Info | A detached answer could be mistaken for a complete approved procedure | High | High | All 32 current human-review answers, including the later refusal, hand-sheet, login/dispatch, unmanifested-delivery, and Alternate Signature records, begin with the same explicit complete-procedure source-limit sentence |
| Manifest Preview permission behavior lacked a concise version qualifier | `KNO-FORGE-MANIFEST-PERMISSIONS-001` described 4.5.0 behavior but exposed version sensitivity only in More Info | Old managed-device/UI behavior could appear current | Medium | High | Concise answer now identifies Manifest Preview 4.5.0 and requires confirmation against the current app and managed-device policy |
| Conflict answers safely preserve dispute visibility | 2/2 concise answers explicitly state that current FedEx sources/guides conflict and direct escalation | No current silent conflict resolution | High if violated; no current violation | High | Validator rejects conflict answers that fail to say the sources conflict |
| Remaining potentially-outdated answers expose currency limits | 21/21 contain a version, older-source, current-source, recheck, or time-sensitive qualifier plus a current-verification/escalation action | No current detached-version failure after correction | High if violated; no current violation | High | Validator enforces qualifier and verification-action presence |
| Escalation coverage is complete | 55/55 non-verified records have one or more escalation requirements | No current unsupported terminal answer | High if violated; no current violation | High | Validator rejects missing escalation lists |

## Interpretation

The standardized warning does not erase source-established immediate actions. For example, safety preservation, stopping work, avoiding release, or contacting emergency services may still be stated where authoritative evidence supports them. The warning means only that the corpus cannot establish the complete approved procedure without the identified current source, conflict resolution, or human decision.

## Result

All 55 current non-verified records satisfy the publication-safety contract. This is a presentation-layer control, not a resolution of the underlying 2 conflicts, 32 human-review items, 21 potentially outdated items, or missing source obligations.

Each of these 55 records now also has a distinct resolution row in `knowledge/nonverified_resolution_coverage.csv`. Publication safety and resolution planning remain separate controls: the former prevents an unsafe answer now, while the latter states what evidence or decision is required to reconsider the status.
