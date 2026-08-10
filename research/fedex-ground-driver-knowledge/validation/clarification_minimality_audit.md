# Clarification minimality and sequencing audit

Status date: 2026-08-09

## Purpose

Ready Route must not turn a short on-route question into an unnecessary interview. This audit converts every formal driver-language case into an explicit clarification strategy: answer immediately when the deciding facts are already present, ask only unresolved discriminators, stop once an approved branch is identified, and never delay an immediate safety action while gathering context.

The generated `clarification_strategy_index.jsonl` is a knowledge-validation artifact, not product or chatbot implementation.

## Exact coverage

- 185 strategy rows for 185 driver-language cases.
- Exact one-to-one case order, utterance, record set, sufficiency, response mode, and clarification-list equality.
- 386 ordered clarification facts in total.
- No normalized duplicate clarification inside any case.
- Twenty-one direct-answer cases ask zero questions.
- Every one of the 164 non-direct cases contains at least one clarification fact.

| Clarification facts | Cases |
|---:|---:|
| 0 | 21 |
| 1 | 37 |
| 2 | 47 |
| 3 | 66 |
| 4 | 13 |
| 5 | 1 |

The sole five-fact case is `FORGE-026`. Each fact maps directly to a distinct source-record discriminator: predispatch state, physical package presence, inbound/current assignment, station/work-area authorization, and network retrieval success. Because the underlying record is `HUMAN_REVIEW_REQUIRED`, those facts narrow the supported context but do not convert the Manifest Preview control into operational authorization.

## Strategy distribution

| Strategy | Cases | Required behavior |
|---|---:|---|
| `ANSWER_WITHOUT_CLARIFICATION` | 21 | Give the source-grounded answer without adding a question |
| `ASK_LISTED_DISCRIMINATORS_IN_ORDER` | 81 | Ask only unresolved listed facts and stop when an approved branch is identified |
| `STATE_IMMEDIATE_SAFETY_ACTION_THEN_ASK_LISTED_DISCRIMINATORS` | 13 | State the source-backed safety action first, then ask only unresolved facts |
| `DISCLOSE_CONFLICT_THEN_GATHER_ONLY_ESCALATION_CONTEXT` | 4 | Withhold the disputed step, disclose conflict, and gather only escalation context |
| `STATE_SOURCE_LIMIT_THEN_GATHER_ONLY_REVIEW_CONTEXT` | 41 | State that a complete approved answer is unavailable before gathering review context |
| `STATE_VERSION_LIMIT_THEN_GATHER_ONLY_CONFIRMATION_CONTEXT` | 25 | Expose the version/current-source limit before gathering confirmation context |

## Minimality rule

`ordered_clarifications` is a prioritized candidate list, not an instruction to ask every item unconditionally. The associated `stop_rule` requires the eventual system to stop as soon as the facts already supplied by the utterance and follow-up answers establish the permitted branch, escalation target, or current-source confirmation. Repeating a fact the driver already supplied would violate this contract.

Safety, conflict, source-limit, and version-limit preambles are actions or disclosures, not clarification questions. They must occur before the listed fact-gathering sequence when their response mode requires it.

## Automated controls

`scripts/build_clarification_strategy_index.py` regenerates the index from the formal cases. It rejects duplicate clarification facts, any direct-answer case that asks a question, and any non-direct case with no clarification context.

`scripts/validate_corpus_integrity.py` requires byte-for-structure equality between the generated expectation and the committed 185-row index. Any changed case, ordering, sufficiency, mode, clarification, strategy, or stop rule therefore makes the corpus fail until the index is deliberately regenerated and reviewed.

## Interpretation limit

This proves explicit clarification sequencing and stop behavior for the current cases. It does not implement dialogue state, speech recognition, retrieval, or a production question planner, and it does not prove that yet-unacquired source material will not introduce additional deciding variables.
