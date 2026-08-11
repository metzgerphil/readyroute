# Source-to-knowledge coverage reconciliation audit

Status date: 2026-08-10

## Purpose

Source review status and knowledge extraction are different claims. A source can be fully reviewed yet intentionally unmapped because it is a container, secondary reference, or landing page; it can also be fully reviewed with zero mappings because durable extraction evidence is too weak and authenticated reinspection is required.

`inventory/source_knowledge_coverage.csv` now gives every primary inventory source an explicit, machine-checkable extraction disposition.

## Current reconciliation

All 121 primary source rows are represented exactly once.

- 40 fully reviewed sources contribute operational evidence mappings through `MAPPED_OPERATIONAL_EVIDENCE`.
- 81 sources currently have zero mappings, exactly classified by the generated ledger:
  - 31 are `NOT_YET_REVIEWED`; six have durable video bytes but still lack complete review.
  - 7 are `INACCESSIBLE` broken MyGroundBiz resources.
  - 2 reviewed Drive containers delegate substantive evidence to reviewed child files; the connector container's 35 children reconcile to 31 registered archive hashes.
  - 1 reviewed scenario workbook is a `SECONDARY_REFERENCE_NO_AUTHORITY`.
  - 1 partially reviewed MyGroundBiz navigation container remains open.
  - 6 fully reviewed landing pages and 5 fully reviewed indexes have substantive child sources pending.
  - 10 fully reviewed context-only sources contain no distinct active driver procedure, split between general and contractor/management context.
  - 1 fully reviewed Customer Alerts page delegates evidence to its dedicated 138-segment layer, and 1 reviewed redirect delegates to that target.
  - 3 partially reviewed documents require remaining-page review.
  - 8 exact duplicate candidates, 1 render-identical copy, 2 historical sources, 1 corroborative source, and 1 version-sensitive source retain evidence history while deferring active operational mappings to the applicable reviewed source or current-version gate.

The ledger reconciles exactly to all 383 source-to-knowledge mapping rows. No unreviewed, inaccessible, container-only, or secondary source is silently counted as mapped operational authority.

## Zero-mapping sources that require continued follow-up

The earlier sparse-source pass flagged `SRC-MGB-PAGE-0008` and `SRC-MGB-PAGE-0015` for renewed scrutiny. Their complete durable captures have now been reinspected:

- `SRC-MGB-PAGE-0008` is a fully reviewed pickup-resource index. Its 17 child resources remain independently queued; six videos are durably captured but unreviewed.
- `SRC-MGB-PAGE-0015` is a high-level Unsafe Driving context page. It supplies no distinct driver procedure beyond the broader current CSA/DOT material, so zero mappings is the correct disposition.

The current sample ISP Agreement and two FORGE comparison sources remain partial and unmapped. Equipment Terms, Vehicle Appearance, SRS/SRI, Dog Bite Prevention, OP-135, and FORGE 3.3 are fully reviewed from checksum-preserved originals; mapped records use exact locators, and no partially reviewed source contributes evidence.

## Image-only hand-sheet correction

The earlier sparsity review left the two hand-sheet images unmapped. The later form/artifact pass created `KNO-DOC-HANDSHEET-001` and mapped each image only to the identity/version limitation it actually establishes. This is not promotion of the pictured entries into an approved procedure. Current OP-207/OP-207Res and station instructions remain missing.

## Regression controls

`scripts/build_source_knowledge_coverage.py` deterministically joins the source inventory with the exact source-to-knowledge ledger. Corpus validation rejects:

- a missing, extra, duplicated, reordered, or stale source-coverage row;
- inventory title/review/relevance drift;
- mapping-row or unique-knowledge count drift;
- a mapped knowledge-ID set that differs from the source-to-knowledge ledger;
- a mapped disposition on a zero-mapping source or vice versa;
- a full-evidence disposition for a source not fully reviewed;
- a partial-scope disposition for a source not partially reviewed;
- an inaccessible/not-reviewed disposition inconsistent with inventory state; or
- a missing coverage basis or required follow-up.

## Conclusion

The current inventory can now answer, source by source, whether reviewed content was promoted, deliberately withheld, delegated to child sources, or remains incomplete. This closes a tracking gap but does not make the corpus complete: authenticated child-document acquisition, partial-document review, and the full open source backlogs remain material work.
