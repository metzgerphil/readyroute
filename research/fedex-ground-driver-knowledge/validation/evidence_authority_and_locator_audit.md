# Evidence authority and locator audit

Status date: 2026-08-10

Purpose: test whether structured operational guidance is supported by reviewed, appropriately authoritative sources and whether its evidence can be located again. Passing this audit does not prove that the broader source corpus is complete.

## Results

- 144 knowledge records contain 383 evidence objects representing 226 unique knowledge/source pairs.
- All 383 evidence objects cite fully reviewed sources.
- No knowledge record cites an unreviewed, inaccessible, or `SECONDARY_REFERENCE` source as operational evidence.
- No `VERIFIED` record relies exclusively on potentially relevant, secondary, or time-sensitive evidence.
- Every evidence object has a non-generic locator. Locators identify pages, page ranges, sections, paragraphs, forms, flows, screens, or a complete dated page/article where applicable.

## Completed former partial-source exception

`KNO-INC-ACCIDENT-SCENE-001` remains `VERIFIED`; the complete five-page OP-135 original is now checksum-preserved and fully reviewed. Exact page mappings include the previously unseen lower-page injured-person, roadway/lane/weather/visibility, and reporting-responsibility content. No partially reviewed source remains in active evidence.

## Mapping-locator reconciliation

The source-to-knowledge ledger contains 383 mapping rows for 226 unique knowledge/source pairs. Some pairs deliberately use more than one evidence/mapping row to preserve separate page scopes. Evidence and mapping locators match exactly at `knowledge_id + source_id + locator`; the current Download Pickup List, MGB-119 reconciliation, current FORGE 3.3 FAD/international/pharmacy/EOD/misdelivery scopes, complete OP-135 allocations, and earlier page-specific branches preserve scope without changing unsupported procedures into approved guidance.

The audit repaired one substantive mismatch: `KNO-PUP-PACKAGING-001` now maps OP-117 pages 47-48 **and** 68-69, including the nonconforming-pickup caution and customer-service/recurring-problem escalation. The earlier mapping named only pages 47-48 even though the evidence object and rule relied on both ranges.

## Enforced regression controls

The corpus validator now rejects:

- Evidence from an unreviewed or inaccessible primary source.
- Any `SECONDARY_REFERENCE` used as operational evidence.
- Generic evidence locators such as only “document” or “page.”
- A `VERIFIED` record supported exclusively by weak-relevance evidence.
- A `VERIFIED` record using a partially reviewed source without disclosing that limitation in its source/version, More Info, or review notes.
- Any difference between evidence and mapping triples at the exact knowledge/source/locator grain.
- Any stale or incomplete row in the generated 3,242-claim provenance index, including a claim traceability class or allocation gate inconsistent with its record evidence set.

## Remaining limitation

Every current substantive JSON field/item and procedure step now resolves through `knowledge/claim_provenance.jsonl` and the reviewed allocation ledger to exact supporting evidence fragments. The allocation is complete for the current corpus, while stable first-class evidence-fragment IDs remain a future normalized-schema recommendation. New extraction batches must regenerate and pass both provenance and allocation audits.
