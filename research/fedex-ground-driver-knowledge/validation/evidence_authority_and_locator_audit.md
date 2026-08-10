# Evidence authority and locator audit

Status date: 2026-08-09

Purpose: test whether structured operational guidance is supported by reviewed, appropriately authoritative sources and whether its evidence can be located again. Passing this audit does not prove that the broader source corpus is complete.

## Results

- 138 knowledge records contain 342 evidence objects representing 217 unique knowledge/source pairs.
- 337 evidence objects cite fully reviewed sources.
- Five evidence objects cite one partially reviewed source: the exact upper visible regions of OP-135 pages 1-5 in `KNO-INC-ACCIDENT-SCENE-001`.
- No knowledge record cites an unreviewed, inaccessible, or `SECONDARY_REFERENCE` source as operational evidence.
- No `VERIFIED` record relies exclusively on potentially relevant, secondary, or time-sensitive evidence.
- Every evidence object has a non-generic locator. Locators identify pages, page ranges, sections, paragraphs, forms, flows, screens, or a complete dated page/article where applicable.

## Scoped partial-source exception

`KNO-INC-ACCIDENT-SCENE-001` remains `VERIFIED` because its immediate accident-scene procedure is established by fully reviewed OP-130 and corroborating portal evidence. The OP-135 contribution is restricted to the exact visible fields in five hashed upper-page renders: driver/ID, accident date/time, vehicle identifiers, VEDR custody, location/classification, involved-vehicle/driver/passenger information, witnesses, police-investigation details, visible site conditions, non-vehicle property damage, and accident-description/diagram space. The record's documentation, More Info answer, source-version field, and review notes disclose that cropped lower regions of pages 2-5 remain unreviewed. No unseen field or instruction is inferred.

## Mapping-locator reconciliation

The source-to-knowledge ledger contains 342 mapping rows for 217 unique knowledge/source pairs. Some pairs deliberately use more than one evidence/mapping row to preserve separate page scopes. Evidence and mapping locators match exactly at `knowledge_id + source_id + locator`; the MGB-119 premium/time-definite/security reconciliation, no-safe-place/indirect-neighbor, placement-hazard, locker-failure, unlisted-pickup, route-security, shipper-authorized-release, security-incident-reporting, manual-barcode, camera-scan, Business Closure, Delete Scan, combo-stop, call-tag-scope, delivery-classification, non-HAL-transfer, designated-HAL-delivery, appearance/badge, hazmat-signature, dog-encounter, and OP-135 upper-region allocations, locker/residential/business/attempt-photo reconciliation, ISR/ASR/door-tag page-specific branch allocation, and earlier combined/split locator repairs preserve scope without changing unsupported procedures into approved guidance.

The audit repaired one substantive mismatch: `KNO-PUP-PACKAGING-001` now maps OP-117 pages 47-48 **and** 68-69, including the nonconforming-pickup caution and customer-service/recurring-problem escalation. The earlier mapping named only pages 47-48 even though the evidence object and rule relied on both ranges.

## Enforced regression controls

The corpus validator now rejects:

- Evidence from an unreviewed or inaccessible primary source.
- Any `SECONDARY_REFERENCE` used as operational evidence.
- Generic evidence locators such as only “document” or “page.”
- A `VERIFIED` record supported exclusively by weak-relevance evidence.
- A `VERIFIED` record using a partially reviewed source without disclosing that limitation in its source/version, More Info, or review notes.
- Any difference between evidence and mapping triples at the exact knowledge/source/locator grain.
- Any stale or incomplete row in the generated 3,158-claim provenance index, including a claim traceability class or allocation gate inconsistent with its record evidence set.

## Remaining limitation

Every current substantive JSON field/item and procedure step now resolves through `knowledge/claim_provenance.jsonl` to the record's exact evidence set and each evidence fragment's narrower supported scope. The current generated index does not assert that every cited source independently supports every word of a multi-source synthesis; stable fragment-to-field allocation remains a future normalized-schema requirement. New extraction batches must regenerate and pass the claim-provenance audit.
