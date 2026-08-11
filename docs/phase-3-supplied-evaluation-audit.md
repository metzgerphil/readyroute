# Phase 3 supplied evaluation audit

Audit date: 2026-08-10.

## Inputs and authority boundary

The owner supplied `driver_bot_eval_pack.json`, `messy_question_test_set.md`, `eval_audit_report.md`, and a companion index. They are useful independent language and product-behavior inputs, but they are not FedEx operational authority. Expected records, modes, and answer boundaries were therefore derived from the canonical Ready Route release rather than copied from the supplied expected-answer text.

This distinction is material. For example, the supplied pack proposes definitive suspected-fraud call-tag code behavior, while current Ready Route knowledge keeps that workflow `PENDING_REVIEW` and the canonical reference suite identifies `106` as absent from the current reference dataset. Production must continue to escalate that question.

## Coverage audit

- Supplied structured cases: 155.
- Exact prompt rows already represented by maintained, candidate, gap, or independent suites: 101.
- Novel prompt rows: 54, representing 49 unique prompts.
- Novel rows by major lane: 18 status-code, 6 delivery/signature, 6 customer communication, 5 pickup, 4 safety, 4 not-sure, 3 FORGE, 3 security, 2 hazmat, 2 FedEx-term, and 1 call-tag.
- The status-code prompts remain routed through the canonical reference-language suite because a reference definition does not independently establish a complete operational workflow.

## New independent set

`backend/src/scripts/phase3ConfusingNeighborCases.jsonl` adds 60 independently worded cases. It deliberately contrasts nearby procedures and status boundaries rather than copying canonical variants.

The new set targets 62 distinct records: 50 publication-ready records and 12 noneligible records that must fail closed. Combined with the maintained and existing independent suites, all 97 publication-ready canonical records are represented by at least one expected-record evaluation.

The first run produced 23 failures: 18 retrieval, four classification, and one clarification failure. Failures included a context-free nobody-home question receiving an alcohol answer, a DSR-neighbor question selecting ISR, a rental-preparation question selecting an unrelated eligible alternative-vehicle record, and multiple specialized pickup, hazmat, security, accident, HOS, HAL, and FORGE questions losing to generic neighbors.

After root-layer remediation, the complete Phase 3 automated lane passes 1,244/1,244 with zero unsafe-answer failures. The maintained 192-case suite, 12-case Phase 2 holdout, and 69-case candidate suite also remain fully green.

## Product gap exposed by the supplied pack — resolved locally

Canonical delivery-status and pickup-reason definitions under `knowledge/reference` now enter Driver Help through a dedicated reference decision path. The importer indexes all 57 definitions while publishing only the 49 `VERIFIED` definitions; six `HUMAN_REVIEW_REQUIRED` pickup reasons, delivery status 362, and potentially outdated delivery status 030 remain withheld. The operational retriever never receives reference rows.

Reference answers preserve the delivery-status versus pickup-reason namespace, canonical status, version, source identity, and evidence link. Every answer explicitly states that a definition does not authorize selecting a code or establish the complete workflow. Namespace collisions require clarification, unknown codes and noneligible definitions escalate, and all 23 canonical reference-language cases pass their required runtime disposition.

The resulting dry import contains 201 indexed rows: 144 operational records and 57 reference definitions. Of the 146 published rows, 97 are operational records and 49 are verified reference definitions. This change does not admit expected-answer text from the supplied pack as operational authority.
