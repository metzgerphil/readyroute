# Claim-level provenance audit

Audit date: 2026-08-09

## Purpose

The record evidence list and `source_to_knowledge.csv` can answer which sources support a knowledge record, but a production trace must also identify the evidence set behind each substantive field or instruction. This audit adds a deterministic claim index without changing operational meaning or implementing product functionality.

## Claim grain

`knowledge/claim_provenance.jsonl` contains one row per current claim in these fields:

| Field | Claims |
|---|---:|
| Authoritative rule | 138 |
| Applicability | 284 |
| Conditions | 318 |
| Exceptions | 56 |
| Required procedure steps | 617 |
| Required documentation | 431 |
| Prohibited actions | 381 |
| Escalation requirements | 163 |
| Clarification requirements | 494 |
| Concise answers | 138 |
| More Info answers | 138 |
| **Total** | **3,158** |

Every claim row preserves the exact current claim text, record/status identity, support mode, and one or more record-level evidence references containing source ID, precise locator, review date, and the narrower `supported_scope` text from the source-to-knowledge ledger.

## Claim-to-fragment allocation result

The audit now separates record-evidence retrieval from exact claim-to-fragment allocation:

| Traceability class | Claims | Gate |
|---|---:|---|
| `SINGLE_EVIDENCE_FRAGMENT` | 1,820 | Traceable to the record's single exact evidence fragment |
| `MULTI_FRAGMENT_SINGLE_SOURCE` | 116 | Human claim-to-fragment allocation required |
| `MULTI_SOURCE_EVIDENCE_SET` | 1,222 | Human claim-to-fragment allocation required |
| **Total** | **3,158** | |

The 1,338 multi-fragment claims enter the finer allocation workflow because record-level provenance alone does not establish that every listed fragment supports every word. The base index therefore marks them as requiring allocation; the companion allocation ledger supplies the current production gate after applying reviewed overrides.

The companion `knowledge/claim_evidence_allocation_coverage.jsonl` now performs that finer allocation. Reviewed batches allocate 859 multi-fragment claims, leaving 479 multi-fragment claims pending. See `validation/claim_evidence_allocation_audit.md` for the allocation rules and source repairs discovered during review.

## Locator normalization finding

The stronger exact-locator join exposed four record/source pairs whose evidence and mapping rows had equivalent page coverage but different grouping:

- Manual barcode entry combined pages 178-181 and 242 in one evidence object while the ledger split them.
- Address editing combined OP-117 pages 36/40 and 46 while the ledger split them.
- Falsification split OP-117 pages 6 and 81 in evidence while the ledger combined them.
- Stolen-vehicle evidence combined OP-117 page 84 and pages 86-87 while the conflict mapping separately identified the page 84 branch.

These were normalized before the later refusal, status-translation, form-artifact, FORGE page-completeness, complete Drive-PDF page-accountability, and subsequent current-page reconciliations. The current corpus contains 338 exact evidence objects and 338 exact mapping rows across 217 knowledge/source pairs. The validator requires equality at `knowledge_id + source_id + locator`, replacing the weaker source-pair-only check.

## Integrity controls

`scripts/build_claim_provenance.py` deterministically regenerates the claim index. `scripts/validate_corpus_integrity.py` now rejects:

- missing, extra, reordered, or stale claim rows;
- claim text that no longer matches its authoritative record field/item;
- changed knowledge status or support mode;
- evidence references that differ from the record evidence set;
- evidence/mapping locators that do not match exactly; and
- missing or changed supported-scope descriptions;
- a traceability class inconsistent with evidence-fragment/source cardinality; or
- an allocation status or production trace gate inconsistent with its class.

## Interpretation and limitation

The index traces each claim to the complete exact evidence set for its knowledge record and preserves each evidence fragment's narrower supported scope. It does **not** assert that every cited source independently supports every word of a multi-source synthesized claim. Where 1,222 claims use more than one source ID, the sources may jointly establish the rule, establish different branches, corroborate one another, or preserve a conflict/status limitation. Another 116 claims use multiple locators from one source. The `supported_scopes` field describes those record-level roles, while the allocation gate prevents them from being misrepresented as completed claim-level assignments.

A future normalized production schema should allocate stable evidence-fragment IDs directly to individual rule fields and steps during human review. The current index is an inspectable migration/audit layer and closes the earlier gap where a claim could not deterministically retrieve its exact record evidence.

## Result

All 3,158 current substantive claims are deterministically connected to exact reviewed record-evidence locators and supported-scope metadata. Of those, 1,820 have one unambiguous evidence fragment and 1,338 enter human allocation among multiple fragments. The companion ledger has completed 859, leaving 479 pending before an exact claim-fragment assertion is production-ready. This does not prove that unacquired sources, unresolved versions, conflicts, human-review decisions, or multi-fragment claim allocation are complete.
