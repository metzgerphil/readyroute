# Legacy/reference page supersession audit

Audit date: 2026-08-09

## Purpose

The complete Drive-PDF ledger explicitly classifies nine pages as older status/reference material. This audit tests the dangerous alternative explanation: that an `OLDER_*` disposition may be hiding a distinct procedure that was never modeled.

The audit does not assume that a newer date makes a whole document controlling. Each legacy page is crosswalked at the page and subject level to reviewed replacement evidence, current knowledge/reference data, and any remaining controlling-source gap.

## Scope

`knowledge/legacy_reference_page_crosswalk.csv` accounts for exactly the nine `OLDER_*` rows in `knowledge/drive_pdf_page_coverage.csv`:

- MGB-119 page 2: older delivery/pickup status quick-reference table.
- OP-119 page 11: scan integrity plus an older status table.
- FORGE Quick Start Guide pages 2-8: 2023 FORGE 1.0.0 login, dispatch, ordinary delivery/pickup, release, status, scan deletion, EOD, and messaging screens.

## Findings

| Legacy area | Current modeled replacement | Remaining source gate |
|---|---|---|
| MGB-119 status/reason table | Current OP-117 tables; 50 delivery-status and seven pickup-reason reference records | `REFSRC-002` OP-324 and `REFSRC-003` OP-321 still control complete current selection criteria |
| OP-119 scan integrity/status page | Current OP-117 and MGB-119 scan-integrity rules; normalized status/reason references | OP-324 and OP-321 remain unacquired |
| FORGE 1.0.0 login/password page | April 2025 login/dispatch record | `REFSRC-022`; the 2023 password hotline, password rules, and login-attempt limit are not promoted |
| FORGE 1.0.0 authorization/vehicle/dispatch page | April 2025 login/dispatch and validation-warning records | `REFSRC-022`; real-user role/compliance authority remains human-review gated |
| FORGE 1.0.0 listed business delivery/pickup page | April 2025 standard delivery and pickup records | `REFSRC-022`; current production UI/version confirmation remains required |
| FORGE 1.0.0 residential/indirect release page | Current OP-117 release/signature/photo policy plus April 2025 UI records | `REFSRC-022` only for current UI; current operational policy is separately sourced |
| FORGE 1.0.0 status-scope page | Current stop/package status-scope record and normalized OP-117 table | OP-324 and current production FORGE documentation |
| FORGE 1.0.0 scan-deletion/EOD page | Current-source scan-deletion record and April 2025 EOD record | `REFSRC-022`; EOD remains human-review/version gated |
| FORGE 1.0.0 messaging page | April 2025 messaging and business-closure-message records | `REFSRC-022`; current production UI and exception authority remain gated |

## Adversarial result

No distinct legacy-page procedure was found that could safely be promoted as current guidance. Every operational subject is either:

1. represented by newer reviewed evidence and an existing knowledge/reference record;
2. represented but deliberately status/version gated; or
3. tied to an explicit referenced-source obligation.

The audit specifically prevents the following unsafe promotions:

- publishing a 2023 password-reset phone number or credential rule as current;
- using old status labels as complete code-selection logic;
- presenting FORGE 1.0.0 screens as current UI;
- treating a demonstrated EOD path as the complete approved closeout procedure; and
- treating preset messaging availability as authority to resolve an operational exception.

## Automated control

`scripts/validate_corpus_integrity.py` derives the expected crosswalk key set directly from every `OLDER_*` page in the complete Drive ledger. Validation rejects missing/extra crosswalk pages, unknown current sources, sources that are not fully reviewed, unknown knowledge/gap IDs, invalid reference-data scopes, missing review bases, and gap-classified rows without an explicit backlog obligation.

## Limitation

This proves accountability for the nine legacy/reference pages in the supplied Drive snapshot. It does not establish current production FORGE behavior or complete OP-324/OP-321 criteria; those remain explicitly unacquired and must be reviewed from authorized current sources.
