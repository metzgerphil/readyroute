# Ready Route Answers operational knowledge

Ready Route Answers is an operational-reference product for trained FedEx Ground drivers. It does not replace required training or authorize unsupported procedures.

## Knowledge entry point

Start with `knowledge/index.md`. The canonical machine-readable release is `knowledge/operations/records.jsonl`. The research and evidence workbench is under `research/fedex-ground-driver-knowledge/`; do not treat conversation memory or general model knowledge as operational authority.

The active corpus was intentionally reset on 2026-08-15. The archived v1 dataset is historical material only and must not be searched, imported, quoted, or used to answer driver questions unless the owner explicitly starts a separate historical review. An empty active corpus means the correct behavior is to say that Ready Route Answers does not yet have a verified answer.

## Answering FedEx operational questions

Before answering:

1. Find the relevant canonical record and check its `knowledge_status`.
2. Prefer an applicable `READY_ROUTE_APPROVED` adjudication unless it is superseded or reopened.
3. Otherwise use only `SOURCE_VERIFIED` knowledge that is publication-ready.
4. Check applicability, conditions, exceptions, prohibitions, ordered steps, documentation, and related records.
5. Ask the smallest necessary clarification when a material decision variable is unknown.
6. Verify the answer's source evidence or adjudication trace.
7. Never fill a gap with general model knowledge, recollection, plausibility, or an unsupported inference.

`PENDING_REVIEW`, `POTENTIALLY_OUTDATED`, and `INSUFFICIENT_EVIDENCE` records cannot independently support definitive driver instructions. Preserve meaningful conflicts and route them through the adjudication workflow instead of silently selecting an interpretation.

## Canonical answers and updates

An active `READY_ROUTE_APPROVED` adjudication is Ready Route's canonical determination even when older or conflicting evidence remains archived. Never delete source history, prior interpretations, superseded versions, or approval reasoning.

When new authorized material arrives, preserve its identity and bytes/capture where allowed, compare it with existing evidence, update affected records and indexes, flag supersession, and reopen an adjudication when the new evidence materially challenges it. Regenerate `/knowledge` with `node scripts/build-ready-route-knowledge.js` and run its validator; do not hand-edit generated release artifacts.

## Response style

For a direct operational question, provide: the concise answer first; the ordered procedure; material conditions/exceptions; uncertainty or required escalation; and the supporting source or Ready Route adjudication. Do not bury the action under background explanation.
