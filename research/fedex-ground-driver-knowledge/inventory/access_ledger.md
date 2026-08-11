# Source Access and Review Ledger

Last updated: 2026-08-10

## Source systems

| Source system | Entry point | Access state | Mapping state | Notes |
| --- | --- | --- | --- | --- |
| Google Drive connector | Supplied shared folder | Inaccessible to connected connector account | Blocked at root | On 2026-08-09, exact-folder listing returned zero children and folder-only search returned no `Chat Bot` result. Browser access is tracked separately. |
| Google Drive browser | Supplied `Chat Bot` folder | Accessible | Direct-child inventory complete | Authenticated browser exposed 17 files and no visible subfolders. The complete ZIP plus all 17 extracted files have validator-verified SHA-256 checksums. |
| MyGroundBiz | Authenticated in-app browser session | Authentication restored and used for the latest 2026-08-09 current-source pass | In progress | The session exposed the November 2025 ISP Equipment Terms, January 2026 Vehicle Appearance FAQ, and April 2026 English SRS/SRI FAQ. Page-addressed visible regions were hash-preserved; original PDF bytes and cropped lower regions remain unavailable. The session is short-lived, so current mainstream sources remain ahead of historical archives. |
| Local Ready Route repository | Workspace | Accessible | Not yet formally inventoried as an evidence source | Application code is out of scope for this knowledge-acquisition phase unless it contains supplied operational evidence. |

## Fully reviewed

- `SRC-GDRIVE-BROWSER-ROOT-0001` — all 17 direct children inventoried and archived; no visible subfolders.
- `SRC-GDRIVE-FILE-0001` — Customer Experience Quick Reference, 2/2 pages.
- `SRC-GDRIVE-FILE-0002` — OP-119 Customer Experience Guide, 16/16 pages.
- `SRC-GDRIVE-FILE-0004` — Focus on Package Placement, 12/12 pages.
- `SRC-GDRIVE-FILE-0005` — FORGE Business Closure, 1/1 page.
- `SRC-GDRIVE-FILE-0006` — FORGE Call Tags, 3/3 pages.
- `SRC-GDRIVE-FILE-0007` — FORGE Delayed Login, 5/5 pages.
- `SRC-GDRIVE-FILE-0008` — FORGE P&D Application Guide 3.00 / FORGE 2.8.0, 246/246 pages; business-release conflict recorded.
- `SRC-GDRIVE-FILE-0009` — FORGE Quick Start 1.0, 8/8 pages; potentially outdated.
- `SRC-GDRIVE-FILE-0010` — FORGE Settings, 6/6 pages; version discrepancy recorded.
- `SRC-GDRIVE-FILE-0011` — image-only Delivery Record examples/code tables, 1/1 page; source identity/version unresolved.
- `SRC-GDRIVE-FILE-0012` — image-only sheeting barcode guide, 1/1 page; source identity/version unresolved.
- `SRC-GDRIVE-FILE-0013` — Manifest Preview 4.5.0 guide, 14/14 pages.
- `SRC-GDRIVE-FILE-0014` — OP-117 v2 On the Road Reference Guide, 89/89 pages.
- `SRC-GDRIVE-FILE-0015` — Package Placement Quick Reference, 2/2 pages.
- `SRC-GDRIVE-FILE-0016` — Personnel Qualification Verification Flow, 1/1 page.
- `SRC-GDRIVE-FILE-0003` — all 78 workbook scenarios structurally and adversarially reviewed; retained as `SECONDARY_REFERENCE`. A fresh authenticated-browser download on 2026-08-10 matched the archived workbook exactly (`635015616167bfa95e24905a1ff8fa97cd80c6c7d4aa485f5c0e20e5c945989f`), confirming that the reviewed source is the current Drive file.
- `SRC-GDRIVE-FILE-0017` — complete announcement screenshot reviewed; retained as time-sensitive, future-facing Ground evidence.
- `SRC-MGB-PAGE-0001` — complete On the Road landing page and 38-link inventory captured; five child guide downloads remain independently gated.
- `SRC-MGB-PAGE-0008` — complete Customer Experience and Pickup Coordination index captured; eleven documents and six videos discovered and inventoried as unreviewed child sources.
- `SRC-MGB-PAGE-0024` — Customer Alerts navigation redirect to `SRC-MGB-PAGE-0023` verified and durably recorded.
- `SRC-MGB-PAGE-0023` — complete rendered Recent Customer Alerts page and link inventory captured and fully reviewed. All 138 distinct alert segments from 2023-2026 are status-gated and represented in the time-aware customer-alert layer. A segmentation audit recovered an `UPDATED` Kroger heading and a two-digit-year LeMans heading that the first parser had merged into adjacent alerts. Seven accessible child resources and two exact broken links remain independently tracked; full parent review does not imply child-source review.

Each file above received complete content review using the appropriate text, workbook, or visual method. Evidence authority and time sensitivity are tracked separately from review completeness. Detailed source notes are in `reviews/`.

## Partially reviewed

- `SRC-MGB-ROOT-0001` — authenticated home page and 86 global-navigation destinations mapped; destination pages, search, news archive, videos, and cross-references remain.
- `SRC-MGB-DOC-0008` — page 1 completely reviewed, all five page identities and upper visible regions reviewed, and six renders checksum-preserved; cropped lower regions of pages 2-5 and original PDF bytes remain.
- `SRC-MGB-DOC-0009` — official 89-page sample ISP Agreement identity/first page reviewed; full review and executed-agreement comparison remain.
- `SRC-MGB-DOC-0010` — ISP Equipment Terms page 1 of 5 reviewed; no unseen specification is inferred.
- `SRC-MGB-DOC-0011` — all seven Dog Bite Prevention pages reviewed from the checksum-preserved original PDF; pages 3-6 support the animal-encounter safety record.

## Not yet reviewed

- Sixty-seven mapped MyGroundBiz destinations remain `NOT_YET_REVIEWED`/`PENDING_ASSESSMENT` in `inventory/mygroundbiz_destination_backlog.csv`; every page and its linked/downloadable resources require authenticated capture and assessment.
- Twenty-two MyGroundBiz primary children remain `NOT_YET_REVIEWED`: five On the Road guide downloads, eleven pickup-coordination documents, and six embedded FCC videos. The six exact videos are now durably acquired and hashed, but their playback metadata exposes no speech-caption tracks and complete audio-visual review remains open. Titles, parent-page context, and durable acquisition do not establish their contents.
- Seventy-three unique Safety Topic Library document URLs remain in `inventory/mygroundbiz_safety_topic_backlog.csv`; Dog Bite Prevention is the sole matched child primary source and is now fully reviewed.
- The Safety Topic Library displayed `12/31/0` for `MGB-SAFETY-TOPIC-0077`; the raw value and unresolved status are preserved in `inventory/date_ambiguities.csv`, and no date is inferred from the filename.
- Forty-two explicitly referenced or controlling source obligations remain in `inventory/referenced_source_backlog.csv`; 63 exact origin occurrences in `inventory/referenced_source_occurrences.csv` trace them to reviewed pages, sections, or workbook-row ranges that exposed the gap. They include named forms/cards and source families such as the executed Agreement, relay, current FORGE, coupling, dispute, COD, international guidance, ordinary-refusal disposition, status-specific workflows, the current ERG, decal 20159S, the unresolved SF-035 reminder-card identifier, the unidentified Alternate Signature physical record sheet, the cited 2025 Driver Safety Guidebook, and the cited Company Safety and Operation Handbook.
- A 39-row referenced-source acquisition projection shows six gaps with both direct and contextual queue links, two with direct-only links, five with contextual-only links, and 26 with no current authenticated-queue link. Seventeen unlinked gaps are P0 blockers and require targeted authorized discovery; a contextual resolution page is not treated as proof that it contains the missing source.
- Reinspection with durable content capture for `SRC-MGB-PAGE-0015` (Unsafe Driving); the visible page was previously marked reviewed but produced no structured mappings and needs stronger extraction evidence.
- The exact MyGroundBiz-download copies of `SRC-MGB-DOC-0001` through `0005`; Drive copies with matching titles/dates are reviewed, but portal checksum identity is not yet established.
- Operational artifacts referenced by OP-117 but absent from the Drive snapshot, including OP-324, OP-321, current OP-207/OP-207Res instructions, HZ-035, SF-920P, relay check-in/out, and vehicle-security standards.
- OP-130, OP-132, and OP-135 are fully reviewed from checksum-preserved originals. OP-324, OP-321, current OP-207/OP-207Res, HZ-035, SF-920P, relay check-in/out, and linked vehicle-security standards remain open.

## Inaccessible

- `SRC-GDRIVE-ROOT-0001` — the connected Drive account cannot enumerate the supplied folder: the exact URL returns zero children and folder search does not find `Chat Bot`. This does not block the browser-acquired snapshot, but it prevents connector metadata/identity verification.
- The MyGroundBiz session was restored and verified on 2026-08-09. Current page-addressed captures now cover all OP-135 pages (page 1 complete, pages 2-5 upper only), pages 2-5 upper regions of the November 2025 ISP Equipment Terms, both upper regions of the January 2026 Vehicle Appearance FAQ, and all eight upper regions of the April 2026 English SRS/SRI FAQ. Each remains partial where cropped regions or original bytes are missing. The current/mainstream overlay prioritizes controlling driver procedures and forms; the six 2017 FCC videos remain deferred.

## Knowledge extracted

- An evidence-discovered taxonomy currently contains 57 nodes and 27 cross-procedure relationships.
- Its 57-row readiness projection identifies 21 all-verified/durable nodes, 26 mixed-status nodes, nine populated nodes with no verified record, and the source-gated empty Relay branch; no all-verified branch currently has a capture gap.
- Forty-nine source-review records preserve page coverage, interpretation limits, version risks, and reconciliation needs.
- The full 246-page FORGE 2.8.0 application guide has been mapped, read, and visually reviewed; its operational branches are now available for structured extraction.
- OP-117 has a deterministic 89-row page-to-knowledge/reference/artifact/disposition ledger with no unclassified page. The page audit repaired missing page-26 business-release and page-75 hazmat-paperwork locators and tracks page 89's blank local-contact table without inventing contact data.
- The 246-page FORGE 2.8.0 guide now has a deterministic page-to-knowledge/disposition ledger with no unclassified page. The pass added source-gated records for multicode scanning, first launch, login/dispatch, language, routine delivery/pickup, unmanifested delivery, hazmat delivery signature, Alternate Signature, messaging, and device diagnostics.
- All 407 pages across all 15 supplied Drive PDFs now have deterministic page-to-knowledge/disposition accountability. The remaining-PDF pass added source-bounded pickup-service terminology, delivery-attempt-limit, pickup-scan-integrity, display/navigation-settings, and manifest-search records without promoting older/version-sensitive material as current.
- All nine pages classified as older status/version references now have a validator-enforced supersession crosswalk to reviewed current sources, modeled knowledge/reference data, and remaining OP-324/OP-321/current-FORGE gaps. No legacy-only procedure was promoted.
- The authoritative JSONL layer currently contains 144 records: 90 VERIFIED, two CONFLICT, thirty-two HUMAN_REVIEW_REQUIRED, and twenty POTENTIALLY_OUTDATED.
- The status table is preserved separately as 50 structured code records, and seven pickup-reason entries are held in a separate namespace so overlapping numeric codes cannot be confused.
- A complete-for-current-layer procedural decision map and 192 driver-language validation cases now exercise shorthand, misspellings, incomplete phrases, incorrect terminology, ambiguity, source conflicts, safety priority, rare exceptions, forms, evidence custody, and multi-record retrieval. Validator floors preserve at least ten explicit misspelling, incomplete-language, and terminology-error cases; all 33 multi-record cases have exact risk-family accountability, every one of the 144 operational records has at least one case, and each case declares its expected information sufficiency and response mode.
- Every formal case also has a validator-exact clarification strategy and stop rule. Twenty-seven direct cases ask no questions; the remaining 165 order only branch, safety, review, escalation, or version facts and stop when the necessary context is established.
- The retrieval-oracle index now contains 724 driver-language variants: 699 embedded record variants and 25 tagged supplemental test surfaces. A 144-row coverage ledger proves every record has a formal case plus both terse and context-rich wording.
- A 42-row form/physical-artifact ledger distinguishes current reviewed forms, partial form reviews, described-but-unacquired artifacts, generic document types, the unidentified hand-sheet/Alternate-Signature artifacts, and OP-117's blank locally configurable contact table. An adversarial identifier scan found 29 source/record identifiers: 27 resolve to artifact rows and OP-117/OP-119 are explicitly classified as source-publication identifiers. It withholds unsupported form procedures and preserves SF-035 separately from HZ-035/SF-034 pending authoritative reconciliation.
- A 121-row source-to-knowledge coverage ledger reconciles every primary source to all 383 exact general-record mappings. Forty sources contribute general operational evidence; every zero-mapping source has an explicit inaccessible, unreviewed, container/landing/index, redirect, secondary, partial, durable-partial, duplicate-candidate, or reviewed-context disposition. Customer-alert evidence is additionally reconciled through the separate 138-row alert source-to-knowledge ledger.
- A 3,242-row claim-to-evidence allocation ledger auto-allocates 1,774 single-fragment claims and records human-reviewed exact allocations for all 1,468 multi-fragment claims across 65 records; zero allocation rows remain pending.
- A 144-row evidence-capture risk ledger separates operational knowledge status from evidence reproducibility: 136 records use only durable evidence, six use complete hashed rendered-page evidence, and two non-verified records rely on fully reviewed transient evidence. OP-135 is now preserved as original bytes; the remaining verified publication-capture gates are the six records supported by `SRC-MGB-DOC-0038` or `SRC-MGB-DOC-0039`.
- Four partially reviewed MyGroundBiz primary sources, 31 accessible but unreviewed portal resources, and seven fully reviewed portal sources lacking original-source capture join the open Safety Topic, monthly news-archive, and navigation work in a deterministic 272-resource queue. Its state fields distinguish four `PARTIAL_REVIEW_OPEN`, 25 `UNREVIEWED_PRIMARY_OPEN`, six `UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN`, seven `REVIEWED_DURABLE_CAPTURE_OPEN`, and 230 `UNACQUIRED_OPEN` resources. Current mainstream sources lead Wave 0; the version-ambiguous pickup sheet remains excluded from active knowledge and deprioritized in favor of current OP-321. Archive rows span January 2015 through August 2026 as exposed by the source and do not imply that missing months or child articles were reviewed.
- A validator-enforced 138-row customer-alert ledger gives every dated alert an exact line range, segment hash, customer/subject, date, displayed geography, review state, currency gate, and extraction gate. All 138 alerts are `FULLY_REVIEWED` and `EXTRACTED_TO_CUSTOMER_ALERT_LAYER`, yielding 137 records because two 2026 Alo Yoga alerts establish one procedure. A separate validator-exact 138-row source-to-knowledge ledger maps every alert segment to its record. Fifteen current-page records are `VERIFIED`; 122 historical, expired, version-sensitive, or incomplete records are `POTENTIALLY_OUTDATED` and publication-withheld. Fourteen records permit a current customer-specific answer and one is reference-only.
- Sixteen queue destinations expose 72 exact downstream links covering 49 non-verified records. These impacts are derived from the resolution ledger and validator-symmetric; unreviewed Safety Topic titles remain unassigned until content review.
- All 54 non-verified records now have an explicit resolution row identifying the required evidence or decision, owner class, source/acquisition dependencies, and publication gate. This prevents exception statuses from becoming indefinite prose-only queues.
- All 78 secondary-workbook scenarios received an adversarial coverage pass. Unsupported workbook answers remain excluded from the authoritative layer; gaps and source targets are recorded in `validation/adversarial_workbook_gap_report.md`.
- A second OP-117 extraction audit promoted disputed-delivery prevention, drop-box configuration, facility vehicle-entry, weapons/screening, and general security-incident reporting, and clarified the narrow verified wrong-ZIP ReEnter branch.
- The fully reviewed source sparsity audit classified every source with two or fewer mappings, added current Security-page corroboration, and separated narrow-source coverage from index/child-source and authenticated-reinspection gaps.
- The driver-language coverage audit found ten untested records and added cases for all ten; the corpus integrity gate now fails on untested records or status-inconsistent answerability.
- The record duplication/fragmentation audit retained materially distinct branches and repaired eight related-record graphs. A complete concise-answer pass corrected seven version-sensitive FORGE answers whose short wording could otherwise appear current when detached from metadata.
- The requested future production storage/retrieval/version/update recommendations are preserved in `reports/production_knowledge_architecture_recommendations.md`; no product code was created or modified.
- The inventory consistency audit corrected stale OP-132/OP-135 review states and 17 MyGroundBiz navigation rows; navigation/source-inventory review and relevance status must now agree under the corpus validator.

## Unresolved

- Publication identity and currency of both image-only hand-sheet references.
- Exact relationship between Drive filename dates and internal document dates for OP-119 and several FORGE guides.
- Current MyGroundBiz availability of all externally referenced cards/guides.
- Whether the five Drive guide copies are byte-identical to the portal downloads.
- Ground launch date/status for FedEx Authenticated Delivery.
- Role-based authority for drop-box pickup-setting, holiday-date, and early-last-pickup changes.
- Full post-complaint Disputed Delivery case investigation and recovery procedure.
- Complete ordinary recipient-refusal documentation and final-disposition procedure after Status Code 006.
- Exact current OP-207/OP-207Res identity, form fields, cover/flap instructions, custody/submission sequence, and whether driver shorthand "Blue Sheet" refers to either form.
- Whether the April 2025 FORGE guide's SF-035 reminder-card identifier is a typo, an older/superseded card, a duplicate, or a distinct artifact relative to HZ-035 and SF-034.

## Conflicts

- OP-119 describes a limited preauthorized commercial tobacco/e-cigarette exception; OP-117 uses broader prohibition language. Requires source/scope review.
- Older hand-sheet status tables differ from the 2025 OP-117/MGB-119 lists.
- `FORGE Business Closure` and `FORGE Settings` filenames imply 2.2.0 while document labels show 2.0.0.
- The OP-119 filename indicates 10/28/24 while the document body says last update 9/9/24.
- FORGE 2.8.0 pages 83-85 demonstrate business release without an OP-201, while the newer OP-117 page 27 prohibits release when no OP-201 is on file. No approved driver answer may be issued until the controlling source is established.

## Potentially outdated

- FORGE Quick Start 1.0 (2023).
- Image-only hand-sheet guides with no visible revision identity and 2021-era examples.
- Any UI details superseded by FORGE 2.8.0 or later MyGroundBiz materials.
- The 2023 FORGE on-road device warning pending current wording and scope confirmation.
- Status code 030, present in 2024 OP-119 but absent from the reviewed December 2025 OP-117 list.
- FORGE 2.0.0 audio-setting behavior for non-disableable Delivery Instructions and Pickup Closing alerts.
- Manifest Preview 4.5.0 permission-gated availability behavior.
- FORGE 2.8.0 delivery-stop combine/split and pickup revisit/merge UI paths.
- FORGE 2.8.0 package/stop comments and manifest/list download/refresh behavior.
- FORGE 2.8.0 queued-sync and 30-minute delivery/pickup reminder behavior.

## Human review

- HOS and DOT/legal interpretations before commercial publication.
- Hazmat rules where external current cards/guides are missing.
- Qualification/employment implications from the personnel flow.
- Conflicting tobacco/e-cigarette language and any operational action based on package-content suspicion.
- Current-source approval for photographed hand-sheet examples and COD handling.
- Business release without an OP-201 because the April and December 2025 authoritative-source candidates directly conflict.
- Stolen-vehicle notification responsibility/order: OP-117 directs personnel to call GSOC before station/Linehaul management, while the current portal Security page assigns GSOC notification to FedEx representatives after personnel contact station/hub management.
- Suspected-fraud call-tag code 106 criteria, authorization, physical-tag handling, and documentation.
- Non-hazmat pickup packaging defects where OP-117 states condition expectations but does not establish a universal driver acceptance/refusal rule.
- Pickup Offer decline criteria; OP-117 states that decline rights are limited but does not define the permitted scenarios.
- Bulk manifest/pickup vehicle thresholds and count handling pending current operational and vehicle-classification corroboration.
- Address-correction authority for the FORGE Edit Address workflow.
- Current EOD/HOS/DVIR interpretation for vehicle, defect, return-time, and off-duty entries.
- Bulk-transfer authorization and physical custody reconciliation beyond the application UI.
- Login-warning legal/compliance resolution for medical card, CARB, HOS, qualification, agreement, and vehicle-record conditions.
- Drop-box configuration authority for pickup times, holiday dates, and early-last-pickup status.

## 2026-08-10 USB restoration and current recapture attempt

- Located the source-bearing original workspace at `/Volumes/USB322FD/readyroute` and copied the excluded `sources`, `captures`, and `reviews/video_visual` trees into the clone with existing clone files preserved.
- Post-copy comparison found no USB file missing from the clone. The clone is a strict superset and retains the later `SRC-MGB-DOC-0008` capture-manifest entry rather than replacing it with the older USB manifest.
- All 69 registered source/capture checksums and the complete portable/full-corpus validator stack pass. See `validation/workspace_restoration_audit_2026-08-10.md`.
- Attempted the exact current original-byte recapture URLs for `SRC-MGB-DOC-0038` and `SRC-MGB-DOC-0039`; MyGroundBiz returned `Access Denied` because the session had expired.
- Listed all 31 direct files in the connected supplied Drive folder. Neither safety PDF is present there. The two source-level original-byte gaps and their six publication-gated verified records remain open without weakening capture or status controls.

## 2026-08-10 candidate-gap current-source attempt

- Reconciled all 21 owner-supplied development knowledge-gap cases to existing acquisition/backlog targets, clarification-only handling, or an explicit new source/authority obligation in `validation/candidate_gap_queue_reconciliation.jsonl`.
- Tested the newest inventoried direct MyGroundBiz targets for the mainstream backing and railroad-crossing gaps: `MGB-SAFETY-TOPIC-0016` (Backing, 2026-04-20) and `MGB-SAFETY-TOPIC-0027` (Railroad intersections, 2026-02-23).
- Both exact URLs returned HTTP 403 with the same 3,313-byte access-denied body (SHA-256 `7e83b802e005a00ed298e93e5ae1595203888b43cd70660139db52320c0d25d4`). No response body was admitted as source evidence or copied into the corpus.
- The backing gap remains linked to `REFSRC-041`, `REFSRC-042`, and `MGB-SAFETY-TOPIC-0016`; the railroad gap remains linked to `REFSRC-041` and `MGB-SAFETY-TOPIC-0027`.
