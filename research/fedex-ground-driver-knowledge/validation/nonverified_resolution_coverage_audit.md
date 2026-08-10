# Non-verified record resolution coverage audit

Status date: 2026-08-09

## Purpose

A `CONFLICT`, `HUMAN_REVIEW_REQUIRED`, or `POTENTIALLY_OUTDATED` label safely gates publication, but it does not by itself explain how the record can become publishable. This audit gives every current exception record a concrete source, decision, version, artifact, legal/compliance, or effective-date resolution path.

## Exact coverage

`knowledge/nonverified_resolution_coverage.csv` contains exactly 55 rows:

- 2 `CONFLICT` records.
- 32 `HUMAN_REVIEW_REQUIRED` records.
- 21 `POTENTIALLY_OUTDATED` records.

Every row preserves the primary resolution type, structured source-gap IDs where available, authenticated acquisition-queue resource IDs, exact evidence or decision required, responsible human authority class, and status-consistent publication gate.

## Resolution types

| Resolution type | Records |
|---|---:|
| `CURRENT_VERSION_CONFIRMATION` | 19 |
| `POLICY_AUTHORITY_CONFIRMATION` | 9 |
| `CONTROLLING_SOURCE_ACQUISITION` | 9 |
| `LEGAL_COMPLIANCE_REVIEW` | 7 |
| `CURRENT_PROCEDURE_AND_AUTHORITY` | 6 |
| `SOURCE_CONFLICT_ADJUDICATION` | 2 |
| `FORM_ARTIFACT_ACQUISITION` | 2 |
| `EFFECTIVE_DATE_RECHECK` | 1 |

## Dependency result

- 46 records link to one or more structured `REFSRC-*` obligations.
- 49 records link to one or more resources in the authenticated MyGroundBiz acquisition queue.
- Many records link to both because acquiring a page/document is not the same as receiving the required policy-owner decision.
- `KNO-DEL-FAD-GROUND-001` is the sole record without a source/queue dependency: its supplied source is a current future-effective announcement, so resolution is an explicit Ground effective-date and production-instruction recheck.

## Publication gates

- Conflict and human-review records remain `WITHHOLD_UNTIL_RESOLVED`.
- Potentially outdated records remain `QUALIFY_UNTIL_CURRENT_VERSION_CONFIRMED`.
- Both conflict records require `SOURCE_CONFLICT_ADJUDICATION`; acquiring another uncontrolled source cannot silently choose a branch.

The responsible authority classes identify the kind of owner needed—such as FedEx Security, P&D Operations, Hazardous Materials, DOT/HOS Compliance, qualification certification, healthcare product, FORGE product, or vehicle compliance. They are role classifications, not invented individual names or claims about organizational ownership.

## Notable improvements

The ledger consolidates previously scattered resolution needs for:

- tobacco/e-cigarette commercial exception scope;
- roadside-inspection reporting;
- rental ELD and vehicle preparation;
- annual and California 90-day inspection consequences;
- call-tag fraud authority and pickup packaging acceptance;
- pharmacy and critical-healthcare service requirements;
- address edit, unmanifested delivery, bulk transfer, EOD, and login warnings;
- hand-sheet/“Blue Sheet” identity and fields; and
- all current-version-sensitive FORGE records.

No missing procedure is filled from a title, UI capability, or general knowledge. The resolution requirement records what evidence or decision is absent.

## Bidirectional dependency reconciliation

The first resolution-ledger pass exposed 36 asymmetric links: a record named a source gap, but the gap's `affected_targets` field did not name that record. Most were version-sensitive or human-review FORGE records pointing to `REFSRC-022`; additional mismatches involved current CDL/HOS material, qualification documentation, and OP-207/OP-207Res hand-sheet sources.

The affected-target lists were repaired. Dependencies are now symmetric in both directions:

- every backlog ID named by a non-verified resolution row lists that record as an affected target; and
- every non-verified knowledge target named by a backlog row links back to that backlog in its resolution row.

This means acquiring a source can deterministically identify every exception record requiring reconsideration, and a record reviewer can retrieve every missing-source obligation that blocks it.

The authenticated acquisition queue now materializes the reverse resolution relationship in its `affected_nonverified_knowledge_ids` field. Sixteen resources carry 72 exact resource-to-record links covering the 49 queue-linked records; validator equality prevents either side from becoming stale.

## Automated control

`scripts/validate_corpus_integrity.py` derives the expected row set from every non-verified record. It rejects missing/extra/stale rows, mismatched statuses, unknown backlog or acquisition IDs, asymmetric record/backlog dependencies, invalid resolution types, missing evidence/owner descriptions, status-inconsistent publication gates, conflicts without adjudication, and any non-effective-date row lacking a source or queue dependency.

## Limitation

This proves resolution-path accountability, not resolution. Records retain their current knowledge status until the specified authoritative evidence, current version, or human adjudication is actually obtained, reviewed, and incorporated.
