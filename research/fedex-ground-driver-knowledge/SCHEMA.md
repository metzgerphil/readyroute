# Research and Knowledge Schema

## Source inventory record

Each source is assigned a stable `source_id`. The inventory records:

- source identity and parent location;
- title, file/page type, MIME type, and URL or source path;
- created, modified, effective, and version dates when available;
- apparent subject and audience;
- accessibility and review status;
- duplicate, supersession, and cross-reference relationships;
- relevance assessment and interpretation limitations;
- local archival reference when an authorized source is downloaded;
- review notes and timestamps.

Allowed review states:

- `NOT_YET_REVIEWED`
- `PARTIALLY_REVIEWED`
- `FULLY_REVIEWED`
- `INACCESSIBLE`
- `OUT_OF_SCOPE_AFTER_REVIEW`

## Source capture coverage

`inventory/source_capture_coverage.csv` contains exactly one deterministic row for every primary source. It keeps review state separate from whether the underlying source can be reproduced from durable local bytes. Each row preserves source identity and type, authoritative review status, capture status, local archive and SHA-256 when present, review-artifact path, reproducibility level, knowledge-use gate, and required follow-up.

Allowed capture states are:

- `LOCAL_ARCHIVE_HASHED`
- `RENDERED_PAGE_CAPTURE_HASHED`
- `RENDERED_PARTIAL_PAGE_CAPTURE_HASHED`
- `TRANSIENT_REVIEW_ARTIFACT_ONLY`
- `TRANSIENT_PARTIAL_REVIEW`
- `NOT_ACQUIRED`
- `INACCESSIBLE_NO_CAPTURE`

A review artifact records what was examined and the limits applied; it is not a substitute for source bytes or rendered evidence. A complete hashed render preserves reviewable page content but not original-byte identity. A partial hashed render preserves only the exact visible regions named in its coverage ledger and cannot support unseen content. Fully reviewed transient MyGroundBiz sources can continue to support already mapped claims under their existing authority, scope, status, and exact-locator controls, but must be durably recaptured before asserting source change, byte identity, supersession, or reproducible re-review.

## Evidence capture risk coverage

`knowledge/evidence_capture_risk_coverage.csv` contains exactly one row for every operational knowledge record. It partitions the record's evidence source IDs into durable, complete-rendered, partial-rendered, fully reviewed transient, and partially reviewed transient sets, then assigns a capture class, production capture gate, authenticated queue targets, and required follow-up.

Allowed capture classes are:

- `ALL_EVIDENCE_DURABLE`
- `ALL_EVIDENCE_RENDERED_CAPTURE`
- `MIXED_DURABLE_AND_TRANSIENT_EVIDENCE`
- `TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE`
- `EVIDENCE_WITH_PARTIAL_SOURCE`

The record's `knowledge_status` remains the authority/currency/scope/conflict determination. The evidence-capture class is an independent reproducibility and production-review control. A `VERIFIED` record with transient-only evidence is not silently demoted, but it remains capture-gated until the reviewed source is durably preserved and the exact locator is revalidated. Every transient evidence source must appear in the authenticated acquisition queue.

## Authoritative operational knowledge record

Each JSON Lines record in `knowledge/records.jsonl` must preserve these fields where applicable:

- `knowledge_id`
- `canonical_situation`
- `normalized_description`
- `authoritative_rule`
- `applicability`
- `conditions`
- `exceptions`
- `required_procedure`
- `required_documentation`
- `prohibited_actions`
- `escalation_requirements`
- `clarification_requirements`
- `related_knowledge_ids`
- `taxonomy_paths`
- `driver_question_variants`
- `concise_ready_route_answer`
- `more_info_answer`
- `evidence`
- `source_date_or_version`
- `knowledge_status`
- `review_notes`
- `created_at`
- `updated_at`

Each item in `evidence` must contain:

- `source_id`
- `locator`
- `evidence_summary`
- `verbatim_excerpt` when useful and legally appropriate
- `reviewed_at`

Ordered procedures use numbered step objects. Branches identify the deciding condition and target step or related knowledge record. A multi-step sequence must not be split when doing so could produce an incomplete or unsafe answer.

Allowed knowledge states:

- `VERIFIED`
- `UNRESOLVED`
- `CONFLICT`
- `POTENTIALLY_OUTDATED`
- `HUMAN_REVIEW_REQUIRED`

## Source-to-knowledge mapping

Every substantive instruction must have at least one evidence link. Evidence may support a complete record or named fields/steps within it. Records with insufficient evidence remain unresolved; they are never promoted based on plausibility.

`inventory/source_knowledge_coverage.csv` provides the reverse reconciliation: every primary inventory source records its exact mapping-row count, unique mapped knowledge IDs, coverage disposition, evidence basis, and required follow-up. Zero mappings require an explicit disposition such as unreviewed, inaccessible, container/landing/index-only, secondary, partial, or authenticated reinspection required; zero is never silently treated as extraction completeness.

## Claim provenance index

`knowledge/claim_provenance.jsonl` is a deterministic audit/index artifact generated from the authoritative records and source-to-knowledge ledger. It contains one row for every authoritative rule, applicability item, condition, exception, required procedure step, documentation item, prohibition, escalation, clarification, concise answer, and More Info answer.

Each row contains:

- `claim_id`
- `knowledge_id`
- `field`
- `item_index`
- `claim_text`
- `support_mode`
- `knowledge_status`
- `traceability_class`
- `claim_evidence_allocation_status`
- `production_trace_gate`
- `evidence_refs`, each with `source_id`, exact `locator`, `supported_scopes`, and `reviewed_at`

Evidence references are the complete evidence set for the record. Their supported scopes preserve how each source contributes and do not imply that every source independently supports every word of a synthesized claim. A claim with exactly one evidence fragment is classified `SINGLE_EVIDENCE_FRAGMENT`. Claims whose records contain multiple locators from one source are `MULTI_FRAGMENT_SINGLE_SOURCE`; records combining multiple sources are `MULTI_SOURCE_EVIDENCE_SET`. Both multi-fragment classes remain `CLAIM_TO_FRAGMENT_ALLOCATION_REQUIRED`, and production must withhold an exact claim-fragment assertion until a reviewer allocates the supporting fragment(s). The artifact must be regenerated after any record, evidence, mapping, or status change; corpus validation rejects stale output and inconsistent traceability classes or gates.

## Claim-to-evidence allocation coverage

`knowledge/claim_evidence_allocation_coverage.jsonl` contains exactly one generated row for every claim-provenance row. It preserves claim identity/text/status, record evidence fragment/source counts, allocation status, allocated source/locator pairs, allocation basis and review date, and the independent production trace gate.

Allowed allocation statuses are `AUTO_ALLOCATED_SINGLE_FRAGMENT`, `HUMAN_ALLOCATED_MULTI_FRAGMENT`, and `PENDING_MULTI_FRAGMENT_REVIEW`. Single-fragment claims are allocated automatically to their only exact fragment. Multi-fragment claims may become trace-ready only through an explicit reviewed row in `validation/claim_evidence_allocation_overrides.jsonl`; otherwise their allocated set remains empty and the exact-claim assertion is withheld. An allocation never changes operational knowledge status, source authority, or durable-capture readiness.

## Driver-language clarification strategy index

`validation/clarification_strategy_index.jsonl` contains exactly one generated row for every formal driver-language case. It preserves the case ID and utterance, expected knowledge IDs, information sufficiency, response mode, ordered clarification facts, clarification count, response-mode-specific strategy, and stop rule.

Direct source-grounded answers must contain no clarification. Every non-direct case must preserve at least one fact needed to identify the supported branch, escalation context, review owner, or current-source/version state. Immediate safety action, conflict disclosure, source-limit disclosure, and version qualification precede clarification when their response modes require them. Ordered facts are candidates: the stop rule prohibits asking remaining questions after the necessary branch or escalation context is established.

The builder and corpus validator require exact equality with the formal case library and reject duplicate clarification facts. This is a validation oracle, not dialogue or retrieval implementation.

## Supplemental driver variants and surface coverage

`validation/supplemental_driver_variants.jsonl` contains validation-only paraphrases added when the combined embedded-variant/formal-case library lacks either a terse on-route surface or a context-rich surface for a record. Each row preserves a stable supplemental ID, knowledge ID, utterance, variant type, surface goal, and rationale. These rows may restate an existing canonical situation but must never add operational instructions or serve as evidence.

`validation/record_language_surface_coverage.csv` contains exactly one row per knowledge record. It reconciles embedded, supplemental, and formal-case counts; distinct normalized surfaces; formal case types; and short/extended coverage. Every record must retain at least four embedded variants, one formal case, one utterance of four normalized tokens or fewer, and one utterance of six normalized tokens or more.

## OP-117 page coverage

`knowledge/op117_page_coverage.csv` accounts for every page of the current 89-page OP-117 v2 source. Each row preserves the page, subject, coverage disposition, linked knowledge IDs, normalized reference-record count, linked artifact IDs, coverage basis, and required follow-up.

Allowed dispositions are:

- `KNOWLEDGE_MAPPED`
- `KNOWLEDGE_AND_REFERENCE_MAPPED`
- `REFERENCE_DATA_MODELED`
- `GOVERNING_FRONT_MATTER`
- `TABLE_OF_CONTENTS`
- `SECTION_DIVIDER`
- `VISUAL_REFERENCE_ONLY`
- `LOCAL_CONTACT_TEMPLATE_TRACKED`

`UNRECONCILED` is a builder diagnostic, never an allowed committed disposition. Visual examples and blank local templates must not be converted into operational instructions or populated values without source evidence and authorized local configuration.

## FORGE application-guide page coverage

`knowledge/forge_page_coverage.csv` accounts for every page of the 246-page FORGE P&D Application Guide 3.00 optimized to FORGE 2.8.0. Each page is linked to one or more knowledge records or explicitly classified as `GOVERNING_FRONT_MATTER`, `TABLE_OF_CONTENTS`, `UI_SCREEN_REFERENCE`, `ICON_GLOSSARY_REFERENCE`, `NAVIGATION_REFERENCE`, or `DEMO_FIXTURE_REFERENCE`.

The ledger does not make an April 2025 UI path current. Knowledge records extracted from version-sensitive UI pages retain `POTENTIALLY_OUTDATED` or `HUMAN_REVIEW_REQUIRED` status when the guide cannot establish current application behavior or operational authority. `UNRECONCILED` is a builder diagnostic and is prohibited in committed output.

## Complete Drive-PDF page coverage

`knowledge/drive_pdf_page_coverage.csv` accounts for every page of all 15 supplied Drive PDFs: 407 pages in total. Each row preserves source identity, page number/count, subject, coverage disposition, linked knowledge IDs, modeled reference-record count, coverage basis, and required follow-up. The ledger incorporates the exact OP-117 and FORGE ledgers while applying source-specific reference, version, context, and visual dispositions to the other thirteen PDFs.

`scripts/build_drive_pdf_page_coverage.py` deterministically regenerates this ledger. Corpus validation requires the exact 15-source set, exact page counts, unique and gap-free page sequences, valid knowledge IDs, required explanatory bases, and zero committed `UNRECONCILED` rows. A page disposition proves accountability, not current authority: older-version tables, presentation metrics, UI screenshots, and visual examples remain explicitly bounded and cannot be promoted into instructions merely because the page was reviewed.

Every committed Drive-PDF row whose disposition begins `OLDER_` must also appear exactly once in `knowledge/legacy_reference_page_crosswalk.csv`. The crosswalk records the reviewed current source/locator, replacement knowledge IDs or normalized reference-data scope, remaining referenced-source gaps, and the reason the legacy page is not directly published. This is a supersession/accountability control, not a declaration that all newer material is current or complete.

## Non-verified resolution coverage

`knowledge/nonverified_resolution_coverage.csv` must contain exactly one row for every operational record whose status is not `VERIFIED`, and no row for a verified record. Required fields identify the current status, primary resolution type, linked referenced-source gaps, linked authenticated-acquisition resources, exact evidence or decision required, responsible authority class, and publication gate.

Conflict and human-review records use `WITHHOLD_UNTIL_RESOLVED`; potentially outdated records use `QUALIFY_UNTIL_CURRENT_VERSION_CONFIRMED`. Every conflict requires source-conflict adjudication. A resolution row is a research dependency and cannot itself change the knowledge status or authorize a driver-facing procedure.

## Referenced-source occurrence coverage

`inventory/referenced_source_occurrences.csv` contains exactly one row for every `backlog_id` and `origin_source_id` relationship declared by `inventory/referenced_source_backlog.csv`. It preserves a stable occurrence ID, the missing reference identity, reviewed origin source and title, exact page/section/workbook locator, source-grounded reason the missing material is required, and its acquisition/review state.

The ledger proves where a missing-source obligation came from; it does not establish the missing source's contents. A named title, identifier, link, or incomplete workflow remains discovery evidence only until the referenced material is acquired and completely reviewed. The deterministic builder rejects a missing locator or a stale locator whose origin relationship no longer exists, and corpus validation requires exact equality with every backlog origin pair.

## Referenced-source acquisition coverage

`inventory/referenced_source_acquisition_coverage.csv` contains exactly one deterministic row for every referenced-source backlog obligation. It preserves the source identity, priority, reviewed origins, affected targets, derived record/taxonomy impacts, direct queue resources whose `related_gap_ids` explicitly name the gap, contextual queue resources inherited from non-verified resolution rows, the union of those resources, a queue-link class, and required follow-up.

Allowed queue-link classes are `DIRECT_GAP_AND_CONTEXTUAL_RESOLUTION_LINKS`, `DIRECT_GAP_LINK_ONLY`, `CONTEXTUAL_RESOLUTION_LINK_ONLY`, and `NO_CURRENT_AUTHENTICATED_QUEUE_LINK`. A direct link identifies an evidence-backed acquisition route but does not prove the resource contains the missing source. A contextual link identifies a page relevant to resolving an affected record but is not a claim about source availability. A blank route proves only that no current exact queue linkage exists; it does not prove the source is absent from MyGroundBiz.

## Authenticated MyGroundBiz acquisition queue

`inventory/mygroundbiz_authenticated_acquisition_queue.csv` is a deterministic session-work queue generated from five authoritative input sets: partially reviewed MyGroundBiz primary sources; accessible MyGroundBiz primary sources not yet reviewed; fully reviewed MyGroundBiz primary sources whose `local_archive_path` is empty; the complete open MyGroundBiz navigation backlog; and the complete open Safety Topic backlog. Each row preserves the resource identity and URL, acquisition wave and order, discovery-only priority basis, linked referenced-source gaps, candidate comparison sources, exact capture requirement, completion gate, `work_state`, `state_basis`, and source-grounded downstream record and taxonomy impacts.

Partial sources use `PARTIAL_REVIEW_OPEN` with a source-inventory partial-review basis. Accessible unreviewed primary sources use `UNREVIEWED_PRIMARY_OPEN` with the exact basis `SOURCE_INVENTORY_REVIEW_STATUS=NOT_YET_REVIEWED;ACCESS_STATUS=ACCESSIBLE`. Fully reviewed sources lacking durable capture use `REVIEWED_DURABLE_CAPTURE_OPEN` with the exact basis `SOURCE_INVENTORY_REVIEW_STATUS=FULLY_REVIEWED;LOCAL_ARCHIVE_PATH=EMPTY`. Backlog rows use `UNACQUIRED_OPEN` with the applicable backlog and not-created source-inventory basis. Corpus validation requires exact coverage and state derivation across all five input sets.

The queue contains open work, not historical completion rows. A resource leaves the generated queue only after its authoritative source-inventory or backlog state is reconciled to the satisfied completion gate. For a fully reviewed recapture row, that requires durable capture reconciliation; review status alone cannot remove it. Durable archives, checksums, review artifacts, and source rows preserve completion evidence outside the queue.

`affected_nonverified_knowledge_ids` is the reverse projection of `knowledge/nonverified_resolution_coverage.csv`: it lists every non-verified record whose resolution row names that queued resource. The queue builder and corpus validator require exact equality in both directions so a captured resource identifies every dependent record that must be reassessed. A blank impact set does not establish irrelevance. In particular, unreviewed Safety Topic titles and URLs remain discovery metadata and receive no inferred record links until their contents are completely reviewed and source-backed relationships are created.

`affected_current_evidence_knowledge_ids` lists records whose current `evidence[].source_id` exactly equals the queued resource ID. It identifies the records whose existing evidence capture must be reconciled after durable recapture; it does not imply that recapture changes their status. `affected_taxonomy_ids` is derived from the taxonomy paths of the union of the non-verified dependency records and current-evidence records. Neither field is inferred from a page title or URL, and a blank field does not establish irrelevance.

`candidate_comparison_source_ids` is populated only for an inventoried unreviewed primary source whose explicit source-inventory cross-references name supplied Google Drive candidates. These IDs direct byte/hash and content comparison after portal acquisition. They do not assert duplicate identity, authority equivalence, or supersession before reconciliation.

Queue priority controls session order only. It does not change source authority, review status, relevance, or publication eligibility, and acquisition alone does not satisfy the row's completion gate.

## Status-code reference record

Each JSON Lines entry in knowledge/status_codes.jsonl preserves a code table entry without converting the table into disconnected FAQs. Required fields are:

- code
- label
- applies_when
- scope_notes
- source_id
- locator
- source_version
- knowledge_status

Code identity alone never establishes the procedure. Retrieval must also evaluate operational context, product/service scope, whether FORGE applies the code automatically, and any related procedural knowledge record.

Pickup reason codes are stored separately in knowledge/pickup_reason_codes.jsonl because their numeric namespace can overlap delivery status codes. They use the same reference fields. Entries remain HUMAN_REVIEW_REQUIRED when OP-117 names the reason but the current OP-321 conditions have not been acquired.

## Delivery-status operational translation coverage

`knowledge/status_code_translation_coverage.csv` prevents a verified code definition from being mistaken for a complete operational procedure. Every delivery-status code is classified as one of:

- `OPERATIONAL_RECORD_LINKED`
- `OPERATIONAL_RECORD_SET_LINKED`
- `AUTO_APPLIED_REFERENCE_ONLY`
- `DEFINITION_ONLY_WORKFLOW_GAP`
- `OUTSIDE_GROUND_SCOPE_REFERENCE`
- `STATUS_LIMITED_REFERENCE`

Each row preserves the exact code/label, linked knowledge IDs where applicable, a source-scope assessment, and required follow-up. A `DEFINITION_ONLY_WORKFLOW_GAP` must not be served as a complete driver procedure merely because its underlying code entry is `VERIFIED`.

`knowledge/pickup_reason_translation_coverage.csv` applies the same principle to the separate pickup-reason namespace. Its allowed translation states are `OPERATIONAL_RECORD_LINKED`, `STATUS_LIMITED_RECORD_LINKED`, `STATUS_LIMITED_RECORD_SET_LINKED`, and `OUTSIDE_GROUND_STATUS_LIMITED`. A linked zero-package or hazmat record does not override the reason entry's `HUMAN_REVIEW_REQUIRED` status while OP-321 criteria are missing.

## Form and physical-artifact coverage

`knowledge/form_artifact_coverage.csv` inventories driver-used forms, cards, sheets, labels, manifests, credentials, and other physical documentation discovered in reviewed sources. It separates four questions that must not be collapsed:

- Is the current artifact itself acquired and reviewed?
- Is its operational procedure complete, partial, or reference-only?
- Which knowledge records and missing-source obligations depend on it?
- What publication gate applies despite any modeled procedure?

The ledger preserves exact source, backlog, and knowledge links; a complete modeled workflow does not imply that the current physical artifact has been acquired. Photographed examples with unresolved identity cannot be promoted into current instructions.

`LOCAL_CONFIGURATION_REQUIRED` applies when an authoritative artifact supplies a blank local template but cannot establish the actual local values, such as station or management contact details. Those values must not be guessed or treated as globally authoritative.

Each artifact row also carries zero or more canonical `official_identifiers`. `knowledge/artifact_identifier_exclusions.csv` records identifiers found during adversarial scanning that are source-publication numbers rather than driver-used artifacts. Validation scans structured records, all source-review artifacts, and extracted PDF text; every discovered OP/SF/HZ/decal identifier must resolve to an artifact row or a source-backed exclusion.

## Taxonomy

Taxonomy nodes are created only after evidence establishes a recurring operational concept. Nodes record aliases, parent-child relationships, connected nodes, source coverage, and change history. Example concepts in the project prompt are discovery hints, not predefined boundaries. A record may belong to multiple root-to-child paths. Every adjacent path segment must follow a declared parent relationship, and a node without a record requires an explicit source-grounded coverage exception.

`knowledge/taxonomy_readiness_coverage.csv` contains exactly one row for every taxonomy node. A node aggregates every record whose complete path contains that node and preserves mapped IDs; counts by knowledge status and evidence durability; referenced-source gaps; authenticated queue dependencies; readiness class; basis; and follow-up.

Allowed readiness classes are:

- `ALL_RECORDS_VERIFIED_DURABLE`
- `ALL_RECORDS_VERIFIED_CAPTURE_OPEN`
- `MIXED_VERIFIED_AND_NONVERIFIED`
- `NO_VERIFIED_RECORDS`
- `SOURCE_GAP_NO_OPERATIONAL_RECORD`

Branch readiness never overrides record status. A verified parent or sibling cannot authorize a conflict, human-review, potentially-outdated, or source-missing child branch.

## Driver-language validation case

Each JSON Lines entry in `validation/driver_language_cases.jsonl` contains:

- `case_id`
- `utterance`
- `expected_knowledge_ids`
- `must_clarify`
- `must_not_do`
- `case_type`
- `information_sufficiency`
- `response_mode`
- optional `required_source_gap_ids` when the utterance requests a narrower procedure absent from otherwise matching records

Allowed sufficiency values:

- `SUFFICIENT`
- `CONDITIONALLY_SUFFICIENT`
- `INSUFFICIENT_CONFLICT`
- `INSUFFICIENT_FOR_APPROVED_ANSWER`
- `INSUFFICIENT_WITHOUT_VERSION_CONFIRMATION`

Allowed response modes:

- `DIRECT_SOURCE_GROUNDED_ANSWER`
- `ASK_MINIMUM_CLARIFICATION`
- `IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY`
- `WITHHOLD_DISPUTED_STEP_AND_ESCALATE`
- `STATE_SOURCE_LIMIT_AND_ESCALATE`
- `QUALIFY_AND_REQUIRE_CURRENT_VERSION_CHECK`

The sufficiency and response mode are constrained by the statuses of the expected records and by any explicit `required_source_gap_ids`. A successful match to a verified general record never turns an absent narrower procedure into approved guidance, and it never overrides a `CONFLICT`, `HUMAN_REVIEW_REQUIRED`, `UNRESOLVED`, or `POTENTIALLY_OUTDATED` restriction.

## Driver-variant retrieval index

`validation/driver_variant_index.jsonl` is generated one-for-one from every record's `driver_question_variants`. Each row preserves:

- `variant_id`
- `knowledge_id`
- `variant_index`
- `utterance`
- `normalized_utterance`
- `token_count`
- `surface_length`
- `contains_digit`
- `knowledge_status`
- `near_collision_knowledge_ids`

This artifact is a deterministic future retrieval oracle, not evidence that a retrieval implementation already works. It must be regenerated after any variant, record ID, or knowledge-status change.
