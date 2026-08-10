# FORGE 2.8.0 page-level coverage audit

Audit date: 2026-08-09

## Purpose

The 246-page FORGE P&D Application Guide is the largest reviewed source in the supplied Drive corpus. Its earlier prose page map and `FULLY_REVIEWED` status did not prove that every page had produced knowledge or received an explicit disposition.

## Result

`knowledge/forge_page_coverage.csv` reconciles all 246 pages with no unclassified page:

- 233 `KNOWLEDGE_MAPPED` pages;
- 3 table-of-contents pages;
- 5 annotated UI-screen reference pages;
- 2 demo-fixture reference pages;
- 1 governing/version front-matter page;
- 1 icon-glossary reference page; and
- 1 navigation reference page.

The explicit reference classifications are narrow. Pages 79-80 show the locker-number/SKIP prompt and optional door-tag controls but do not independently establish locker-number omission authority or current door-tag obligations; those operational rules remain source-gated or mapped elsewhere. Page 93 is an intermediate ASR Time Definite/Stop Details screen with no independent ASR rule; pages 92 and 94-96 carry the actionable eligibility and completion sequence. Page 235 establishes where navigation buttons/icons appeared, not which route to drive or whether device interaction is safe while moving. Pages 240-241 contain demo barcodes, not production tracking data.

## Substantive extraction result

The audit added eleven knowledge records:

- `KNO-FORGE-MULTICODE-001`
- `KNO-FORGE-FIRST-LAUNCH-001`
- `KNO-FORGE-LOGIN-DISPATCH-001`
- `KNO-FORGE-LANGUAGE-001`
- `KNO-FORGE-STANDARD-DELIVERY-001`
- `KNO-FORGE-STANDARD-PICKUP-001`
- `KNO-FORGE-UNMANIFESTED-DELIVERY-001`
- `KNO-DEL-HAZMAT-SIGNATURE-001`
- `KNO-DEL-ALT-SIGNATURE-001`
- `KNO-FORGE-MESSAGING-001`
- `KNO-FORGE-DEVICE-INFO-001`

Seven UI-dependent records are `POTENTIALLY_OUTDATED` and require current-version confirmation. Login/dispatch, unmanifested delivery, and Alternate Signature are `HUMAN_REVIEW_REQUIRED` because the demo guide cannot establish current real-user authority, destination/assignment authority, or complete form/custody rules. Hazmat delivery signature/no-release is `VERIFIED` because OP-117 pages 34-35 independently establish the no-driver-release/nondelivery branch.

Exact FORGE evidence was also added to existing indirect delivery, PPOD, ASR, unlisted pickup, call-tag scope, suspected-fraud, and business-closure-message records. All new records have source evidence, decision logic, status-safe concise/More Info answers, related procedures, 44 embedded driver-language variants, and formal validation cases. An additional ambiguity case separates a normally closed pickup from an unsent/sync-queued stop.

## Integrity control

`scripts/build_forge_page_coverage.py` deterministically regenerates the 246-row ledger. Corpus validation rejects:

- missing, duplicate, reordered, or extra pages;
- stale generated rows;
- unknown knowledge links;
- missing subjects or coverage bases;
- any `UNRECONCILED` or unknown disposition;
- drift in the thirteen explicit front-matter/reference/demo-page dispositions; and
- loss of mappings for representative substantive sections across the full document.

This establishes page-level accountability for the supplied April 2025 guide. It does not establish that FORGE 2.8.0 remains the installed version or that a demonstrated button authorizes an operational action. Current MyGroundBiz acquisition and controlling-policy reconciliation remain required.
