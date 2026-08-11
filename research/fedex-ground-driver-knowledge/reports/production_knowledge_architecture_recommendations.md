# Production knowledge storage, retrieval, versioning, and update recommendations

Status date: 2026-08-09

Scope: recommendations for a future Ready Route implementation. This document does not authorize or begin application, chatbot, authentication, billing, or interface development.

## Recommended governing model

Use a versioned relational knowledge system as the system of record. Store original authorized source files separately in controlled object storage. Build text-search and vector-search indexes only as derived candidate-finding layers that can be discarded and rebuilt.

The search index must never become the authority for an operational instruction. Authority comes from an approved knowledge-record version and its exact evidence links.

## Keep four layers separate

1. **Source layer** — immutable source identity, file/page content, version/date, checksum, access classification, location, review state, and supersession relationships.
2. **Authoritative knowledge layer** — complete rules, conditions, decision branches, ordered procedures, documentation, prohibitions, escalation, relationships, and status.
3. **Driver-presentation layer** — concise answer, More Info answer, clarification prompts, aliases, and natural-language variants tied to a particular approved knowledge-record version.
4. **Derived retrieval layer** — keyword index, embeddings, synonyms, reranking features, and cached candidate sets. This layer can locate knowledge but cannot create or approve it.

Changing a concise answer must not overwrite or shorten the authoritative rule. Changing a search index must not change source truth.

## Recommended logical entities

### Source

- Stable `source_id`
- Source system and parent source
- Title/type/audience/access classification
- Canonical authorized location
- Current inventory/review state

### Source version

- Stable `source_version_id`
- Source ID
- Version/effective/published/retrieved dates
- Immutable checksum and archived-object reference
- Supersedes/superseded-by links
- Extraction/OCR quality and interpretation limits
- Capture status and reproducibility level, kept separate from review status
- Review-artifact reference when live content was examined but durable source bytes were not preserved

### Evidence fragment

- Stable `fragment_id`
- Source-version ID
- Exact page, section, sheet/range, image region, or portal locator
- Preserved source text or controlled excerpt
- Extraction method and reviewer verification

### Referenced-source occurrence

- Missing-source obligation ID
- Reviewed origin source-version and exact evidence-fragment locator
- Named identifier/title or source-family description
- Reason the source is required and affected knowledge/version targets
- Acquisition, review, and resolution state

This entity preserves why an external card, form, guide, or controlling workflow was requested without treating the reference as evidence for the unavailable material.

### Knowledge record and knowledge-record version

- Stable conceptual `knowledge_id`
- Immutable `knowledge_version_id`
- Canonical situation and normalized description
- Applicability, conditions, exceptions
- Ordered procedure steps
- Required documentation
- Prohibited actions
- Escalation and clarification requirements
- Knowledge status and reviewer decision
- Effective and retired timestamps

Never update an approved version in place. Create a new version, compare it, approve it, and publish it atomically.

### Decision variable and branch

Represent decision logic explicitly rather than burying all conditions in prose:

- Variable/question, such as signature type, location type, package service, prior-attempt state, or system state
- Allowed source-established values
- Branch condition
- Target procedure step or related record
- Whether the variable is already known from system/package data or must be asked of the driver
- Clarification priority

### Evidence link

Each substantive rule, step, prohibition, or documentation item should link to one or more evidence fragments. Record-level evidence alone is insufficient when different steps come from different sources.

The research corpus now includes `knowledge/claim_provenance.jsonl` as a deterministic migration/audit index for all current substantive claims. It resolves each claim to its exact record evidence set and supported scopes. The traceability control distinguishes 1,734 single-fragment claims from 1,520 multi-fragment claims requiring review. `knowledge/claim_evidence_allocation_coverage.jsonl` makes all 1,520 reviewed multi-fragment claims trace-ready, with zero pending allocations. A production schema must preserve those reviewer-assigned fragment links and must fail closed if any future multi-fragment claim lacks a reviewed allocation.

Evidence links must also expose capture readiness independently from knowledge status. A source-reviewed `VERIFIED` record is not production-evidence-ready when every underlying source exists only as a transient browser review artifact. The current `knowledge/evidence_capture_risk_coverage.csv` supplies the migration gate: require durable source bytes or a complete page capture and exact-locator revalidation before production evidence approval, while preserving the separate authority/currency/status decision.

### Presentation version

- Knowledge-version ID
- Concise answer
- More Info answer
- Minimum clarification question or questions
- Escalation wording
- Locale/language
- Approval state and reviewer

### Language variant

- Knowledge-version ID
- Natural utterance
- Variant type: shorthand, misspelling, incorrect terminology, incomplete, or multi-procedure
- Expected decision variables
- Provenance: source-derived, validation-generated, or production feedback

### Knowledge relationship

- From/to knowledge IDs
- Relationship type, such as `REQUIRES`, `CONSTRAINS`, `CONDITIONALLY_USES`, `RECOVERY_FOR`, `CONFLICTS_WITH`, or `SUPERSEDES`
- Direction and branch condition

### Taxonomy branch readiness

- Taxonomy node and descendant record-version set
- Counts by operational status and evidence-capture class
- Missing-source and authenticated-acquisition dependencies
- Readiness class and required follow-up

Use this as an audit and retrieval-safety projection, never as a substitute for record-level status. A verified parent branch cannot authorize a gated specialty child.

### Missing-source acquisition route

- Stable missing-source obligation ID and reviewed origin occurrences
- Direct authenticated-queue targets that explicitly name the gap
- Contextual record-resolution targets stored separately from direct acquisition links
- Affected record and taxonomy IDs
- Acquisition/review state, coverage basis, and required follow-up

A contextual target must never be presented as proof that the missing source is available there. Missing obligations with no current route remain explicit targeted-discovery work rather than disappearing behind a general portal backlog.

### Form or physical artifact

- Stable `artifact_id` and official identifier/title where established
- Artifact family, current revision, and jurisdiction/service scope
- Source-version and archived-object links for the actual specimen
- Artifact access/review state independent from procedure completeness
- Linked knowledge-version IDs and missing-source obligations
- Publication gate and explicit interpretation limit
- Driver shorthand/aliases stored separately from authoritative identity

This separation is essential for artifacts such as OP-207/OP-207Res. A driver utterance like "Blue Sheet" may retrieve a candidate form family, but it must not establish the official form identity or unlock a fill-out procedure when the current artifact/revision is unverified.

### Validation case and result

- Test utterance
- Expected record set
- Must-clarify facts
- Must-not-do actions
- Expected information sufficiency and response mode
- Knowledge/source versions tested
- Retrieval and answer result
- Pass/failure category and review disposition

## Recommended physical storage

- **Relational database:** authoritative normalized entities, version history, approval workflow, status, evidence links, relationships, and validation results.
- **Controlled object storage:** original authorized files, archived portal captures, rendered pages, and checksummed extraction artifacts.
- **Full-text index:** exact terminology, codes, forms, service names, aliases, and phrase search.
- **Vector index:** semantic candidate retrieval over canonical situations, rules, and approved variants. Store record-version IDs, not free-floating answer text.
- **Analytics store or append-only events:** anonymized question, candidate, answer status, feedback, unresolved reason, record/source versions, and latency.

PostgreSQL plus a rebuildable full-text/vector index is a reasonable future default, but the product should first reuse Ready Route's existing approved infrastructure if it satisfies these roles.

## Retrieval and answer sequence

1. Normalize the typed or transcribed utterance without replacing the original text.
2. Retrieve candidate knowledge versions through keyword, code/form lookup, aliases, and semantic search. Resolve driver shorthand to a verified artifact identity before presenting form-specific instructions.
3. Filter to currently published versions and the applicable operation, geography, service/package type, and system version when those dimensions are known.
4. Expand required/conditional related records so a reusable base rule does not hide a complete interacting sequence. Check taxonomy readiness so a general verified parent or sibling is not substituted for a gated specialty branch.
5. Evaluate knowledge status before generating presentation:
   - `VERIFIED`: continue.
   - `CONFLICT`: withhold the disputed step and escalate.
   - `HUMAN_REVIEW_REQUIRED` or `UNRESOLVED`: state the source limit and escalate.
   - `POTENTIALLY_OUTDATED`: require a current version/source check before presenting the version-sensitive step.
6. Determine whether every material decision variable is known.
7. If not, ask only the highest-value minimum clarification needed to select the branch.
8. Assemble the answer from the approved presentation and authoritative step set. A model may paraphrase within approved meaning but must not add steps, codes, exceptions, or permissions.
9. Return the immediate answer, optional More Info, and escalation. Preserve the exact knowledge/source versions in the internal answer trace.
10. Log the question, decision path, result status, feedback, and unresolved reason for review.

## Required answer contract

Every future answer should carry machine-readable fields even if the driver sees only the short text:

- `answer_status`
- `knowledge_version_ids`
- `source_version_ids`
- `clarification_question` when needed
- `primary_answer`
- `more_info_answer`
- `prohibitions_applied`
- `escalation`
- `generated_at`
- `retrieval_trace_id`

The internal trace must answer, “Why did Ready Route say this?” without exposing confidential source material unnecessarily to the driver.

## Status behavior must be enforced in code

| Knowledge status | Future response behavior |
|---|---|
| `VERIFIED` | Answer only after required conditions are known. |
| `CONFLICT` | State that an approved answer cannot be established; withhold the disputed action and escalate. |
| `UNRESOLVED` | State that the supplied source set does not establish the procedure; escalate. |
| `HUMAN_REVIEW_REQUIRED` | Present only the independently supported subset, identify the missing authority/criterion, and escalate. |
| `POTENTIALLY_OUTDATED` | Do not present version-sensitive instructions as current without confirmation. |

These gates must run after retrieval and before answer presentation. Prompt wording alone is not an adequate control.

## Source-update workflow

1. Acquire the new authorized source and preserve immutable bytes/capture plus checksum. A review artifact without durable source capture must remain an explicit recapture obligation and cannot establish byte identity or change detection.
2. Create a new source version; never overwrite the old one.
3. Extract/render and verify page or section identity.
4. Compare the new version with the prior version.
5. Identify every evidence link and knowledge version affected by changed fragments.
6. Mark affected published records `POTENTIALLY_OUTDATED` or place them in a pending-review state before changed instructions can be served.
7. Review changed rules, branches, steps, codes, dates, and presentation answers.
8. Run source coverage, cross-reference, conflict, sequence, concise-answer, and driver-language regression checks.
9. Obtain the required operational/legal/safety approval.
10. Publish the complete approved knowledge-version set atomically and rebuild derived indexes.
11. Retain the prior release for audit and rollback.

## Conflict and supersession handling

- A newer date does not automatically resolve a conflict when the documents have different authority or scope.
- Store explicit `supersedes`, `corroborates`, `narrows`, and `conflicts_with` relationships.
- Preserve both sources and the affected fields.
- Require a reviewer to state the controlling authority and scope before changing `CONFLICT` to `VERIFIED`.
- Re-run every affected language case after resolution.

## Quality gates for every publication

- No evidence fragment refers to a missing source version.
- No published evidence set is transient-only or depends on an incomplete source capture.
- Every substantive procedure step has evidence.
- Every published record has at least one language case.
- Every conflict, human-review, and outdated record has a withholding/escalation test.
- No related-record ID is orphaned.
- Every ordered sequence remains ordered and complete.
- Concise answers preserve immediate critical steps and expose source limitations.
- Status/reference-code namespaces remain distinct.
- No retrieval result may bypass a status gate.
- Previously passing cases must remain passing unless a reviewed source change intentionally alters them.

The current validators, 192-case library, 192-row clarification-strategy index, 33-row multi-record interaction ledger, 144-row record-language surface ledger, and 724-row variant retrieval oracle are a starting regression set, not a final production evaluation suite.

## Feedback and unanswered-question loop

Store:

- original driver wording and transcription confidence;
- chosen candidates and final answer status;
- clarification asked and answer supplied;
- thumbs-up/down plus optional reason;
- unresolved, no-match, conflict, version-block, or escalation category;
- knowledge/source versions used; and
- whether human review created, updated, or rejected a candidate record.

Production feedback may create a research lead or language variant. It must never create a verified operational procedure without authoritative source evidence and review.

## Access, confidentiality, and audit controls

- Apply role-based access to original FedEx materials, source excerpts, authoring, approval, and driver-facing presentation.
- Encrypt source objects and database content in transit and at rest.
- Log source acquisition, record edits, status changes, approvals, publications, and rollbacks.
- Prevent ordinary driver accounts from browsing the complete confidential source corpus unless specifically authorized.
- Retain only the operational/analytics personal data needed for the defined purpose and approved retention period.
- Complete FedEx contractual, confidentiality, legal, safety, Terms of Service, and liability review before commercial launch.

## Integration principle for Ready Route

When implementation is authorized, first inspect and reuse Ready Route's existing authentication, company/driver account model, database, telemetry, and billing foundations. Add the knowledge entities and retrieval gate as a bounded capability. Do not create parallel authentication, account, or billing systems solely for this feature.

## Blocking prerequisites before production publication

- Resolve the two current source conflicts.
- Obtain the missing current OP-324, OP-321, OP-207/OP-207Res, HZ-035, SF-920P, relay, equipment, safety-library, and executed-agreement materials where applicable.
- Complete the remaining MyGroundBiz destination and linked-resource review.
- Assign named operational, safety/compliance, and legal approval owners.
- Define publication/rollback authority and source-refresh monitoring.
- Complete final end-to-end retrieval evaluation only after implementation is separately authorized.
