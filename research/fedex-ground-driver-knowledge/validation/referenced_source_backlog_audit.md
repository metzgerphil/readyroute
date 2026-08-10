# Referenced-source backlog audit

Status date: 2026-08-09

Purpose: consolidate source material explicitly referenced by reviewed documents or exposed as a controlling-evidence gap into a structured acquisition ledger. A missing source is not treated as evidence for its presumed contents.

## Result

- 42 referenced-source obligations are recorded in `inventory/referenced_source_backlog.csv`.
- 29 are priority `P0_BLOCKS_APPROVED_GUIDANCE` because they control an unresolved procedure, conflict, safety/compliance rule, or status-sensitive workflow.
- Thirteen are priority `P1_COMPLETENESS` because current guides establish a usable limited rule or a secondary source exposes a candidate branch, but the physical artifact, primary source, or detailed companion material remains necessary for exhaustive coverage.
- Every backlog row identifies one or more reviewed origin sources and one or more affected knowledge, taxonomy, or reference targets.
- The 42 obligations expand to 63 exact origin-source occurrences in `inventory/referenced_source_occurrences.csv`; every occurrence preserves the reviewed source and exact page, section, or workbook-row locator that created the obligation.
- All rows remain `NOT_ACQUIRED`/`NOT_YET_REVIEWED`; titles and identifiers are never used to fill procedural gaps.

## Explicit identified artifacts

The ledger includes OP-324, OP-321, OP-207, OP-207Res, HZ-035, SF-920P, SF-034, the unresolved SF-035 identifier, OP-900LL/LG, OP-901/OP-902, OP-950, OP-200/OP-200SP, OP-201, OP-206, OP-406, SF-136/OP-908, the current ERG, and decal 20159S.

## Source families and workflows without a supplied identifier

The ledger separately tracks the executed ISP Agreement and schedules, relay instructions, detailed vehicle/security standards, jurisdiction-specific CDL material, the current hazmat acceptance table, equipment-specific coupling resources, current production FORGE documentation, drop-box authorization material, Disputed Delivery recovery, Package Research Case handling, international-document requirements, COD policy/custody rules, qualification/First Advantage materials, the cited 2025 Driver Safety Guidebook, and the cited Company Safety and Operation Handbook.

## Exact occurrence reconciliation

The follow-up pass expanded every semicolon-delimited `origin_source_ids` relationship into a separate occurrence. The resulting 63 rows cover all 42 obligations and all 20 reviewed origin sources involved. Locators include OP-117 pages, FORGE guide pages, OP-119/MGB-119 pages, complete named MyGroundBiz page sections, the Personnel Qualification flow, and exact Driver Scenarios workbook row ranges including rows 24-37 and 41.

This is deliberately one row per backlog/source relationship rather than one row per textual repetition. Repeated mentions inside the same source are consolidated into the complete relevant page range. Explicit OP/SF/HZ/decal identifiers remain covered by the automated artifact-identifier scan. Discovery of unnamed source families remains a human adversarial-review responsibility and must be repeated when new sources are added.

## Regression controls

The corpus validator now enforces:

- Unique structured backlog IDs and nonblank descriptions/reasons.
- Unique nonblank document identifiers.
- Origin IDs that resolve to reviewed primary-source inventory rows.
- Affected targets that resolve to a knowledge record, taxonomy node, or current reference-data path.
- Allowed priority and open-status values.
- Continued presence of the core explicitly cited identifiers until acquisition is reconciled.
- Exact one-to-one coverage of every backlog/origin-source pair, contiguous occurrence IDs, nonblank source locators, and deterministic equality with `scripts/build_referenced_source_occurrences.py`.

When a source is acquired, it must first receive a primary source row, checksum/archive data where applicable, and a review artifact. Only then may the corresponding backlog row be removed and affected knowledge/status reports be reconsidered.

This audit proves missing-source accountability and exact origin traceability, not acquisition completeness. All 42 obligations and all 63 source occurrences remain open.

The companion `inventory/referenced_source_acquisition_coverage.csv` and `validation/referenced_source_acquisition_coverage_audit.md` reconcile every gap against the current authenticated acquisition queue. They show that 12 gaps have at least one direct or contextual queue link while 30—including 18 P0 blockers—have no current exact queue link and therefore require targeted authorized discovery. A contextual record-resolution page is never treated as proof that the missing source is present there.

The later non-verified-resolution audit repaired 36 one-way dependency links involving current FORGE, CDL/HOS, qualification, and hand-sheet sources. The validator now requires exact bidirectional agreement whenever a backlog affects a non-verified knowledge record, so source acquisition can enumerate all records requiring status review.
