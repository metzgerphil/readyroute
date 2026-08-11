# OP-117 page-level coverage audit

Audit date: 2026-08-09

## Purpose

OP-117 v2 is the broadest current on-road source in the supplied Drive corpus. A document-level `FULLY_REVIEWED` label and prose page map were not sufficient to prove that each of its 89 pages had either produced knowledge or received an explicit, defensible disposition.

## Result

`knowledge/op117_page_coverage.csv` reconciles all 89 pages with no unclassified page:

- 76 `KNOWLEDGE_MAPPED` pages;
- 4 `KNOWLEDGE_AND_REFERENCE_MAPPED` pages;
- 1 `REFERENCE_DATA_MODELED` page;
- 4 table-of-contents pages;
- 1 governing front-matter page;
- 1 section-divider page;
- 1 visual-reference-only page; and
- 1 locally configurable contact-template page.

The page parser derives operational links from exact `SRC-GDRIVE-FILE-0014` locators in `knowledge/source_to_knowledge.csv`. It separately counts normalized records from `knowledge/status_codes.jsonl` so pages 37-39 are not mislabeled as missing merely because they are reference tables rather than complete operational workflows.

## Substantive gaps found and corrected

- Page 26 was absent from the earlier locator set. It establishes the with-OP-201/no-OP-201 commercial-release branches and now maps to `KNO-DEL-BUS-OP201-001` through the exact locator `OP-117 v2 pages 26-27`.
- Page 75 was absent from the earlier locator set. It establishes custody and station return of the required shipper-prepared certification/declaration copy for accepted fully regulated hazmat. The complete step, documentation requirement, prohibition, concise supporting detail, evidence locator, and source mapping are now preserved in `KNO-HAZ-ACCEPTANCE-001`.
- Page 28 briefly became unreconciled when the broad residential-release locator was split during exact claim allocation. Visual and text review confirmed that it independently defines the ordinary recipient-not-home options—eligible indirect delivery, safe driver release, or later attempt—and applicable door-tag use. It now has an exact page-28 mapping to `KNO-DEL-SAFEPLACE-001`.

These additions do not resolve the OP-201 source conflict or replace missing current hazmat cards/forms. Existing publication gates remain in force.

## Image-heavy appendix finding

Visual review confirmed that page 88 contains common label-format examples without an explicit action. Page 89 contains additional label examples and a blank local Contact Information table. The latter is tracked as `ART-DOC-003` with `LOCAL_CONFIGURATION_REQUIRED`; no phone number or local contact is inferred.

## Integrity control

`scripts/build_op117_page_coverage.py` deterministically regenerates the ledger. `scripts/validate_corpus_integrity.py` rejects:

- any row count or page order other than exactly pages 1-89;
- stale generated rows;
- invalid or `UNRECONCILED` dispositions;
- unknown knowledge or artifact links;
- missing subject or coverage basis;
- changes to the explicit front-matter/divider/visual/artifact dispositions; and
- loss of substantive mappings for pages 26 or 75.

This closes page-level accountability for the current OP-117 version. It does not claim that referenced external cards, the controlling ISP Agreement, or future OP-117 revisions have been acquired or reconciled.
