# Record relationship graph audit

Status date: 2026-08-09

Purpose: verify that related procedures can be discovered from any relevant starting record without falsely treating every relationship as reciprocal or semantically equivalent.

## Relationship semantics

`related_knowledge_ids` is a directed context-expansion list: when a record is retrieved, these IDs identify companion rules or branches that may matter. Reciprocity is not required. For example, a specialized pharmacy record may point to ASR/DSR requirements, while the general signature record does not need to enumerate every specialized package type.

The field is not a synonym list, precedence graph, or authorization to merge answers. Status, conditions, evidence, and decision logic remain controlling.

## Graph result

- 138 records contain 307 directed related-record links.
- Every target ID exists.
- No record links to itself or repeats the same target.
- The undirected view contains one 125-record operational component, one six-record component, one four-record component, and three justified singletons.
- Five formerly isolated records received source-supported context links: OP-206 alternate signature capture, roadside inspection reports, business-closure messaging, pickup scanner failure, and pickup vehicle-capacity risk.

## Intentionally standalone records

Three records remain isolated and are justified one-for-one in `knowledge/standalone_record_justifications.csv`:

- `KNO-COMMS-MEDIA-001` — narrow recording/media/brand policy.
- `KNO-DEL-FAD-GROUND-001` — self-contained conditional FAD workflow whose package-identification and validation branches are fully expressed in the record.
- `KNO-DEL-TOBACCO-001` — self-contained prohibition with an unresolved commercial branch.

The later display/navigation-settings record now links the formerly isolated device-road record, so its earlier standalone justification was removed as stale. Every record added by the FORGE and complete Drive-PDF page passes has at least one evidence-supported companion link.

## Regression controls

The corpus validator now rejects missing targets, duplicate/self-links, an unexplained isolated record, or a stale standalone justification after a record becomes connected. New records must therefore either join the evidence-supported context graph or explicitly document why linking would overstate the source corpus.

This audit validates relationship accountability, not retrieval runtime behavior. The future retrieval layer must still follow directed links selectively and preserve each target's independent status and conditions.
