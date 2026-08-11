# Phase 1 current-corpus checkpoint

Status date: 2026-08-10

This is a validated progress checkpoint, not the Phase 1 completion report. Phase 2 remains gated.

## Current corpus

- 121 primary source records: 85 fully reviewed, four partially reviewed, 25 not yet reviewed, and seven inaccessible. The exact supplied Drive connector folder is now accessible and its 35 current children reconcile to 31 unique registered archive hashes.
- 144 general operational knowledge records: 90 `VERIFIED`, 32 `HUMAN_REVIEW_REQUIRED`, 20 `POTENTIALLY_OUTDATED`, and two `CONFLICT`.
- 383 exact evidence objects and mapping rows across 226 unique knowledge/source pairs.
- 3,242 substantive claims: 1,774 unambiguous single-fragment claims and 1,468 human-allocated multi-fragment claims across 65 records; zero allocation rows remain pending.
- 192 formal operational driver-language cases, 23 canonical reference-language cases, 69 non-indexed candidate operational cases, 21 candidate knowledge-gap cases, and 724 indexed operational variants covering all 144 records plus the code-reference boundary.
- Canonical release: 90 `SOURCE_VERIFIED`, seven `READY_ROUTE_APPROVED`, 27 `PENDING_REVIEW`, and 20 `POTENTIALLY_OUTDATED`; 91 records are publication-ready and six otherwise status-eligible records remain evidence-capture gated.

## Quality-control and adversarial result

The completed claim-allocation pass tested every multi-fragment claim against its exact reviewed source fragments. The final four reviewed records in that pass produced substantive source-alignment corrections rather than merely confirming existing text:

- `KNO-PUP-CALLTAG-FRAUD-001`: removed unsupported fraud-assessment, approval, documentation, physical-tag, and preservation instructions; retained only the source-defined stop-wide suspected-fraud handling and code reference.
- `KNO-DEL-BUS-OP201-001`: preserved the exact conflict between the FORGE no-OP-201 release path and current OP-117's no-release instruction; removed an unsupported sample-agreement condition and misclassified documentation.
- `KNO-DEL-TOBACCO-001`: retained the current individual-consumer prohibition and separated the older limited commercial preauthorization language; removed a misclassified documentation claim.
- `KNO-FORGE-DEVICE-INFO-001`: retained only source-defined device-information fields and navigation paths; removed unsupported sensitivity, disclosure, and documentation assumptions.

Because this pass still found substantive corrections, the Phase 1 diminishing-yield criterion is not yet proven. The same adversarial controls must be repeated after authenticated acquisition and extraction of the remaining accessible source families.

## Validation result

The transfer-defined portable and full-corpus validation stack passed after the corrections:

- `python3 scripts/validate_knowledge.py`: 144 records valid.
- `python3 scripts/validate_reference_data.py`: 57 reference records valid with all documented cross-namespace collisions and translation coverage intact.
- `python3 scripts/validate_corpus_integrity.py`: all inventory, source, evidence, taxonomy, provenance, allocation, language, and interaction ledgers reconcile exactly.
- `npm run knowledge:release`: release build and validation pass; 144 records, 121 sources, 192 cases, 91 publication-ready records, six evidence-gated status-eligible records, seven active adjudications, and 34 change-log entries.
- `npm --prefix backend run knowledge:validate-retrieval`: 192/192 top-1, 192/192 top-5, 192/192 response-mode matches, and zero unsafe-answer gating failures.
- `shasum -a 256 -c research/fedex-ground-driver-knowledge/inventory/source_checksums.sha256`: every archived source and durable capture matches its recorded SHA-256 digest.
- `git diff --check`: no whitespace errors.

## Remaining Phase 1 gate

The deterministic authenticated-acquisition queue now contains 266 resources: four partial-source reviews, 25 uncaptured primary-source reviews, seven durable recaptures, and 230 other unacquired resources across the Safety Topic, news-archive, and navigation backlogs. Three active partial completions are in Wave 0 and the version-ambiguous pickup sheet remains deferred. Seventy-one unique Safety Topic documents, 100 exact monthly news-archive pages, and 42 referenced-source obligations remain open.

The 2026-08-09 live authenticated current-source pass revalidated the Pickup, On Road, and Accident Reporting indexes and added checksum-protected complete captures/reviews for the On Road index, the June 2026 maintenance-resource notice, the August 2026 Iowa ELP notice, and the August 2026 Micron reconciliation alert. The maintenance notice only points to unacquired MyBizAccount forms; the ELP article supplies qualification context but no route procedure; the Micron article is customer-specific; and the Authenticated Delivery announcement is retained as historical launch context. None was generalized beyond its exact scope.

After the user restored authentication, the current-source continuation first captured partial views of the November 2025 Equipment Terms, January 2026 Vehicle Appearance FAQ, and English SRS/SRI FAQ. The uploaded originals then closed all three reviews: five, two, and eight pages respectively are archived and fully reviewed. Equipment/appearance material remains contractor-control context, and SRS/SRI remains a business safety-performance metric rather than an independent driver procedure. A separate focused review of eight preserved 2026 monthly archive result captures found 15 discovery entries, including cross-year results on 2026 filters, and no source-complete broadly applicable current driver procedure.

The six checksum-preserved FCC videos contain H.264 video and AAC audio and total approximately 17.7 minutes. Complete time-addressed visual review and full machine-transcript-assisted audio review are now documented in six source-specific reviews. The videos describe 2017 manager/AO/BC-facing FCC/STAR-era workflows; all six are `FULLY_REVIEWED`, retained as historical context, and create no current canonical knowledge mappings.

Phase 1 cannot be declared complete—and Phase 2 cannot begin—until accessible authenticated sources are acquired and reviewed as completely as access permits, the ledgers are updated, and the final quality-control, adversarial-completeness, evaluation, and diminishing-yield passes are rerun.

The 2026-08-10 restored-session pass added the current FORGE hub, five mainstream quick-reference sources, and bounded captures of the FORGE 3.2 and current 3.3 guides. The later batches supplied the complete 198-page FORGE 3.3 original; OP-130, OP-132, and OP-135 originals; the Dog Bite Prevention original; the current Equipment Terms; the Vehicle Appearance and SRS/SRI FAQs; OP-117; and four exact portal/Drive duplicates. FORGE 3.3 establishes the current conditional Ground FAD workflow and adds bounded current evidence for international pickup prompts, pharmacy HAL restriction, EOD reconciliation, and misdelivery status handling. The OP-117 portal file differs in bytes from the supplied copy but matches it across all 89 rendered pages. Focus on Package Placement and its Quick Reference are byte-identical to their mapped supplied-Drive copies.

The same batch fully reviewed four older pickup references. They are retained for historical and corroborative value; current OP-117/FORGE guidance controls. The 2023 same-pickup-ID feature remains version-sensitive and non-definitive until the current FORGE 3.3 feature scope is fully confirmed.

The 31-item human-verification packet was reconciled without flattening its stated gaps. Seven bounded determinations are active as `READY_ROUTE_APPROVED`: Change Vehicle, pre-dispatch Manifest Preview/work-area correction, OP-207/OP-207Res identity and HAL-outage scope, hazmat pickup acceptance, hazmat loading/papers, everyday HOS limits, and short-haul/16-hour/adverse-condition exceptions. All items described as partial, absent, or needing CXPC/management remain pending or source-limited. See `reports/human_verified_operational_reconciliation_2026-08-10.md`.

## USB restoration continuation

The original source-bearing workspace at `/Volumes/USB322FD/readyroute` was compared and copied into the clone with ignore-existing semantics. The clone was already a strict archive superset: all 24 USB source files, 68 USB capture files, and 42 video-visual review files were present; the clone additionally contained later acquisitions and captures. All 69 registered archive checksums and the full transfer-defined portable/full-corpus validation stack passed after restoration. See `validation/workspace_restoration_audit_2026-08-10.md`.

The next current/mainstream attempt targeted the two original PDFs that would release all six evidence-gated verified safety records. The exact MyGroundBiz URLs returned `Access Denied`, and neither filename appears among the 31 direct files in the connected supplied Drive folder. `SRC-MGB-DOC-0038` and `SRC-MGB-DOC-0039` therefore remain backed by complete hashed rendered pages but not original PDF bytes. No publication gate or knowledge status changed.

The subsequent restored-corpus adversarial pass reviewed all 144 current records, all 3,242 claims/allocations, 383 mappings, 192 formal cases, and 724 indexed variants. It found no substantive operational addition or source-alignment correction in the accessible reviewed mainstream layer. The only findings were stale QC-document scope/count statements, which were corrected without changing knowledge truth. This establishes diminishing yield for the current accessible layer only; it does not close the authenticated acquisition, referenced-source, conflict, or human-review queues.

The remaining human-decision work is now consolidated into `knowledge/human_adjudication_queue.csv`: exactly 27 canonical pending records after the seven active approvals are excluded. Each row carries its current safe boundary, exact unresolved decision, responsible owner class, evidence-quality requirements, source/backlog dependencies, and publication gate. The human-readable `reports/human_adjudication_packet_2026-08-10.md` prioritizes 20 mainstream P&D questions before six compliance/qualification questions and one specialized linehaul question.

The separate currency lane is now consolidated into `knowledge/version_confirmation_queue.csv`: exactly all 20 canonical `POTENTIALLY_OUTDATED` records. Each row preserves its older source/version and locator, exact controlling update needed, owner class, evidence-quality requirements, current safe boundary, dependency, and qualification gate. The human-readable `reports/version_confirmation_packet_2026-08-10.md` prioritizes safety and mainstream transaction/data-integrity behavior before device support and low-risk settings/reference behavior.

## Candidate evaluation continuation

The owner-supplied 155-row evaluation pack was preserved byte-for-byte and reduced to a 145-prompt union. Its proposed answers were not accepted as authority. All 113 non-holdout development prompts are classified: 23 map to canonical reference evaluations, 69 to canonical operational records, and 21 to explicit knowledge-gap or insufficient-context boundaries. The operational prompts remain outside the retrieval synonym index. After general language-normalization, concept-intent, ambiguity, and status-boundary remediation, the suite achieves 69/69 top-1, top-5, and response-mode matches, with 11 correct publication-withheld escalations and zero unsafe answer-gating failures. The maintained 192-case suite remains perfect. Only the 32 deterministic holdout prompts remain unmapped and untouched.
