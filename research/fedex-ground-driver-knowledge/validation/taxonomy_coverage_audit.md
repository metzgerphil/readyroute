# Taxonomy coverage audit

Status date: 2026-08-09

Purpose: verify that the evidence-discovered taxonomy is actually used by the structured knowledge layer, that record paths follow declared parent-child relationships, and that source-referenced categories without acquired procedures remain explicit gaps rather than empty unexplained nodes.

## Coverage result

- 57 taxonomy nodes organize 138 records through 244 record paths.
- Every record has at least one taxonomy path.
- Every path begins at a declared root node.
- Every adjacent path segment follows a declared parent-child relationship.
- 56 nodes are used by at least one current record.
- One node, `TAX-RELAY`, is an intentional `SOURCE_REFERENCED_NOT_ACQUIRED` coverage exception. OP-117 references relay check-out/check-in instructions, but the actual relay procedure is absent from the supplied corpus.
- No taxonomy relationship references a missing node.
- Labels and aliases have no exact cross-node duplicates.
- A separate 57-row readiness projection now preserves status, evidence-capture, missing-source, and authenticated-acquisition limits for every node; see `taxonomy_readiness_audit.md`.

## Repairs made

Four specific nodes had been added when their source material was discovered but were never attached to the corresponding records:

- Heat illness now uses `TAX-INCIDENT/TAX-HEAT-SAFETY`.
- Dry-ice exposure now uses `TAX-DOT/TAX-HAZMAT/TAX-DRY-ICE` plus its incident-response classification.
- Authenticated Delivery now uses `TAX-DELIVERY/TAX-AUTHENTICATED-DELIVERY` instead of being flattened under signature service.
- Coupling now uses both the Linehaul/Coupling and DOT/Vehicle Safety/Coupling parent paths.

Four additional records contained hierarchy defects:

- Vehicle Change skipped its EOD parent under FORGE.
- Locker Failure skipped its Release parent under Delivery.
- Rental Vehicle Preparation incorrectly used Vehicle Change instead of the Rental Vehicle node for its FORGE path.
- Pickup Vehicle Capacity started directly at the non-root CXPC node instead of Pickup/CXPC.

These were classification repairs only; no operational rule, evidence, or knowledge status changed.

## Regression controls

The corpus validator now rejects:

- Empty record taxonomy paths.
- Paths beginning at a non-root node.
- Path edges that skip or contradict declared parents.
- Taxonomy nodes with no record usage unless accompanied by a sourced coverage exception.
- Coverage exceptions whose source IDs are missing or whose node has since gained record coverage.

This audit proves internal taxonomy coverage for the current extracted layer. New source review may add categories or resolve the relay exception, and either change must update the taxonomy and affected record paths together.

It does not assert that every populated branch is approved guidance. Ten populated nodes have no verified record and twenty-six contain mixed statuses; no verified-only branch currently retains a capture gap. Those branch-level limits are validator-enforced in `knowledge/taxonomy_readiness_coverage.csv`.
