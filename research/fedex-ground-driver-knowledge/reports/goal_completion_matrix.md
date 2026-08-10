# Goal requirement-to-evidence completion matrix

Status date: 2026-08-09

This matrix distinguishes completed controls from full-corpus completion. A validated artifact is not proof that inaccessible, linked, or unreviewed source material contains no additional operational knowledge.

## Governing scope and accuracy

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Knowledge phase only; do not build the Ready Route application/chatbot | Achieved to date | Research files are isolated under this directory; README states the boundary; no application functionality was changed. | Preserve boundary until separately authorized. |
| Use only authorized supplied sources | Achieved to date | README evidence rule; every knowledge record contains inventory-backed evidence IDs; corpus validator checks source existence. | Continue the same rule for all new acquisitions. |
| Never invent an operational answer | Achieved to date for current records | Required evidence, knowledge statuses, conflict/unresolved reports, status-aware language cases, concise-answer audit, and validator-enforced publication-safety contract across all 55 non-verified answers in `validation/nonverified_answer_publication_safety_audit.md`. | Human review and missing-source resolution remain. |
| Prefer no approved answer over unsupported guidance | Achieved to date | Conflict, human-review, outdated, and response-mode gates in records/cases. | Future product must enforce these gates in code. |

## Source environment and inventory

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Inventory supplied Google Drive folders/files | Achieved for visible supplied folder snapshot | `inventory/source_inventory.csv`, access ledger, complete ZIP plus 17 archived direct files, exact validator-enforced SHA-256 coverage, and the 2026-08-09 connector recheck documented in `validation/google_drive_connector_access_audit.md`. | Connector/API identity and revision verification remain inaccessible; empty connector results are not treated as proof of an empty folder. |
| Review relevant Google Drive contents, not filenames only | Achieved for all 17 visible direct files | Per-source reviews, page text/render review, workbook adversarial audit, and screenshot review. | Workbook remains secondary reference and announcement remains time-sensitive, but those are evidence-role limits rather than incomplete reviews. |
| Map MyGroundBiz menus and destinations | Partial | 86 navigation destinations mapped; 18 have primary source rows and the remaining 68 are exact, validator-enforced backlog rows documented in `validation/mygroundbiz_navigation_coverage_audit.md`. | Authenticated review of all 68 backlog destinations remains incomplete. |
| Review MyGroundBiz operational pages, guides, FAQs, linked/downloadable resources | Partial | The complete Recent Customer Alerts page is fully reviewed across all 138 segments. Other current portal pages, OP-130/132, and all seven Dog Bite Prevention pages are reviewed; all 77 Safety Topic listings and all 100 exact monthly news-archive links remain validator-accountable. A 289-resource queue covers four partial reviews, 36 uncaptured primary resources, six durably captured but unreviewed FCC videos, nine original-byte recaptures, and the remaining safety, archive, and destination backlog. | Complete Wave 0 review/acquisition gates, then acquire/review the safety, archive, and destination source families including article and pagination discovery. |
| Inventory obscure/manager/contractor material that can affect drivers | Partial | ISP, qualification, equipment, CSA/DOT, safety-library, and agreement sources are inventoried. | Executed Agreement and many child sources remain unacquired/unreviewed. |
| Record inaccessible/uninterpretable sources | Achieved as a control | Source inventory, access ledger, source coverage report, and a validator-enforced review artifact for every fully or partially reviewed primary source. | Update whenever access changes. |
| Follow references to missing controlling material | Achieved as a tracking control | 42 open source obligations identify priority, reasons, and affected targets; a validator-exact 63-row occurrence ledger traces every origin relationship to an exact reviewed page, section, or workbook-row range. A deterministic 42-row acquisition projection distinguishes direct queue links, contextual resolution links, and currently unlinked gaps. See `inventory/referenced_source_backlog.csv`, `inventory/referenced_source_occurrences.csv`, and the two referenced-source audits. | Acquire and fully review all accessible backlog sources; targeted authorized discovery is required for gaps without a current exact queue route. Tracking is not completion. |

## Knowledge extraction and structure

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Discover taxonomy from evidence | Achieved for current corpus; branch readiness remains mixed | 56-node emergent `knowledge/taxonomy.json` with change history and relationships; 55 nodes are record-backed and Relay is an explicit sourced exception. A validator-exact 56-row readiness ledger projects record status, evidence capture, source gaps, and queue dependencies onto every node. | Extend only when new evidence warrants it; acquire Relay and resolve populated branches that still lack verified procedures. |
| Build authoritative knowledge, not disconnected FAQs | Achieved for current records | 137 structured general operational records plus 137 customer-alert operational records covering all 138 alerts from 2023-2026, with rules, conditions, sequences, time/currency gates, and exact source evidence; 122 historical or time-sensitive alert records are explicitly publication-withheld. The latest qualification and placement passes separated road test, observed hours, Qualified Observer eligibility, recertification, vehicle-size qualification, final activation gates, and delivery-placement hazard branches without inventing unexposed requirements. | Continue extraction from remaining source families and linked child resources. |
| Preserve ordered procedures | Achieved for current records | Validator enforces ordered steps; sequence/fragmentation audit found no verified one/two-step fragments. | Repeat for new records. |
| Preserve decision logic and clarification variables | Achieved for current records | `knowledge/decision_logic.md` covers 138/138 records; all records have clarification requirements; a validator-enforced 185-row clarification-strategy index orders case-specific facts, distinguishes safety/conflict/source/version preambles, and stops questioning once the permitted branch is established. | Add branches from future sources, which will fail validation until mapped and given case-specific clarification strategies. |
| Store complete rule separately from concise/More Info presentation | Achieved | Separate fields in every knowledge record; schema and concise-answer audit. | Future physical schema should preserve version separation. |
| Preserve conditions, exceptions, prohibitions, escalation, and documentation | Achieved as a structural invariant | Schema and knowledge validator. | Field presence does not prove full source coverage; continue source review. |
| Model relationships among procedures | Achieved for current records | 307 directed context links, taxonomy relationships, fragmentation audit, and exact standalone justification/graph validation documented in `validation/record_relationship_graph_audit.md`. | Future retrieval must follow relevant directed links without flattening statuses or conditions. |

## Evidence, status, and version control

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Trace every substantive instruction to source | Achieved at exact record-evidence-set level; individual claim-fragment allocation and production reproducibility remain partial | 342 evidence objects, 342 exact-locator mappings, and 3,158 deterministic claim rows cover every current substantive field/item and step. A one-row-per-claim allocation ledger makes 1,820 single-fragment and 859 reviewed multi-fragment claims trace-ready while withholding exact-fragment assertions for 479 pending claims. A 106-row source-capture ledger and 138-row record projection independently gate durable reproducibility; all 138 alert segments also have exact alert-to-record mappings. | Allocate exact supporting fragments for the remaining 479 multi-fragment claims; durably recapture 14 reviewed/partially reviewed portal sources. Dog safety has complete hashed renders; OP-135 and the rejected pickup sheet have partial hashed renders; all lack original PDF bytes. |
| Keep status codes and pickup reasons context-safe | Achieved for current references | All 50 `DELIVERY_STATUS` and seven `PICKUP_REASON` records have reviewed-source traceability, symmetric collision warnings, and validator-enforced operational-translation classifications documented in the delivery-status and pickup-reason translation audits. | Acquire current OP-324/OP-321 and the 21 definition-only delivery workflows; deliberately reconcile any code-set change. |
| Preserve exact locator and source date/version | Partial after controlled inventory recovery | Evidence objects and exact locators remain validator-complete; explicit review dates, known URLs, archive identities, and labeled version metadata were reconstructed from controlled companion ledgers and review artifacts. `validation/source_inventory_recovery_audit.md` records the recovery boundary. | Re-establish descriptive parent, subject/audience, and date/version cells that were not independently preserved; also resolve hand-sheet and filename/body ambiguities and malformed `MGB-SAFETY-TOPIC-0077` date without guessing. |
| Track VERIFIED, UNRESOLVED, CONFLICT, POTENTIALLY_OUTDATED, HUMAN REVIEW | Achieved | 83 verified, 2 conflict, 32 human-review, 21 outdated, and 0 generic-unresolved records; exact exception indexes are validator-enforced, and all 55 non-verified records have explicit evidence/decision, owner-class, dependency, and publication-gate resolution rows. | Resolve pending items only with controlling evidence/review. |
| Track duplicate/superseded sources | Partial | Dedicated safety, source-identity, conflict/outdated, candidate-comparison, and nine-page legacy-reference ledgers retain current known relationships. `validation/source_inventory_recovery_audit.md` discloses that some descriptive relationship cells in 73 reconstructed inventory rows were not independently recoverable. | Re-establish missing inventory relationship cells from authoritative evidence; five portal/Drive candidate pairs still require authenticated byte comparison, and the full supersession graph remains incomplete. |
| Provide future storage/retrieval/version/update recommendations | Achieved | `reports/production_knowledge_architecture_recommendations.md`. | Implementation remains out of scope. |

## Quality-control and adversarial passes

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Compare database against source inventory | Partial but substantial | A 106-row `inventory/source_knowledge_coverage.csv` exactly reconciles all 338 general-record mappings and classifies all 68 zero-mapping sources; a separate 138-row alert mapping reconciles every alert segment. The 89-row OP-117, 246-row FORGE, and 407-row all-Drive-PDF ledgers reconcile every page of all 15 supplied PDFs with no unclassified page; fully reviewed source sparsity audit; validator-enforced source/disposition equality. | Repeat after remaining MyGroundBiz/child sources are reviewed. |
| Investigate sources producing unexpectedly little knowledge | Achieved for current fully reviewed set | `validation/fully_reviewed_source_sparsity_audit.md` plus dedicated review artifacts for all 56 fully/partially reviewed primary sources. | Child-source families and transient-source recapture remain open. |
| Find duplicates, orphaned procedures, missing branches, fragmentation | Achieved for current record set | `validation/record_fragmentation_audit.md`; integrity validator. | Repeat after every extraction batch. |
| Verify concise answers do not omit critical steps or hide limits | Achieved for current record set | `validation/concise_answer_sequence_audit.md`; seven version-risk answers corrected. | Repeat after any record/status change. |
| Adversarially try to prove incompleteness | Partial | A validator-exact 78-row workbook ledger now classifies 53 directly covered scenarios, ten conditional/partial cases, four human-review cases, nine source-absent cases, one current-source contradiction, and one potentially outdated code; it also adds the cited Driver Safety Guidebook and Company Safety and Operation Handbook to the structured acquisition backlog. Source sparsity, unresolved/gap, nine-page legacy/reference supersession, and customer-alert completeness audits remain active. | Full adversarial completion cannot be proven before accessible source families and archive pages are acquired/reviewed. |
| Continue until additional passes yield little/no substantive knowledge | Not yet proven | The latest MGB-119 pass still found a substantive exact-label same-day reattempt branch plus five under-mapped corroboration scopes. | More source acquisition and repeated diminishing-yield passes required. |

## Driver-language validation

| Requirement | Status | Evidence | Remaining work |
|---|---|---|---|
| Generate diverse realistic questions from discovered source situations | Achieved for current records | 690 one-to-one indexed variants—665 embedded and 25 supplemental—plus 185 formal cases. A validator-exact 138-row ledger proves every record has terse and context-rich wording; global floors retain misspelling, incomplete-language, terminology-error, ambiguity, safety, conflict, version, and human-review signals. | Expand paraphrase depth with new sources and eventually execute the retrieval oracle after implementation is separately authorized. |
| Map every current knowledge record to a case | Achieved | 138/138 formal-case coverage, 690/690 variant indexing, and 138/138 short-plus-extended surface coverage are validator-enforced. | New records or variants fail validation until all layers are updated. |
| Determine whether information is sufficient to answer | Achieved for current cases | Explicit information-sufficiency and response-mode fields; validation report. | Runtime retrieval evaluation waits for separately authorized implementation. |
| Record failures and improve structure | Achieved for current pass | Ten untested records found/corrected; answerability fields added; graph/version-answer issues corrected. | Continue regression after changes. |

## Deliverable inventory

| Requested deliverable | Current artifact |
|---|---|
| Comprehensive structured operational knowledge database | `knowledge/records.jsonl` |
| Time-aware customer-alert operational layer | `knowledge/customer_alert_operational_records.jsonl`, `knowledge/customer_alert_review_coverage.csv`, and `knowledge/customer_alert_source_to_knowledge.csv` |
| Discovered taxonomy/sub-taxonomy | `knowledge/taxonomy.json` |
| Taxonomy status/capture/dependency readiness | `knowledge/taxonomy_readiness_coverage.csv` and `validation/taxonomy_readiness_audit.md` |
| Complete source inventory | `inventory/source_inventory.csv` plus safety-library child inventory |
| Source capture/reproducibility coverage | `inventory/source_capture_coverage.csv` and `validation/source_capture_coverage_audit.md` |
| Record-level evidence capture risk coverage | `knowledge/evidence_capture_risk_coverage.csv` and `validation/evidence_capture_risk_audit.md` |
| Source coverage report | `reports/source_coverage.md` |
| Source-by-source extraction reconciliation | `inventory/source_knowledge_coverage.csv` and `validation/source_knowledge_coverage_audit.md` |
| Source-to-knowledge mapping | `knowledge/source_to_knowledge.csv` |
| Referenced-source origin and exact-locator mapping | `inventory/referenced_source_occurrences.csv` |
| Form and physical-artifact coverage | `knowledge/form_artifact_coverage.csv`, `knowledge/artifact_identifier_exclusions.csv`, and `validation/form_and_physical_artifact_coverage_audit.md` |
| Procedural and decision logic map | `knowledge/decision_logic.md` |
| Driver situation library | Canonical situations in `knowledge/records.jsonl` |
| Natural-language variant library | Record variants, `validation/supplemental_driver_variants.jsonl`, and `validation/driver_language_cases.jsonl` |
| Secondary-workbook adversarial scenario coverage | `validation/workbook_scenario_coverage.csv` and `validation/adversarial_workbook_gap_report.md` |
| Record-level language-surface coverage | `validation/supplemental_driver_variants.jsonl`, `validation/record_language_surface_coverage.csv`, and `validation/record_language_surface_audit.md` |
| Unresolved report | `reports/unresolved_knowledge.md` |
| Conflict report | `reports/conflicts.md` |
| Potentially outdated report | `reports/potentially_outdated.md` |
| Human-review queue | `reports/human_review_queue.md` |
| Concise and More Info answers | Separate fields in every knowledge record |
| Coverage gaps/inaccessible report | Source coverage report and access ledger |
| Production storage/retrieval/version/update recommendations | `reports/production_knowledge_architecture_recommendations.md` |

## Why the full goal is not complete

The following remain material, not administrative:

1. MyGroundBiz authentication is currently unavailable for continued destination and child-resource acquisition.
2. The 77 Safety Topic Library listings are inventoried, but 73 unique documents remain unacquired and unreviewed.
3. Current MyGroundBiz landing/index child-resource families—including Pickup Coordination documents and videos—remain to be acquired and reviewed; the index pages themselves have been reinspected and explicitly dispositioned.
4. OP-324, OP-321, current OP-207/OP-207Res, HZ-035, SF-920P, the current ERG and 20159S decal, relay instructions, detailed equipment/security standards, and other referenced sources remain absent or incomplete.
5. The executed ISP Agreement and controlling schedules/attachments are not available; a sample cannot establish negotiated obligations.
6. OP-135 and certain portal documents remain partially reviewed.
7. Two source conflicts, multiple human-review items, and version-sensitive FORGE records remain unresolved.
8. The final repeated adversarial/diminishing-yield pass cannot be proven until accessible source acquisition and extraction are complete.
9. Every `VERIFIED` record now has at least one durable underlying evidence source; mixed and partial evidence sets still require capture completion before production evidence approval.

Therefore, the workspace has a validated and increasingly comprehensive foundation, but the definition of done is not yet satisfied.
