# Source coverage report

Status date: 2026-08-09

This is a live report, not a claim of completion.

## Current coverage

- 106 primary source/source-location records inventoried.
- 52 records fully reviewed.
- 5 records partially reviewed.
- 41 records not yet reviewed.
- 8 records inaccessible: the connector-level Drive source and exact broken MyGroundBiz links.
- 77 additional dated Safety Topic Library documents are inventoried in a dedicated child-source inventory.
- The complete supplied-folder ZIP and all 17 direct files were archived locally; all 18 inventory paths and SHA-256 digests are validator-verified.
- A separate 17-row ZIP-member ledger proves that every member maps one-to-one to a distinct extracted Drive source by exact SHA-256 content identity, including the screenshot whose filename encoding differs between ZIP metadata and the extracted path.
- All 17 direct Google Drive files have complete content review under their applicable evidence roles.
- Every primary source marked fully or partially reviewed now has a dedicated review artifact; the corpus validator rejects future reviewed-source rows without one.
- A 106-row source-capture ledger separately proves that 49 sources have durable checksum-protected bytes, one fully reviewed source has complete hashed rendered-page capture, two partially reviewed sources have partial hashed rendered-page capture, eight fully reviewed sources have only transient review artifacts, three sources have transient partial review, 35 sources are not acquired, and eight sources are inaccessible with no capture. Six of the durable sources are unreviewed FCC videos; capture never substitutes for review.
- The 78-row scenario workbook was inspected as a SECONDARY_REFERENCE and completed an adversarial coverage pass; it cannot independently establish procedures.
- The announcement screenshot was visually reviewed but is future-facing for Ground and does not establish current Ground procedure.

## Google Drive status

The visible Chat Bot folder had 17 direct files and no visible subfolders. All 17 have complete source reviews. Review completeness is separated from evidence authority:

- SRC-GDRIVE-FILE-0003 is fully reviewed but remains a `SECONDARY_REFERENCE`; unsupported workbook answers are excluded.
- SRC-GDRIVE-FILE-0017 is fully reviewed but remains time-sensitive and cannot establish current Ground availability.

The connected Drive account still cannot enumerate the supplied folder: on 2026-08-09 the exact-folder listing returned zero children and a folder-only `Chat Bot` search returned no result. Because the authenticated browser exposed and archived 17 children, the empty connector result is classified as an account/access limitation rather than evidence of an empty source folder; see `validation/google_drive_connector_access_audit.md`.

## MyGroundBiz status

- Authenticated home page and 86 global-navigation destinations were mapped.
- Eighteen reviewed/partially reviewed navigation destinations have primary source rows; the other 68 are explicitly preserved one-for-one in the authenticated destination backlog.
- The P&D On the Road landing page and five linked guide identities were mapped.
- Current hazmat, accident reporting, qualification certification, security, pickup coordination, ISP Agreement, DOT/CSA, equipment, trailer coupling, heat/dry-ice, OP-201, and Authenticated Delivery pages have been reviewed.
- The Safety Topic Library was fully expanded and all 77 displayed documents were inventoried; individual PDF content review remains incomplete.
- The 77 Safety Topic listings resolve to 74 unique URLs: Dog Bite Prevention is fully reviewed from seven page-addressed viewer renders, and the other 73 unique documents are explicit, duplicate-aware acquisition backlog rows.
- A validator-enforced 289-resource queue covers all five partially reviewed primary sources, 41 accessible but unreviewed primary resources, nine fully reviewed sources lacking original source bytes, and the remaining direct Safety Topic, exact monthly news-archive, and unreviewed navigation backlogs. It distinguishes five `PARTIAL_REVIEW_OPEN`, 35 `UNREVIEWED_PRIMARY_OPEN`, six `UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN`, nine `REVIEWED_DURABLE_CAPTURE_OPEN`, and 234 `UNACQUIRED_OPEN` rows. The six 2017 FCC videos and the version-ambiguous pickup sheet are deferred; the latter contributes no active code or procedure entries. Current OP-321 is the pickup-code target. Newly discovered linked forms, guides, and broken endpoints remain explicitly inventoried. Monthly archive pages span January 2015-August 2026 as exposed by the source; titles never substitute for content review.
- A 100-row news-archive ledger exactly reconciles every `archive=YYYY-MM` link in the Recent Customer Alerts link capture, validates displayed month labels against URL parameters, and requires authenticated capture of every archive page plus complete article/pagination inventory. It does not invent missing months or infer article relevance from archive labels.
- Fifteen acquisition targets carry 64 exact impact links covering 45 non-verified records, so a captured page immediately identifies the records requiring review; unreviewed Safety Topic titles deliberately carry no inferred impacts. Thirteen queued sources also carry 22 exact current-evidence links covering 18 records.
- OP-130, OP-132, and Dog Bite Prevention are fully reviewed. OP-135, the current five-page P&D equipment terms, and the sample ISP Agreement remain partially reviewed. Dog Bite Prevention pages 3-6 support exact avoidance, approach, knockdown, and wound-response guidance; original PDF bytes remain a recapture target. OP-135 now has checksum-preserved upper views for all five pages, but cropped lower regions of pages 2-5 and the original PDF remain unavailable.
- Drive copies with matching titles/dates have been fully reviewed, but portal-download byte identity has not been established.
- Destination-page review, search/news/video review, and downloadable-resource acquisition remain incomplete.
- The latest authenticated browser pass ended when the session returned to sign-in. The site search endpoint was mapped, although exact-number queries returned an unfiltered 955-result set.

## Known missing referenced sources

The authoritative acquisition ledger is `inventory/referenced_source_backlog.csv`, with 42 open source obligations and reviewed-source origins. Key identified items include:

Those obligations are now backed by 63 exact origin-source occurrences in `inventory/referenced_source_occurrences.csv`. Each occurrence identifies the reviewed source and page, section, or workbook row that established the gap; a reference title or identifier is never treated as evidence of the missing source's contents. The latest adversarial pass added the original 2025 Driver Safety Guidebook and Company Safety and Operation Handbook as explicit acquisition obligations because the secondary workbook cannot establish their railroad, flooded-road, winter, dog, backing, overhead, or route-help procedures.

A deterministic 40-row acquisition-coverage projection now reconciles every obligation to the authenticated queue and preserves exact direct, contextual, and currently unlinked states. Contextual links identify record-resolution pages only and never assert that those pages contain the missing source.

The following are referenced by reviewed sources but absent from the supplied Drive snapshot:

- The service provider's executed ISP Agreement and controlling schedules/attachments; an official 2026 sample agreement is inventoried and partially reviewed.
- OP-324 Service Measurement Status Codes Reference Card.
- OP-321 Pickup Reason Codes Card.
- Current OP-207 and OP-207Res instructions.
- HZ-035 Hazardous Materials Reminder Card.
- SF-034 and the unresolved SF-035 reminder-card identifier named in different reviewed sources.
- SF-920P Safety Information Guide.
- Current approved ERG edition and Hazardous Materials Prohibited/Acceptable Labels Decal 20159S.
- Relay check-out/check-in instructions.
- Detailed current vehicle, anti-theft, and security standards linked from the reviewed portal pages.

## Coverage interpretation

Full review means the accessible source was examined in its entirety. It does not mean every statement has already been promoted into a structured knowledge record. Structured extraction and cross-source reconciliation remain in progress. The form/artifact ledger additionally prevents a fully reviewed photograph from being mistaken for a current identified form.

## Current structured extraction

- 138 operational knowledge records: 83 VERIFIED, two CONFLICT, thirty-two HUMAN_REVIEW_REQUIRED, and twenty-one POTENTIALLY_OUTDATED.
- 50 delivery/status-code reference entries, including code 030 preserved as potentially outdated pending a current controlling source.
- Seven current/review-gated pickup-reason entries kept in a separate numeric namespace. Four version-ambiguous historical entries were deliberately excluded from the active reference layer.
- 342 source-to-knowledge mapping rows across 38 promoted evidence sources.
- 3,158 generated claim-provenance rows connect every current substantive rule/condition/step/documentation/prohibition/escalation/clarification/presentation claim to its exact record evidence set and supported scopes. The companion allocation ledger auto-allocates 1,820 single-fragment claims, preserves 859 reviewed multi-fragment allocations, and retains the gate for 479 pending multi-fragment claims.
- 690 driver-question variants in the retrieval-oracle index: 665 embedded in operational records plus 25 tagged supplemental test paraphrases that close per-record short/extended surface gaps without changing source truth.
- 185 driver-language validation cases covering all 138 operational records, including explicit misspelling, incomplete-language, terminology-error, ambiguity, safety, conflict, version, and source-limit cases, plus 33 validator-accountable multi-record interactions with explicit sufficiency and response-mode expectations.
- A 185-row clarification-strategy index gives every formal case ordered candidate facts and a stop rule; safety-priority cases require immediate protective action before clarification, and all conflict/source-limit/version-limit cases disclose their gate before gathering context.
- 42 form/physical-artifact coverage rows distinguish artifact access, procedure completeness, publication gates, official identifiers, and exact source/backlog/knowledge dependencies.
- An 89-row OP-117 page-coverage ledger reconciles every page to operational knowledge, normalized code data, a tracked local-contact artifact, or an explicit non-operational disposition; no page remains unclassified.
- A 246-row FORGE 2.8.0 page-coverage ledger reconciles every page to operational knowledge or an explicit front-matter/UI/icon/navigation/demo-fixture disposition; no page remains unclassified.
- A 407-row complete Drive-PDF page-coverage ledger reconciles every page across all 15 supplied PDFs to operational knowledge or an explicit reference, version, context, visual, or non-operational disposition; no page remains unclassified.
- A nine-row legacy-page supersession crosswalk proves that every `OLDER_*` page has a reviewed replacement knowledge/reference path and explicit remaining source gates; the audit found no distinct legacy-only procedure safe to promote as current guidance.
- 106 source-to-knowledge coverage rows reconcile every primary source to mapping counts, knowledge IDs, coverage disposition, evidence basis, and follow-up; 38 sources are mapped and all 68 zero-mapping sources are explicitly classified.
- 106 source-capture coverage rows independently reconcile review artifacts, durable archives, checksums, reproducibility limits, and required follow-up; hashed rendered pages preserve the complete dog source and exact reviewed OP-135 upper regions while both original PDFs and OP-135's cropped regions remain queued.
- A 138-row evidence-capture risk ledger projects those source-level limits onto every knowledge record: 133 use only durable evidence, one uses complete hashed rendered-page evidence, one mixes durable and transient evidence, two rely only on fully reviewed transient evidence, and one includes a partially reviewed hashed rendered source.
- Every `VERIFIED` record now has reviewable evidence. Dog safety is preserved as complete hashed rendered pages; accident-scene response remains capture-gated because OP-130 and OP-132 need durable recapture and OP-135 has only partial hashed renders rather than complete pages or original bytes.
- The workbook adversarial audit now provides a validator-exact ledger for all 78 rows: 53 directly covered, ten conditional/partial, four human-review, nine without authoritative evidence, one current-source contradiction, and one potentially outdated code. It identified the business/residential code mismatch, missing primary safety/handbook sources, an unsupported personal-phone-photo instruction, a missing PRC workflow, and several version/authority gaps.
- The complete rendered-page reinspection of current MGB-119 increased that source from five to eleven exact mappings. It added narrow corroboration for commercial/OP-201 release, classification accuracy, PPOD, package placement/care, and on-route security. The security branch now includes locked doors/bulkhead, closed windows between stops, and removal or key-lockbox security of keys whenever the vehicle is not operating. The pass also promoted the explicit Time Definite rule: deliver after a missed due time as soon as safely possible and make a same-day second attempt only for packages explicitly labeled FO, PA, PA+, or M&I. The undefined abbreviations remain verbatim and are mandatory clarification variables rather than inferred service names.
- A second OP-117 extraction audit promoted disputed-delivery prevention, drop-box configuration, facility vehicle-entry, weapons/screening, and general security-incident reporting records; it also separated verified ZIP re-entry from unresolved label-address correction authority.
- The fully reviewed source sparsity audit examined every source with two or fewer mappings. It now records the completed durable reinspection of `SRC-MGB-PAGE-0008` (a pickup-resource index whose child sources remain open) and `SRC-MGB-PAGE-0015` (high-level unsafe-driving context with no distinct procedure), while keeping landing/index child-source families open until their linked content is acquired and reviewed.
- The source-to-knowledge reconciliation audit makes all 106 source dispositions machine-checkable and exactly accounts for all 342 mappings; no zero-mapping source can silently pass without a basis and follow-up.
- The review-artifact reconciliation added source-specific records for all previously undocumented reviewed pages and containers, explicitly separating complete page review, incomplete durable capture, linked-child obligations, and evidence-role limitations.
- The source-identity audit cross-references five exact or strong MyGroundBiz/Drive document matches without falsely declaring byte identity. Authenticated portal downloads remain required for hash comparison, and the validator now rejects unknown inventory relationship IDs.
- The evidence-authority audit checks all 342 evidence objects, including the MGB-119 premium/time-definite/security reconciliation, no-safe-place/indirect-neighbor, placement-hazard, locker-failure, unlisted-pickup, route-security, shipper-authorized-release, security-incident-reporting, manual-barcode, camera-scan, Business Closure, Delete Scan, combo-stop, call-tag-scope, delivery-classification, non-HAL-transfer, designated-HAL-delivery, appearance/badge, hazmat-signature, dog-encounter, and OP-135 partial-render allocations, PPOD/locker/business-photo reconciliation, ISR, ASR, and door-tag branch-specific page allocation, and earlier page-splitting repairs, and enforces reviewed authority, exact locators, partial-source disclosure, and exact evidence/mapping locator equality.
- The decision-logic audit covers all 138 current records and the validator requires exact record/map identifier coverage.
- The status-queue audit reconciles all 55 non-verified records against the conflict, human-review, and potentially-outdated indexes, clarifies the zero-record generic unresolved status, and enforces exact report/status validation.
- A 55-row non-verified resolution ledger assigns every exception record an exact evidence/decision requirement, authority class, publication gate, and source/acquisition dependency; 46 link to structured source gaps and 49 to authenticated queue targets.
- Resolution-to-backlog reconciliation repaired 36 asymmetric affected-target links and now validator-enforces both directions, allowing any acquired source to identify every non-verified record requiring reconsideration.
- The question-variant audit indexes all 665 embedded variants plus 25 supplemental test surfaces, preserves threshold-discovered collision pairs plus semantic refusal/damage/hand-sheet/pickup-sync/premium-reattempt/key-security/drop-box-barcode/dog-safety branches, and validator-enforces complete mapping, surface diversity, language-type signals, and explicit ambiguity tests.
- A 138-row record-language surface ledger proves that every record has at least four embedded variants, one formal case, one four-token-or-shorter surface, and one six-token-or-longer surface.
- The taxonomy audit reconciles all 138 records to valid root-to-child paths across 57 evidence-discovered nodes; 56 are record-backed and the missing relay procedure is the sole sourced coverage exception.
- A 57-row taxonomy-readiness ledger preserves status and evidence-readiness gating for every discovered node, including the Relay source-gap node with no operational record.
- The navigation-coverage audit made all 87 destinations accountable through source or backlog reconciliation enforced by validation.
- The Safety Topic Library audit reconciled all 77 listings, three duplicate-URL groups, one fully reviewed rendered-page source, and 73 unique unacquired documents under validator-enforced backlog coverage.
- The archive-integrity audit added checksum coverage for the complete ZIP and now enforces exact equality among all 18 Google Drive archive objects, inventory paths, disk contents, and SHA-256 manifest entries.
- The reference-namespace audit made all 57 active code/reason records explicitly namespaced, documented six delivery/pickup number collisions, and added source-authority and collision-warning validation.
- The referenced-source audit consolidates 42 scattered missing cards, forms, manuals, agreements, safety guides, and controlling workflows into a source-origin/affected-target backlog enforced by validation.
- A 63-row referenced-source occurrence ledger gives every one of those backlog/origin relationships an exact page, section, or workbook-row locator and is regenerated and compared exactly by the corpus validator.
- The form/artifact audit maps 42 driver-used documentation artifacts, proves that neither photographed hand sheet can be identified as a current "Blue Sheet," preserves the SF-035 versus HZ-035/SF-034 identifier discrepancy without guessing, treats OP-117's blank local-contact table as locally configurable, and separately tracks the unidentified Alternate Signature record sheet.
- The relationship-graph audit reconciles 307 directed context links, connects later FORGE, placement, split Drop Box, and dog-safety workflow records to source-supported companion procedures, and requires explicit justification for the three records that remain intentionally isolated.
- The temporal/version audit verified date coverage and chronology across all 106 primary sources, 138 general records, 137 customer-alert records, and 342 general-record evidence objects; it status-gates time-sensitive evidence and preserves the malformed Safety Topic Library date `12/31/0` as an unresolved source display rather than inferring a year.
- The Recent Customer Alerts page is segmented into 138 validator-exact alert rows with source line ranges and SHA-256 segment hashes. A segmentation audit recovered two previously merged headings: a July 2025 `UPDATED` Kroger alert and an April 2024 LeMans alert using a two-digit year. Every alert from 2023-2026 was fully reviewed and extracted into 137 customer-alert operational records with exact segment evidence. Fifteen current-page records are `VERIFIED`; 122 historical, expired, version-sensitive, or source-incomplete records are `POTENTIALLY_OUTDATED` and publication-withheld. Fourteen records permit a current customer-specific answer and one is reference-only. `SRC-MGB-PAGE-0023` is now `FULLY_REVIEWED`; linked child resources remain independently gated.
- The claim-level provenance audit normalized exact locator mismatches, maintains a deterministic 3,158-claim traceability index, and rejects stale claim text, evidence sets, source scopes, statuses, non-exact evidence/mapping locators, or allocation classes inconsistent with evidence cardinality. It explicitly prevents the 1,338 multi-fragment claims from being represented as exact claim-fragment assignments before human allocation.
- The claim-to-evidence allocation pass created exact one-row-per-claim production gates: 1,820 single-fragment claims are auto-allocated, 859 multi-fragment claims are human allocated, and 479 remain pending. Reviewed allocation batches repaired damage, security, media, alcohol, pickup-scan, SenseAware, delivery-attempt-limit, delivery-scan-integrity, DSR, ISR, ASR, door-tag, PPOD/PPODA/PPODB, residential no-safe-place/indirect-neighbor, placement-hazard, locker-failure, premium/time-window, unlisted-pickup, Drop Box connection/settings/holiday/early-last/serial, ordinary route-security, shipper-authorized-release, security-incident-reporting, manual-barcode, camera-scan, Business Closure, Delete Scan, combo-stop, call-tag-scope, delivery-classification, non-HAL-transfer, designated-HAL-delivery, appearance/badge, hazmat-signature, and dog-encounter guidance while preserving unsupported branches as explicit source limits.
- The non-verified-answer publication audit makes the complete-procedure limitation explicit at the start of all 32 human-review answers and validator-enforces source-limit, conflict, currency, verification-action, and escalation disclosures across all 55 non-verified records.
- The record-level driver-language pass found and closed ten untested-record gaps. The validator now enforces full record coverage and distinguishes direct, clarification-dependent, source-limited, version-sensitive, and conflict-withheld responses.
- The language/adversarial pass discovered that ordinary recipient refusal existed only as code 006 rather than a complete operational record. `KNO-DEL-REFUSED-001` now preserves the verified code condition, withholds the unsupported post-code procedure, distinguishes ASR/call-tag/COD branches, and adds the controlling workflow as referenced-source gap 29.
- The delivery-status translation audit classifies all 50 codes: 20 have operational record coverage, three are auto-applied references, 21 remain definition-only workflow gaps, four are outside Ground operational scope, and two are status-limited. It promoted source-complete code-001 security-prevention and code-010 damage-inspection procedures without inventing steps.
- The pickup-reason translation audit classifies all seven active separate-namespace reasons: code 26 has a complete operational record, five reasons remain record-linked but status-limited pending OP-321, and Express cancellation reason 21 remains outside approved Ground guidance. Version-ambiguous historical reasons 01, 14, 16, and 25 are excluded.
- The duplication/fragmentation audit reviewed all near-similar record pairs, retained materially distinct branches, and repaired related-record graphs. Later source passes checked added records for distinct scope and connected each to applicable companion branches; the concise-answer audit now covers all 138 records.
- Future production knowledge storage, retrieval, versioning, update, status-gating, and publication recommendations are documented without changing the Ready Route application.
- The goal completion matrix maps every requested control and deliverable to current evidence and explicitly records why full-corpus completion is not yet proven.
- The inventory consistency audit corrected OP-132/OP-135 review states, reconciled 17 navigation/source-inventory mismatches, and added a validator gate preventing future cross-ledger status drift.
