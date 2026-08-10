# Ready Route operational knowledge system

## Purpose

This directory is the durable release layer for Ready Route's FedEx Ground operational knowledge. It separates preserved source evidence, normalized operational knowledge, human adjudications, driver presentation, and derived retrieval/evaluation artifacts.

The extraction and evidence workbench remains in [`research/fedex-ground-driver-knowledge`](../research/fedex-ground-driver-knowledge/README.md). Files marked as generated in this directory are rebuilt from that workbench and must not be edited directly.

## Knowledge statuses

- `SOURCE_VERIFIED` — the authorized source corpus clearly establishes the procedure without a material unresolved conflict.
- `READY_ROUTE_APPROVED` — Ready Route has explicitly adjudicated and approved the canonical determination. An active approval takes precedence over older competing interpretations.
- `PENDING_REVIEW` — conflict, ambiguity, or required expert judgment remains.
- `POTENTIALLY_OUTDATED` — the information may have been superseded or is version-sensitive.
- `INSUFFICIENT_EVIDENCE` — the authorized corpus does not establish a complete procedure.

Only `SOURCE_VERIFIED` and `READY_ROUTE_APPROVED` records are status-eligible for definitive answers. Publication readiness is tracked separately so missing durable capture or incomplete claim-to-evidence allocation remains visible rather than changing source truth.

## Canonical machine-readable knowledge

- [`operations/records.jsonl`](operations/records.jsonl) — every canonical operational record, including complete rules, applicability, conditions, ordered procedures, documentation, prohibitions, escalation, clarification requirements, presentation, evidence, status, and publication gates.
- [`operations/publication-ready.jsonl`](operations/publication-ready.jsonl) — the subset that passes both status and evidence/publication gates.
- [`operations/status-summary.json`](operations/status-summary.json) — release counts and gate summary.
- [`operations/publication-gaps.jsonl`](operations/publication-gaps.jsonl) — source-verified records still blocked by capture or exact claim allocation, with remediation requirements.
- [`manifest.json`](manifest.json) — release provenance, checksums, counts, and schema version.

The generated release does not replace the authoring record. Canonical source-authored records remain at [`records.jsonl`](../research/fedex-ground-driver-knowledge/knowledge/records.jsonl), with claim provenance at [`claim_provenance.jsonl`](../research/fedex-ground-driver-knowledge/knowledge/claim_provenance.jsonl).

Reviewed source-alignment corrections are preserved in [`history/change-log.jsonl`](history/change-log.jsonl) with immutable before/after records, reasons, supporting source IDs, and checksums. This history explains changes to normalized canonical knowledge without rewriting or deleting the underlying source evidence.

## Source registry and evidence

- [`sources/registry.jsonl`](sources/registry.jsonl) — stable source identities, locations, dates/versions, access/review state, supersession, capture references, and interpretation limits.
- [`sources/README.md`](sources/README.md) — source-layer rules.
- [Source inventory](../research/fedex-ground-driver-knowledge/inventory/source_inventory.csv), [capture coverage](../research/fedex-ground-driver-knowledge/inventory/source_capture_coverage.csv), and [source-to-knowledge mapping](../research/fedex-ground-driver-knowledge/knowledge/source_to_knowledge.csv) remain the detailed evidence ledgers.

## Adjudicated knowledge

- [`adjudications/README.md`](adjudications/README.md) defines the approval and reopening workflow.
- [`adjudications/records.json`](adjudications/records.json) is the controlled human-decision input.
- [`schema/adjudication.schema.json`](schema/adjudication.schema.json) defines the required record.

An active adjudication creates `READY_ROUTE_APPROVED` canonical knowledge during release generation. It never deletes the original source state, competing interpretations, or superseded evidence.

## Operational taxonomy

The taxonomy is corpus-discovered rather than predetermined. Its generated release snapshot is [`reference/taxonomy.json`](reference/taxonomy.json); the maintained authoring taxonomy and readiness audit remain in the [research knowledge directory](../research/fedex-ground-driver-knowledge/knowledge/taxonomy.json).

Current major branches include delivery, pickup, signatures/releases, FORGE operation, documentation/forms, package handling, hazmat, safety, security, incidents, vehicles, DOT/HOS, qualifications, linehaul, customer contact, and reference-code namespaces. The taxonomy must expand when the corpus reveals new operational areas.

## Decision logic and procedures

- [`decision-rules/index.md`](decision-rules/index.md) routes to decision variables, conditional branches, and cross-record logic.
- [`procedures/index.md`](procedures/index.md) explains complete ordered-procedure storage.
- Each machine record keeps `required_procedure` intact and links related knowledge IDs; retrieval must not flatten materially different branches.

## Forms and documentation

[`forms/index.md`](forms/index.md) routes to the form/artifact ledger, including door tags, SRA materials, call tags, hand sheets/“Blue Sheets,” labels, manifests, and other discovered artifacts. Driver shorthand never proves an artifact's official identity or current revision.

## Review and withholding queues

- [`pending-review/index.md`](pending-review/index.md) and [`pending-review/records.jsonl`](pending-review/records.jsonl)
- [`outdated/index.md`](outdated/index.md) and [`outdated/records.jsonl`](outdated/records.jsonl)
- [`insufficient-evidence/index.md`](insufficient-evidence/index.md) and [`insufficient-evidence/records.jsonl`](insufficient-evidence/records.jsonl)

These records remain searchable for review and clarification but cannot independently produce definitive driver instructions.

## Source coverage

Use the [source coverage report](../research/fedex-ground-driver-knowledge/reports/source_coverage.md), [access ledger](../research/fedex-ground-driver-knowledge/inventory/access_ledger.md), and [goal completion matrix](../research/fedex-ground-driver-knowledge/reports/goal_completion_matrix.md). They explicitly distinguish reviewed, partially reviewed, unreviewed, inaccessible, and missing referenced sources.

## Evaluations

[`evaluations/README.md`](evaluations/README.md) describes the generated driver-language suite. The current release includes clear, shorthand, misspelled, incomplete, ambiguous, multi-procedure, conflict, version-sensitive, and safety cases. Retrieval may locate candidates, but status and evidence gates always run before answer presentation.

## Updating the release

1. Update source inventory/evidence and authoring records in the research workbench.
2. Add or revise an adjudication only after explicit human determination.
3. Run `node scripts/build-ready-route-knowledge.js`.
4. Run `node scripts/validate-ready-route-knowledge.js` plus the research corpus validators.
5. Review the manifest and status changes before publication.

Current scope, blockers, and completion limits are summarized in [`release-status.md`](release-status.md).
