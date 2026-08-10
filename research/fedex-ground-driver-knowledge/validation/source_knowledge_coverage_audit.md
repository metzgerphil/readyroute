# Source-to-knowledge coverage reconciliation audit

Status date: 2026-08-09

## Purpose

Source review status and knowledge extraction are different claims. A source can be fully reviewed yet intentionally unmapped because it is a container, secondary reference, or landing page; it can also be fully reviewed with zero mappings because durable extraction evidence is too weak and authenticated reinspection is required.

`inventory/source_knowledge_coverage.csv` now gives every primary inventory source an explicit, machine-checkable extraction disposition.

## Current reconciliation

All 106 primary source rows are represented exactly once.

- 37 sources contribute operational evidence mappings:
  - 36 fully reviewed sources are `MAPPED_OPERATIONAL_EVIDENCE`.
  - OP-135 is `MAPPED_PARTIAL_SOURCE_SCOPE`; its single mapping is limited to reviewed page 1.
- 69 sources currently have zero mappings:
  - 42 are `NOT_YET_REVIEWED` portal resources; six have durable video bytes but still lack complete review.
  - 8 sources are `INACCESSIBLE`.
  - 1 reviewed Drive container delegates evidence to its 17 child files.
  - 1 reviewed scenario workbook is a `SECONDARY_REFERENCE_NO_AUTHORITY`.
  - 1 partially reviewed MyGroundBiz navigation container remains open.
  - 5 fully reviewed landing pages have substantive child sources pending.
  - 3 fully reviewed indexes have inventoried child sources still requiring review.
  - 3 fully reviewed contextual pages contain no distinct operational procedure beyond mapped controlling sources.
  - 1 fully reviewed Customer Alerts page delegates operational evidence to its dedicated 138-segment alert layer.
  - 1 fully reviewed redirect delegates content evidence to its reviewed target page.
  - 3 partially reviewed documents require remaining-page review.

The ledger reconciles exactly to all 342 source-to-knowledge mapping rows. No unreviewed, inaccessible, container-only, or secondary source is silently counted as mapped operational authority.

## Zero-mapping sources that require continued follow-up

The earlier sparse-source pass flagged `SRC-MGB-PAGE-0008` and `SRC-MGB-PAGE-0015` for renewed scrutiny. Their complete durable captures have now been reinspected:

- `SRC-MGB-PAGE-0008` is a fully reviewed pickup-resource index. Its 17 child resources remain independently queued; six videos are durably captured but unreviewed.
- `SRC-MGB-PAGE-0015` is a high-level Unsafe Driving context page. It supplies no distinct driver procedure beyond the broader current CSA/DOT material, so zero mappings is the correct disposition.

The current five-page sample ISP Agreement and five-page Equipment Terms document remain partial and unmapped. Dog Bite Prevention is fully reviewed and mapped through six exact evidence fragments, including its complete-review source boundary. OP-135 is the only partially reviewed document permitted to contribute evidence, and that contribution is locator-limited to page 1 with the limitation disclosed in its knowledge record.

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
