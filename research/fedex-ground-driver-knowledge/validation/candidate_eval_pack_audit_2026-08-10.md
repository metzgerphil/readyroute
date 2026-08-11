# Candidate driver-bot evaluation pack audit

Status date: 2026-08-10

## Decision

The supplied pack is **valuable as an adversarial language source but unsafe as a gold-answer source in its current form**.

Preserve and use the messy questions after deduplication and canonical mapping. Do not import `index.md`, `expected_first_response`, or `expected_final_behavior` as operational truth. Every accepted case must name the applicable canonical `knowledge_id`, current status, response mode, required clarification, prohibited behavior, source/version trace, and adjudication when applicable.

## Dataset and grain

The intake contains four owner-supplied files, preserved byte-for-byte under `candidate-evaluations/2026-08-10-driver-bot-pack/` with a checksum manifest. The structured JSON grain is one proposed driver prompt/test expectation per row.

| Measure | Result |
| --- | ---: |
| Structured rows | 155 |
| Unique normalized JSON prompts | 130 |
| Duplicate JSON rows/prompts | 25 |
| Duplicate prompt groups | 25 |
| Groups identical except for ID | 21 |
| Messy-question Markdown prompts | 140 unique |
| Union of JSON and Markdown prompts | 145 unique |
| Exact normalized matches to the maintained 192-case suite | 0 |
| Expected responses with canonical ID/status/source/version trace | 0 of 155 |

The JSON is syntactically valid, IDs are unique and contiguous, every row has the same nine fields, and category/priority values are populated. Structural validity does not establish operational correctness.

## Why the questions are useful

- The 145-prompt union adds genuinely different driver phrasing rather than copying the maintained suite verbatim.
- Current retrieval produces a score below 42 for 37 rows and no candidate for four rows: `014 or 019`, `what is 016`, `what is 027`, and `what is prc`. These are high-value independent retrieval tests.
- The prompts cover 11 practical categories, led by delivery/signature (21 rows), status codes (18), FORGE (17), safety (16), FedEx terms (14), pickup (13), and hazmat (13).
- The interaction principles—short answers, smallest material clarification, selectable options, and safety-first framing—generally align with Ready Route's canonical answer contract.

## Findings

### Critical — the candidate hazmat pickup rule conflicts with active approved knowledge

The candidate index says that a dangerous-goods package scanned at pickup must not be picked up and that dangerous goods are not accepted into the service-provider network (`index.md` lines 2253-2257). Active `READY_ROUTE_APPROVED` record `KNO-HAZ-ACCEPTANCE-001` instead establishes a conditional acceptance checklist: accept only when destination, packaging, labels/markings, required OP-900LL/UN packaging, and shipper certification requirements are satisfied; reject when a required condition is missing.

This is not a wording difference. It changes the operational decision. Candidate case 129 and the associated index branch must be rewritten against the approved record before use.

### Critical — source precedence and local-override rules violate knowledge governance

The candidate index says to use the newer source first and that a local manager, station instruction, ISP agreement, or law controls over the file (`index.md` lines 7-9 and 671-674). Date alone is not enough to establish applicability, and an active `READY_ROUTE_APPROVED` adjudication cannot be silently overridden by raw material. Driver-supplied claims about local rules also cannot become authority through the chat interface.

The safe rule is: preserve new evidence, compare applicability and scope, reopen an adjudication when materially challenged, and continue using the active approved determination until its status is explicitly changed.

### High — all expected answers lack record-level traceability

All 155 structured cases omit canonical knowledge IDs, statuses, source IDs, source versions, evidence locators, and adjudication IDs. The top-level source list in `index.md` is not enough to reconstruct why a particular expected answer is correct. This prevents status gating, source precedence, version-aware evaluation, and historical reproducibility.

The supplied `eval_audit_report.md` calls the pack “Strong” and recommends using it as the first structured harness (lines 95-124), but its method checks content presence inside the same candidate index rather than reconciling each expected answer with Ready Route's canonical release. That judgment is not independent validation.

### High — several definitive expectations target pending or outdated knowledge

Diagnostic retrieval points 38 candidate rows first to a non-published record, and another four rows retrieve no record. A retrieval candidate is not a gold mapping, but the pattern exposes where the supplied expectations need manual gating.

Confirmed examples include:

| Candidate topic | Candidate expectation | Canonical boundary |
| --- | --- | --- |
| Stolen loaded vehicle | Law enforcement, then GSOC, then management | `KNO-SEC-STOLEN-VEHICLE-001` is `PENDING_REVIEW`; current sources conflict on GSOC caller/order. |
| OP-201 | Definitive business-release waiver explanation | `KNO-DEL-BUS-OP201-001` is `PENDING_REVIEW`; newer OP-117 no-release and older FORGE release branches conflict. |
| Suspected-fraud call tag | Code 106 path without authority qualification | `KNO-PUP-CALLTAG-FRAUD-001` confirms the stop-wide UI/code effect but not fraud criteria or decision authority. |
| Code 079 | General enroute-transfer usage | `KNO-FORGE-BULK-TRANSFER-001` still requires authority, physical custody, confirmation, and reconciliation. |
| Tobacco commercial exception | Treats approved-commercial branch as selectable | `KNO-DEL-TOBACCO-001` preserves the consumer prohibition but requires current confirmation before assuming a commercial exception. |
| FORGE settings/sync/messages | Current-looking instructions from older guides | Multiple matching records remain `POTENTIALLY_OUTDATED` pending current-version confirmation. |

These prompts can remain tests, but the expected outcome must enforce `ESCALATE` or a narrowly supported immediate safety boundary—not the candidate's definitive procedure.

### Medium — duplication and cross-file drift distort coverage counts

The 155 JSON rows contain 25 repeated normalized prompts. Twenty-one duplicate groups are identical except for ID; four repeated prompts differ in expectations. The Markdown test set contains 140 unique prompts, of which 15 are absent from the JSON; the JSON has five prompts absent from the Markdown. Category counts therefore describe rows, not unique scenarios, and cannot be used as coverage percentages without a documented denominator.

### Medium — the pack exposes real retrieval gaps

Against the current production-gated retrieval stack:

- 79 rows currently request clarification.
- 35 currently answer.
- 41 currently escalate.
- 37 score below the normal answer threshold.
- Four retrieve no candidate.
- Top candidates span 110 `SOURCE_VERIFIED`, 25 `PENDING_REVIEW`, 13 `POTENTIALLY_OUTDATED`, three `READY_ROUTE_APPROVED`, and four with no candidate.

These figures are diagnostic only: the candidate pack lacks human-reviewed canonical mappings, so they do not measure accuracy yet. They identify the best rows to map first.

## Ingestion disposition

| Component | Disposition | Reason |
| --- | --- | --- |
| Messy driver prompts | Accept after deduplication and canonical mapping | Strong language diversity and no exact overlap with maintained cases. |
| Pass/failure criteria | Rewrite and selectively reuse | Useful behavioral structure, but must reflect canonical status and procedure fidelity. |
| Expected follow-up options | Selectively reuse | Options are often driver-friendly but must be generated from material canonical decision variables. |
| `expected_first_response` | Do not import directly | Contains unsupported, conflicting, or version-sensitive operational assertions. |
| `expected_final_behavior` | Do not import directly | Lacks canonical record/status/source trace and sometimes presupposes the unsafe answer. |
| `index.md` | Preserve as candidate research only | Helpful scenario brainstorming; not authoritative knowledge. |
| `eval_audit_report.md` | Preserve as supplier self-assessment only | Not an independent canonical or data-quality audit. |

## Required remediation and automated controls

The intake checkpoint now includes `candidate_canonical_mapping_queue.jsonl`, a deterministic 145-row union. All 113 development prompts are human-reviewed: 23 map to canonical reference evaluations, 69 map to canonical operational evaluations with status-aware expectations, and 21 map to explicit knowledge-gap or insufficient-context evaluations. All 32 independent holdout rows remain `NEEDS_CANONICAL_MAPPING` and untouched. No candidate expectation was accepted as authority.

1. Preserve the 32 untouched holdout prompts until the evaluation design is frozen and the project reaches the authorized holdout-measurement stage.
2. When the holdout is formally activated, map each released prompt to one or more canonical `knowledge_id` values or explicitly mark it out of scope/no eligible knowledge without adding the holdout wording to retrieval surfaces first.
3. Derive expected mode from canonical status and publication readiness: answer/clarify only from eligible published knowledge; otherwise escalate or give only an independently eligible immediate safety boundary.
4. Add `must_clarify`, `must_not_do`, information sufficiency, source/version trace, and adjudication precedence requirements.
5. Rewrite the confirmed conflict cases before any test execution can count as a pass/fail result.
6. Keep an independent holdout subset. Do not add all candidate prompts to the retrieval variant index before measuring whether retrieval generalizes to them.
7. Automate candidate-file checksum verification, schema/ID checks, normalized duplicate checks, canonical foreign-key validation, allowed status/mode combinations, and detection of non-eligible expected answers.

## Caveats

- Current retrieval output is used only to prioritize review. It is not accepted as the human-reviewed gold mapping.
- A low score may expose a real vocabulary gap, a missing knowledge record, or an intentionally broad prompt requiring clarification.
- The pack's source list contains real supplied sources, but record-level provenance was not provided.
- No candidate operational assertion changed canonical knowledge during this audit.

## Evidence

- Raw intake and checksum manifest: `candidate-evaluations/2026-08-10-driver-bot-pack/`
- Deterministic structural/retrieval profile: `candidate-evaluations/2026-08-10-driver-bot-pack/candidate_eval_pack_profile.json`
- Quarantined canonical-mapping queue: `candidate-evaluations/2026-08-10-driver-bot-pack/candidate_canonical_mapping_queue.jsonl`
- Audit generator: `scripts/audit_candidate_eval_pack.js`
- Intake validator: `scripts/validate_candidate_eval_pack.js`
- Canonical release: `knowledge/operations/records.jsonl`
- Maintained evaluation suite: `knowledge/evaluations/driver-language-cases.jsonl`
