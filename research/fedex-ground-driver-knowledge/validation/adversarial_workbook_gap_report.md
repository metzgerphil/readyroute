# Adversarial workbook coverage pass

Status date: 2026-08-09

Source tested: `SRC-GDRIVE-FILE-0003`, `FedEx_Driver_Bot_Scenarios.xlsx`, all 78 scenario rows.

Authority rule: the workbook is a `SECONDARY_REFERENCE`. It can reveal candidate gaps and bad mappings, but it cannot establish an approved operational answer unless the underlying supplied authoritative source is independently present and reviewed.

## High-priority findings

1. **Scenario 5 contains a material code mismatch.** The situation is a closed/non-residential business, but the workbook answer assigns code 007, which current OP-117 defines for a residential recipient-not-in condition. Current code 004 is the non-residential recipient-not-in reference. The workbook answer must not be ingested.
2. **Scenario 12 reaches the documented business-release conflict.** Code 021 exists, but the authority to release without OP-201 remains unresolved between OP-117/current portal notices and the April 2025 FORGE guide. Keep `KNO-DEL-BUS-OP201-001` in `CONFLICT`.
3. **Scenarios 24-28, 32-34, and 37 still lack all or part of their cited primary sources.** The current 2026 Dog Bite Prevention topic now directly covers scenarios 29-31 and partially covers scenario 32. Railroad, flooded-road, winter-supply, additional pre-exit dog checks, backing, overhead-clearance, and route-help/pay answers still depend on the absent Driver Safety Guidebook or Company Safety and Operation Handbook.
4. **Scenario 35 mixes supported placement guidance with an unsupported personal-phone-photo instruction.** Secure/weather-protected placement is covered by `KNO-DEL-SAFEPLACE-001`; official FORGE photo capture is covered by `KNO-DEL-PPOD-001`. No reviewed authority permits or requires a driver's personal phone photo.
5. **Scenario 41 lacks a primary PRC/customer-inquiry workflow.** Obtain a current Package Research Case source before creating guidance.
6. **Scenario 59 exposed a missing decision boundary.** OP-117 defines package-condition expectations but does not create a universal driver refusal rule for every packaging defect. This is now modeled as `KNO-PUP-PACKAGING-001` with `HUMAN_REVIEW_REQUIRED`.
7. **Scenario 70 contains a version gap.** Code 030 Retail Refusal/O.S.A. appears in the 2024 OP-119 list but is absent from the reviewed 2025-12-15 OP-117 list, and O.S.A./criteria are not defined. The reference is preserved as `POTENTIALLY_OUTDATED` pending current OP-324 or equivalent.

## New knowledge extracted from authoritative sources during this pass

- `KNO-FORGE-CALLTAG-SCOPE-001` — all-call-tags versus individual-tag action scope.
- `KNO-PUP-CALLTAG-FRAUD-001` — code 106 UI branch preserved without inventing fraud criteria.
- `KNO-FORGE-DEVICE-ROAD-001` — older on-road device warning, flagged potentially outdated.
- `KNO-CX-APPEARANCE-001` — badge, service-provider apparel, and Alternative Vehicle vest condition.
- `KNO-SEC-ROUTE-001` — ordinary package/vehicle security and threat priority.
- `KNO-PUP-PACKAGING-001` — packaging expectations separated from unresolved acceptance authority.
- `KNO-COMMS-MEDIA-001` — FedEx-premises recording and media/brand escalation.
- `KNO-SAF-DOG-ENCOUNTER-001` — current unfamiliar-dog avoidance, approach, knockdown, and wound-response guidance with package/status/internal-reporting limits preserved.

## Coverage grouping across all 78 workbook rows

- **Directly covered or mapped to verified records/reference data (53):** 2-4, 6-11, 13-17, 19, 21-23, 29-31, 36, 39, 42-47, 49, 51-53, 55, 57-58, 61-69, and 71-78.
- **Covered only in part or with a required condition/conflict (10):** 1, 12, 18, 20, 32, 35, 50, 54, 56, 60.
- **Human review required:** 38, 40, 48, 59.
- **No authoritative evidence currently available:** 24-28, 33-34, 37, 41.
- **Potentially outdated:** 70.
- **Workbook answer contradicted by current authority:** 5.

The prior prose grouping omitted scenario 5 even though the high-priority findings identified its code mismatch. `validation/workbook_scenario_coverage.csv` now prevents that class of accounting defect with one exact row for every workbook scenario. Each row preserves the source category, driver wording, cited-source note, and SHA-256 hash of all five source cells, then records the authoritative target set, source-gap IDs, answer-safety disposition, and required follow-up. `scripts/build_workbook_scenario_coverage.py` regenerates the ledger directly from the archived XLSX and the corpus validator requires exact 1-78 coverage and valid knowledge, taxonomy, status-code, file, and backlog targets.

## Next source targets

1. Durably recapture the original bytes for fully reviewed `SRC-MGB-DOC-0011`; page-addressed renders and exact page mappings already support scenarios 29-31 and the supported subset of scenario 32.
2. Acquire `REFSRC-041`, the cited 2025 Driver Safety Guidebook pages 54, 57-58, 79, 121-122, and 163-167, and establish edition/authority for the remaining railroad, road/weather, detailed dog-sign/pre-exit, backing, and clearance gaps.
3. Acquire `REFSRC-042`, the cited Company Safety and Operation Handbook sections for backing, overhead clearance, route-help policy, and any contractor-specific compensation statements; establish provenance and authority before extraction. PRC handling remains independently tracked as `REFSRC-025`.
4. Obtain current OP-324/controlling status-code material for code 030 and other version-sensitive code definitions.
5. Obtain a current authoritative package-acceptance/refusal workflow for visible non-hazmat packaging defects.

The workbook pass is not final realistic-language validation. It is an adversarial gap audit that prevents unsupported workbook answers from entering the authoritative layer.
