# Phase 3 knowledge update and versioning report

Run date: 2026-08-10.

## Verified behavior

- Production retrieval selects one effective version per `knowledge_id`.
- An active published `READY_ROUTE_APPROVED` determination takes precedence over a newer raw `SOURCE_VERIFIED` row.
- A newer explicit `PENDING_REVIEW`, `POTENTIALLY_OUTDATED`, or `INSUFFICIENT_EVIDENCE` version reopens the record and blocks the older approved answer.
- Historical versions, source IDs, and adjudication IDs remain in the canonical archive and answer trace.
- All 97 publication-ready records have complete identity, version, status, source, and schema trace; all 7 active approved records have adjudication trace.
- All 21 direct-answer evaluations return canonical concise and More Info text exactly; no general-model material is introduced.

The precedence defect discovered by the first Phase 3 red-team run was critical and is fixed with unit and synthetic regression tests.

## Still required

Run an end-to-end governed ingestion rehearsal using nonproduction fixtures for: a new procedure, clarification, ordinary verified supersession, conflict with verified knowledge, conflict with an active approval, and a one-branch change. The rehearsal must confirm regenerated release artifacts, evaluation impact reporting, production import behavior, historical interaction reconstruction, and no silent approval override.

No live canonical determination was changed merely to simulate this test.

## Current disposition

Runtime precedence and traceability pass. The full source-ingestion-to-production update rehearsal remains a pre-pilot gate.
