# Record-level driver-language surface audit

Status date: 2026-08-09

## Purpose

Corpus-wide counts can look diverse while individual procedures remain represented only by formal or medium-length wording. This audit tests every knowledge record for both terse on-route language and a context-rich description, in addition to its formal status-aware validation case.

## Findings before remediation

All 138 records have at least four embedded question variants and at least one formal case. Before the existing supplemental remediation, the original 137-record layer had the following gaps after lowercase/alphanumeric token normalization:

- 14 records had no utterance of four tokens or fewer;
- 11 records had no utterance of six tokens or more; and
- global misspelling/shorthand/incomplete/terminology floors therefore did not prove per-record surface breadth.

## Remediation

`validation/supplemental_driver_variants.jsonl` adds 25 tagged paraphrases:

- 14 short forms covering shorthand, incomplete wording, and a terminology-error branch;
- 11 extended forms adding context for rare, safety, compliance, version, and source-defined terminology situations.

Every addition maps to an existing canonical situation and contains no new operational rule, action, code condition, or answer. Each preserves a rationale and surface goal. Supplemental wording cannot change knowledge status or serve as source evidence.

The retrieval-oracle index now contains 690 rows: 665 embedded record variants and 25 supplemental variants. Each index row preserves whether it came from the authoritative record or a named supplemental validation entry.

## Exact per-record coverage

`validation/record_language_surface_coverage.csv` contains one deterministic row for every knowledge record. All 138 rows now have:

- at least four embedded variants;
- at least one formal status-aware case;
- at least one distinct surface of four normalized tokens or fewer;
- at least one distinct surface of six normalized tokens or more; and
- `SHORT_AND_EXTENDED_PRESENT` status.

Because every record is covered, every record-backed taxonomy branch inherits at least one short and one extended surface. The relay taxonomy exception remains source-gated because it has no operational record and no supplied procedure to paraphrase.

## Regression controls

The corpus validator rejects:

- unknown or duplicate supplemental variant IDs;
- unsupported supplemental variant types or missing rationale;
- short additions above four normalized tokens or extended additions below six;
- a supplemental surface duplicating an embedded variant or formal case;
- stale or incomplete 690-row retrieval-oracle output;
- any knowledge record lacking a formal case, short surface, or extended surface;
- stale or incomplete 138-row record-language coverage; and
- any new cross-record near collision without a multi-record clarification case.

## Limitation

Surface coverage is a test-design control, not proof of production retrieval accuracy. Speech-to-text noise, accents, dialects, multilingual phrasing, new terminology, and combinations discovered in future sources still require additional cases and eventual runtime evaluation after product implementation is separately authorized.
