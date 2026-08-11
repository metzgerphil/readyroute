# Complete Drive-PDF page coverage audit

Audit date: 2026-08-09

## Purpose

This audit proves page accountability for every PDF in the supplied Google Drive corpus. It does not treat a reviewed page, an older table, a screenshot, or presentation context as current operational authority.

## Scope and result

`knowledge/drive_pdf_page_coverage.csv` reconciles all 407 pages across all 15 supplied PDFs. Every source has a gap-free page sequence from page 1 through its recorded page count, and no row remains `UNRECONCILED`.

| Disposition | Pages |
|---|---:|
| `KNOWLEDGE_MAPPED` | 363 |
| `TABLE_OF_CONTENTS` | 8 |
| `OLDER_VERSION_REFERENCE_ONLY` | 7 |
| `GOVERNING_FRONT_MATTER` | 4 |
| `PRESENTATION_CONTEXT` | 4 |
| `KNOWLEDGE_AND_REFERENCE_MAPPED` | 4 |
| `OLDER_STATUS_REFERENCE_PARTIALLY_MODELED` | 2 |
| `UI_SCREEN_REFERENCE` | 5 |
| `DEMO_FIXTURE_REFERENCE` | 2 |
| `REFERENCE_DATA_MODELED` | 1 |
| Seven other explicit one-page dispositions | 7 |
| **Total** | **407** |

The seven grouped one-page dispositions are `METRICS_CONTEXT`, `ICON_GLOSSARY_REFERENCE`, `NAVIGATION_REFERENCE`, `SECTION_DIVIDER`, `VISUAL_REFERENCE_ONLY`, `VISUAL_EXAMPLE_ONLY`, and `LOCAL_CONTACT_TEMPLATE_TRACKED`.

## Source reconciliation

| Source | Pages | Principal result |
|---|---:|---|
| `SRC-GDRIVE-FILE-0001` | 2 | Both pages reconciled: operational customer-experience/security content mapped, with legacy status tables separately bounded |
| `SRC-GDRIVE-FILE-0002` | 16 | Twelve operational pages mapped; front matter/context and older status material classified |
| `SRC-GDRIVE-FILE-0004` | 12 | Eight operational pages mapped; presentation/metrics context separated |
| `SRC-GDRIVE-FILE-0005` | 1 | Knowledge mapped |
| `SRC-GDRIVE-FILE-0006` | 3 | All pages knowledge mapped |
| `SRC-GDRIVE-FILE-0007` | 5 | All pages knowledge mapped |
| `SRC-GDRIVE-FILE-0008` | 246 | 233 operational pages mapped; thirteen front-matter/UI/reference/demo pages classified |
| `SRC-GDRIVE-FILE-0009` | 8 | Current-use page mapped; seven older-version reference pages bounded |
| `SRC-GDRIVE-FILE-0010` | 6 | All pages knowledge mapped |
| `SRC-GDRIVE-FILE-0011` | 1 | Knowledge mapped |
| `SRC-GDRIVE-FILE-0012` | 1 | Knowledge mapped |
| `SRC-GDRIVE-FILE-0013` | 14 | Thirteen operational pages mapped; front matter classified |
| `SRC-GDRIVE-FILE-0014` | 89 | Complete OP-117 reconciliation incorporated |
| `SRC-GDRIVE-FILE-0015` | 2 | Operational instruction mapped; visual example bounded |
| `SRC-GDRIVE-FILE-0016` | 1 | Knowledge mapped |

## Knowledge discovered during reconciliation

The remaining-PDF page pass added source-bounded records for pickup-service terminology, the three-attempt delivery limit, pickup scan integrity, FORGE display/navigation preferences, and Manifest Preview search/filter behavior. The later MGB-119 reconciliation mapped page-2 security content and added the current same-day second-attempt branch for exact FO, PA, PA+, and M&I labels while preserving their undefined abbreviations. Version-sensitive items remain `POTENTIALLY_OUTDATED`; current pickup-service definitions and selection criteria remain in the referenced-source backlog rather than inferred.

## Integrity controls

`scripts/build_drive_pdf_page_coverage.py` deterministically regenerates the ledger. `scripts/validate_corpus_integrity.py` rejects:

- a missing or extra PDF source;
- a page-count mismatch, duplicate page, page gap, or out-of-order page;
- an unknown knowledge ID or invalid disposition;
- a committed `UNRECONCILED` row;
- a mapped row without knowledge IDs, or a nonmapped row that improperly claims knowledge IDs;
- missing coverage bases or required follow-up for version/reference/context dispositions; and
- any difference from deterministic builder output.

## Limitation

This closes page accountability for the supplied Drive PDFs only. It does not close unacquired MyGroundBiz downloads, the 77-item Safety Topic Library backlog, controlling referenced publications, portal/Drive byte-identity checks, or current-version questions already preserved in the research ledger.

The nine pages with `OLDER_*` dispositions receive an additional subject-level replacement/gap audit in `knowledge/legacy_reference_page_crosswalk.csv` and `validation/legacy_reference_page_supersession_audit.md`; they are not accepted as safely excluded merely because their source is older.
