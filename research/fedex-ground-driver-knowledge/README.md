# Ready Route FedEx Ground Driver Operational Knowledge Research

This workspace contains the source inventory, research ledger, extracted operational knowledge, validation materials, and final coverage reports for the Ready Route driver guidance project.

## Governing boundaries

- Source truth is limited to the authorized materials supplied for this project.
- General model knowledge, public internet commentary, forums, recollections, and assumptions are not operational evidence.
- No operational instruction may be marked `VERIFIED` without exact source evidence.
- Source truth and driver-facing presentation remain separate.
- Application, chatbot, retrieval-interface, and production feature development are out of scope for this phase.
- The taxonomy is discovered from the corpus and must not be treated as fixed in advance.

## Workspace layout

- `inventory/source_inventory.csv`: one row per source or accessible source location.
- `inventory/google_drive_zip_member_inventory.csv`: validator-exact reconciliation of all 17 supplied ZIP members to the 17 extracted Drive source records by SHA-256 content identity, independent of filename encoding.
- `inventory/mygroundbiz_brightcove_video_capture.csv`: exact catalog identity, duration, rendition, byte-count, hash, caption-availability, and local-path reconciliation for the six MyGroundBiz-linked FCC videos.
- `inventory/source_capture_coverage.csv`: one validator-reconciled row per primary source separating review status from durable capture, checksum, review-artifact, reproducibility, knowledge-use gate, and recapture requirements.
- `inventory/rendered_source_capture_coverage.csv`: checksum-manifest registry for complete or explicitly partial authenticated viewer renders, including exact capture completeness and coverage limits without equating renders to original source bytes.
- `inventory/source_knowledge_coverage.csv`: one validator-reconciled row per primary source showing exact mapping counts, mapped knowledge IDs, extraction disposition, evidence basis, and required follow-up.
- `inventory/referenced_source_occurrences.csv`: exact source/locator coverage for every origin-to-missing-source relationship in the referenced-source backlog.
- `inventory/referenced_source_acquisition_coverage.csv`: deterministic one-row-per-gap projection of direct MyGroundBiz acquisition links, contextual resolution links, affected records/taxonomy, and gaps with no current queue route.
- `inventory/mygroundbiz_safety_topic_library.csv`: fully expanded inventory of the 77 dated safety-library documents visible in the latest authenticated pass.
- `inventory/mygroundbiz_news_archive_backlog.csv`: validator-exact inventory of all 100 monthly news-archive links exposed by the durable Recent Customer Alerts link capture, including month, URL, discovery locator, and review/acquisition gates.
- `inventory/mygroundbiz_authenticated_acquisition_queue.csv`: deterministic 272-resource work queue covering four partially reviewed primary sources, 25 accessible uncaptured unreviewed primary resources, six durably captured videos needing complete audio-visual review, seven fully reviewed sources lacking original-source capture, and 230 remaining Safety Topic, news-archive, and navigation resources, including exact candidate-comparison, non-verified dependency, current-evidence, and derived taxonomy links plus authoritative work-state bases without treating titles as evidence.
- `inventory/access_ledger.md`: areas examined, pending, partial, or inaccessible.
- `knowledge/records.jsonl`: authoritative operational knowledge records.
- `knowledge/change_log.jsonl`: immutable before/after snapshots and checksums for reviewed source-alignment corrections to canonical records.
- `knowledge/claim_provenance.jsonl`: generated claim index connecting every current rule, condition, procedure step, documentation item, prohibition, escalation, clarification, and presentation answer to its exact record evidence set while explicitly gating multi-fragment claims that still require human claim-to-fragment allocation.
- `knowledge/claim_evidence_allocation_coverage.jsonl`: one-row-per-claim allocation ledger that auto-allocates single-fragment claims, applies only reviewed multi-fragment overrides, and withholds exact claim-fragment assertions for pending rows.
- `knowledge/source_to_knowledge.csv`: reviewed source/locator-to-record scopes used by the claim-provenance index.
- `knowledge/status_code_translation_coverage.csv`: one-row-per-delivery-code classification separating operationally modeled codes from auto-applied references, workflow gaps, outside-Ground entries, and status-limited references.
- `knowledge/pickup_reason_translation_coverage.csv`: one-row-per-pickup-reason classification preserving operational links, OP-321 limitations, Express scope, and required follow-up.
- `validation/reference_language_cases.jsonl`: status-aware canonical reference evaluation cases for code comparisons, namespace ambiguity, definition-only workflow gaps, unknown tokens, and selection-authority boundaries.
- `validation/candidate_operational_language_cases.jsonl`: independently reviewed non-holdout operational prompts mapped to canonical IDs without becoming retrieval synonyms.
- `validation/candidate_gap_language_cases.jsonl`: independently reviewed non-holdout prompts mapped to explicit knowledge gaps or insufficient-context boundaries, with required follow-up and safe withholding behavior.
- `validation/candidate_operational_retrieval_results.json`: deterministic unseen-development baseline separating retrieval, response-mode, and unsafe status-gating results.
- `knowledge/form_artifact_coverage.csv`: deterministic inventory of driver-used forms, cards, hand sheets, labels, manifests, credentials, and related physical documentation, including artifact access, procedural completeness, publication gates, and exact source/backlog/knowledge links.
- `knowledge/op117_page_coverage.csv`: deterministic reconciliation of every OP-117 v2 page to operational knowledge, normalized reference data, a tracked artifact, or an explicit non-operational disposition.
- `knowledge/forge_page_coverage.csv`: deterministic reconciliation of every page in the 246-page FORGE 2.8.0 application guide to operational knowledge or an explicit front-matter/UI/reference/demo disposition.
- `knowledge/drive_pdf_page_coverage.csv`: deterministic reconciliation of all 407 pages across the 15 supplied Drive PDFs to operational knowledge or an explicit reference/context/non-operational disposition.
- `knowledge/legacy_reference_page_crosswalk.csv`: page-level current-source, knowledge/reference-data, and remaining-gap accountability for every older/reference page excluded from current guidance.
- `knowledge/nonverified_resolution_coverage.csv`: one-row-per-record evidence, decision, owner-class, dependency, and publication-gate requirements for all conflict, human-review, and potentially outdated knowledge.
- `knowledge/evidence_capture_risk_coverage.csv`: one-row-per-record separation of operational knowledge status from durable evidence reproducibility and production capture gates.
- `knowledge/artifact_identifier_exclusions.csv`: explicit source-backed reasons that discovered identifiers such as OP-117/OP-119 are publications rather than driver-used artifacts.
- `related_knowledge_ids` in operational records are directed context-expansion links, not synonyms or automatically reciprocal merge instructions; intentionally isolated records are justified in `knowledge/standalone_record_justifications.csv`.
- `knowledge/taxonomy.json`: emergent taxonomy and relationships.
- `knowledge/taxonomy_readiness_coverage.csv`: one-row-per-node projection of record statuses, durable evidence, missing-source obligations, and authenticated acquisition dependencies.
- `reports/`: source coverage, conflicts, outdated material, unresolved items, and human-review reports.
- `reports/production_knowledge_architecture_recommendations.md`: future source-of-truth storage, retrieval status gates, versioning, publication, update, and audit recommendations.
- `reports/mainstream_driver_priority_scope.md`: user-directed current/mainstream acquisition lane, deferred-source boundary, and publication safeguards.
- `reports/goal_completion_matrix.md`: requirement-by-requirement evidence, remaining work, and the explicit basis for not claiming completion.
- `validation/`: quality-control, adversarial-completeness, and driver-language validation artifacts.
- `validation/driver_variant_index.jsonl`: generated one-to-one retrieval-oracle index for every embedded and supplemental driver-language variant.
- `validation/supplemental_driver_variants.jsonl`: tagged short and context-rich validation paraphrases that close per-record surface gaps without changing source truth.
- `validation/record_language_surface_coverage.csv`: one-row-per-record reconciliation of embedded variants, supplemental variants, formal cases, and short/extended surface coverage.
- `validation/clarification_strategy_index.jsonl`: generated one-to-one strategy, ordered-fact, and stop-rule index for every formal driver-language case.
- `validation/high_risk_interaction_coverage.csv`: exact risk-family and expected-record accountability for every multi-record driver-language case.
- `validation/inventory_consistency_audit.md`: cross-ledger review-state reconciliation and acquisition limits.
- `validation/google_drive_connector_access_audit.md`: independent connector recheck and the boundary between inaccessible connector metadata and the reviewed browser snapshot.
- `validation/brightcove_video_capture_audit.md`: six-video acquisition, metadata, checksum, caption-availability, and no-review/no-extraction boundary.
- `validation/source_capture_coverage_audit.md`: review-versus-capture reconciliation across all primary sources and the durable-recapture workload it creates.
- `validation/evidence_capture_risk_audit.md`: record-level audit of durable, mixed, transient-only, and partial-source evidence sets.
- `validation/record_language_surface_audit.md`: per-record proof that terse and context-rich driver wording are both represented.
- `validation/taxonomy_readiness_audit.md`: branch-level safeguards against generalizing verified parent/sibling rules into gated specialties.
- `scripts/build_claim_provenance.py`: deterministic regeneration of the claim-level evidence index.
- `scripts/build_claim_evidence_allocation_coverage.py`: deterministic regeneration of exact claim-to-fragment allocation coverage and gates.
- `scripts/build_driver_variant_index.py`: deterministic regeneration of the complete driver-language variant index and near-collision metadata.
- `scripts/build_clarification_strategy_index.py`: deterministic regeneration of the complete formal-case clarification strategy index.
- `scripts/build_form_artifact_coverage.py`: deterministic regeneration of the form and physical-artifact coverage ledger.
- `scripts/build_op117_page_coverage.py`: deterministic regeneration of the complete 89-page OP-117 coverage ledger.
- `scripts/build_forge_page_coverage.py`: deterministic regeneration of the complete 246-page FORGE guide coverage ledger.
- `scripts/build_drive_pdf_page_coverage.py`: deterministic regeneration of the complete 407-page all-Drive-PDF coverage ledger.
- `scripts/build_google_drive_zip_member_inventory.py`: deterministic member-level reconciliation of the complete supplied Drive ZIP to extracted source records using exact content hashes.
- `scripts/acquire_brightcove_videos.py`: exact-link acquisition of the six inventoried FCC videos and stable Brightcove catalog metadata.
- `scripts/build_brightcove_video_capture_inventory.py`: offline regeneration and verification of the six-video capture ledger from preserved metadata and hashed MP4 bytes.
- `scripts/build_source_knowledge_coverage.py`: deterministic reconciliation of every source inventory row to the source-to-knowledge ledger.
- `scripts/build_source_capture_coverage.py`: deterministic reconciliation of every source inventory row to durable capture and reproducibility status.
- `scripts/build_referenced_source_occurrences.py`: deterministic regeneration of exact-locator coverage for every referenced-source obligation origin.
- `scripts/build_evidence_capture_risk_coverage.py`: deterministic classification of every knowledge record by evidence-source durability and production capture gate.
- `scripts/build_record_language_surface_coverage.py`: deterministic per-record language-surface and formal-case coverage.
- `scripts/build_taxonomy_readiness_coverage.py`: deterministic status, capture, and dependency readiness projection for every taxonomy node.
- `scripts/build_mygb_acquisition_queue.py`: deterministic regeneration of the complete authenticated MyGroundBiz acquisition queue.
- `scripts/build_mygb_news_archive_backlog.py`: deterministic extraction and validation of exact monthly news-archive links from the durable alert-page link inventory.
- `scripts/validate_reference_data.py`: validates code namespaces, source authority, numeric collisions, and complete delivery-code operational-translation coverage.
- `scripts/validate_corpus_integrity.py`: cross-file checks for archive hashes, exact evidence/mapping locators, claim provenance, taxonomy, source/backlog coverage, statuses, and driver-language expectations.
- `SCHEMA.md`: required field definitions and status rules.

## Evidence rule

An operational record is verified only when its substantive instructions can be traced to a source identifier and a precise locator such as a page, section, slide, sheet/range, image region, MyGroundBiz navigation path, or downloadable-resource location.
