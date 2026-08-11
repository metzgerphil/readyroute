# MyGroundBiz authenticated acquisition queue audit

Status date: 2026-08-10

## Purpose

Authenticated MyGroundBiz sessions have been short-lived. The source inventory plus destination, Safety Topic, and monthly-news backlogs prove the open workload, but they previously supplied no single session-efficient order. Successive audits added partially reviewed primary sources, fully reviewed sources lacking durable capture, accessible primary sources marked `NOT_YET_REVIEWED`, and exact monthly archives. Six FCC videos acquired from their MyGroundBiz-linked Brightcove records have now completed local audio-visual review and left the open queue; they remain preserved as 2017 historical manager-facing context without canonical mappings. On 2026-08-09 the user narrowed the active research priority to current, mainstream information affecting most contractors.

`inventory/mygroundbiz_authenticated_acquisition_queue.csv` unifies every open portal resource into a deterministic queue. It prioritizes durable acquisition while authentication is available without using page titles as operational evidence, declaring relevance before review, or removing any lower-priority source from scope.

## Exact coverage

- 266 queued resources total.
- Four partially reviewed MyGroundBiz primary sources: three require active completion and the rejected version-ambiguous pickup sheet is deferred in favor of current OP-321.
- 25 accessible MyGroundBiz primary resources requiring acquisition and complete review.
- Seven fully reviewed MyGroundBiz primary sources requiring original-byte or durable-page recapture. Two sources have complete hashed viewer renders, but not original PDF bytes.
- 71 unique unacquired Safety Topic documents remain in the queue after current source rows were reconciled.
- 100 exact monthly news-archive pages.
- 59 unreviewed navigation destinations, with one version-ambiguous source separately deferred.
- No current partial source, accessible unreviewed primary source, fully reviewed no-archive source, or backlog resource is missing or duplicated.
- Four rows are `PARTIAL_REVIEW_OPEN`; 25 are `UNREVIEWED_PRIMARY_OPEN`; seven are `REVIEWED_DURABLE_CAPTURE_OPEN`; 230 are `UNACQUIRED_OPEN`.

| Wave | Resources | Purpose |
|---|---:|---|
| `WAVE_0_PARTIAL_SOURCE_COMPLETION` | 3 | Finish the active current partial documents/pages before starting lower-completion resources |
| `WAVE_0_UNREVIEWED_PRIMARY_ACQUISITION` | 25 | Acquire and review open primary documents/pages; compare explicitly linked document candidates without assuming identity |
| `WAVE_0_DURABLE_RECAPTURE` | 7 | Preserve original bytes for fully reviewed documents/pages; two sources already have complete hashed viewer renders |
| `WAVE_1_DIRECT_DOCUMENT_ACQUISITION` | 71 | Archive every remaining known direct Safety Topic document URL first, while authentication is live |
| `WAVE_2_NEWS_ARCHIVE_DISCOVERY` | 100 | Capture each exact exposed monthly archive, inventory all articles and pagination, then assess relevance from content |
| `WAVE_2_GAP_LINKED_DESTINATIONS` | 10 | Capture destinations whose title/path intersects a known source gap or signals current safety/compliance/maintenance material |
| `WAVE_3_OPERATIONAL_FAMILY_DESTINATIONS` | 37 | Capture the remaining Safety, Operations, Vehicles/Fuel, and Agreement destinations |
| `WAVE_4_REMAINING_DESTINATIONS` | 12 | Capture all remaining News, Recognition, and vendor destinations for exhaustive assessment |
| `WAVE_5_DEFERRED_NONCURRENT_REFERENCE` | 1 | Retain the version-ambiguous pickup sheet without further review unless current authority is established |

## Gap-linked page targets

The queue connects captured navigation evidence—not presumed page content—to existing unresolved source obligations where a direct relationship is supportable from the title/path:

- FORGE Familiarization Guides → `REFSRC-022` current production FORGE documentation.
- Customer Service Case Automation → disputed-delivery, PRC, and ordinary-refusal gaps.
- Customer Alerts → definition-only status-specific workflow gap.
- Driver onboarding, P&D road tests, Qualified Observer, and qualification conditions → `REFSRC-028`.
- Driving Standards for Linehaul → `REFSRC-011` jurisdiction/current CDL-regulatory source gap.
- Vehicle Schematics and Alternative Vehicle Operations → `REFSRC-009` detailed vehicle/security standards.
- Trailer Pull Safety → `REFSRC-021` detailed equipment-specific coupling material.

These links direct research; they do not claim that the page contains or resolves the identified source.

## Capture versus review

Wave 0 partial-document completion requires a local archive and checksum, page-count verification, review of every unseen page, source-status reconciliation, and inventory of newly discovered references. Wave 0 partial-page completion requires a durable complete-page capture, linked-resource inventory, and full source-status reconciliation. Existing page-one or landing-page review is not enough.

Wave 0 unreviewed-primary work requires durable bytes or a complete page capture, checksum where applicable, complete content review, reference inventory, and explicit reconciliation against any supplied Drive candidate named by `candidate_comparison_source_ids`. Candidate links support comparison only; they do not establish byte identity, duplicate status, authority equivalence, or supersession. The six 2017 FCC videos have satisfied acquisition, checksum, complete audio-review, and complete visual-review gates; because they provide historical manager-facing FCC/STAR context rather than current driver guidance, they create no canonical mappings and no longer appear in the open queue.

Wave 0 durable-document recapture requires downloading the exact portal document, hashing it, reconciling identity/version with any candidate Drive copy, and updating the source row. Durable-page recapture requires a complete authenticated page capture plus linked-resource inventory. These rows are already `FULLY_REVIEWED`; recapture improves reproducibility and change detection but does not, by itself, expand or promote operational knowledge.

Wave 1 completion requires download, archive, checksum, page-count identification, a primary source row, complete page review, and reference inventory. Merely downloading a PDF does not change its review or relevance status.

Destination completion requires a durable complete-page capture, primary source row, linked-resource inventory, and reconciled review/relevance status. Opening a page or recording its title is insufficient.

Monthly-archive completion requires a durable archive-page capture plus exhaustive article and pagination discovery. An archive month or article title is never treated as operational evidence.

## Work state and completion evidence

`work_state` and `state_basis` are derived, not manually asserted:

- Wave 0 rows are `PARTIAL_REVIEW_OPEN` because their authoritative source-inventory rows are `PARTIALLY_REVIEWED`.
- Unreviewed-primary rows are `UNREVIEWED_PRIMARY_OPEN` when their authoritative source-inventory rows are `NOT_YET_REVIEWED`, `ACCESSIBLE`, and have no local archive.
- Durable-recapture rows are `REVIEWED_DURABLE_CAPTURE_OPEN` because their authoritative source-inventory rows are `FULLY_REVIEWED` while `local_archive_path` is empty.
- Safety Topic, monthly archive, and destination backlog rows are `UNACQUIRED_OPEN` because their backlog rows are open and their source-inventory state is `NOT_CREATED`.

The queue is an open-work view. Once a completion gate is actually satisfied, the authoritative source and backlog records must be reconciled; the resource then leaves the next deterministic build. Its local archive, checksum, review artifact, source row, and mappings—not disappearance alone—are the durable completion evidence.

## Downstream record impact

The queue now derives `affected_nonverified_knowledge_ids` from `knowledge/nonverified_resolution_coverage.csv`:

- 8 queued resources have a known record-review impact.
- They contain 20 resource-to-record links covering 13 unique non-verified records.
- The remaining links target refusal, qualification, login-warning, vehicle, HOS, and security gaps through exact source/backlog relationships.

The remaining impacts are distributed among SRS/SRI, Customer Service Case Automation, trailer safety, qualification/onboarding pages, Driving Standards, CARB, vehicle schematics/Alternative Vehicle Operations, and qualification conditions.

The queue also derives two recapture-oriented fields without title inference:

- 7 queued resources have 12 exact links to records that currently cite the resource in `evidence[].source_id`.
- 15 queued resources have 49 taxonomy links covering 16 taxonomy IDs, derived from the exact union of their non-verified dependency records and current-evidence records.
- A current-evidence link means the queued source currently supports the named record and its durable capture must be reconciled. It does not mean recapture changes the record's status.

All 73 Safety Topic documents currently have blank affected-record, current-evidence, and taxonomy sets. That is intentional: their titles and URLs establish acquisition identity but do not establish which procedures they support. Impacts may be added only after complete content review creates source-backed relationships.

Partial-completion resources may have blank non-verified dependency sets because no non-verified resolution row currently names those source IDs; this does not relax their completion gates. Unreviewed primary resources may have blank operational-impact fields because their content is not yet reviewed; exact Drive IDs are comparison targets only. The seven recapture rows are independently required by missing original/durable capture even when every impact field is blank. A blank impact field never removes a source from the workload and does not establish irrelevance.

## Safeguards

- Every priority basis says explicitly that titles/navigation are discovery metadata only.
- Wave 4 is an ordering choice, not an exclusion or low-relevance finding.
- All 230 backlog resources remain open/not-created until the applicable completion gate is satisfied; all four partial sources remain `PARTIALLY_REVIEWED`; all 25 unreviewed primary resources remain `NOT_YET_REVIEWED`; and the seven recapture sources remain `FULLY_REVIEWED` while their original/durable-capture gap stays open.
- Linked source-gap IDs must exist in the referenced-source backlog.
- Newly acquired resources must still pass authority, exact-locator, status, version, and no-invention controls before supporting knowledge.

## Automated control

`scripts/build_mygb_acquisition_queue.py` regenerates the 266 rows from the current MyGroundBiz partial-source set, accessible unreviewed-primary set, fully reviewed no-archive source set, and the three authoritative backlogs, then derives work state, state basis, comparison candidates, and affected-record sets from their controlling ledgers. It fails until its explicit session-priority order is reconciled whenever the partial-source set changes. `scripts/validate_corpus_integrity.py` rejects stale output, missing/extra/duplicate resources, noncontiguous ordering, invalid types, waves, states, or bases, missing capture/completion instructions, unknown gap IDs, any partial source outside its Wave 0 completion wave, any accessible unreviewed primary source outside its Wave 0 acquisition wave, captured/unacquired state drift, invalid candidate comparison IDs, any reviewed no-archive source outside durable recapture, any direct Safety Topic document outside Wave 1, any monthly archive outside its discovery wave, or any queue/resolution impact mismatch in either direction.

## Limitation

This makes the remaining work efficient and auditable. All remaining rows are acquisition, partial-review completion, or recapture work. Full goal completion still requires satisfying all 266 queue completion gates or explicitly documenting any item that remains inaccessible.
