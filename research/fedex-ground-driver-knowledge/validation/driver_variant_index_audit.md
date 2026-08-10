# Complete driver-variant index audit

Audit date: 2026-08-09

## Purpose

Every natural-language variant embedded in an operational record or added as a tagged surface-coverage test must be independently accountable as a future retrieval test. The generated `validation/driver_variant_index.jsonl` is a retrieval-oracle index; it does not execute or imply a production retrieval model.

## Coverage

- 690 indexed variants across 138 knowledge records.
- 665/665 exact correspondence with embedded `driver_question_variants` fields plus 25/25 exact correspondence with `supplemental_driver_variants.jsonl`.
- 690 unique lowercase/alphanumeric-normalized variant utterances.
- 101 `VERY_SHORT` variants (one to three tokens).
- 408 `SHORT` variants (four to five tokens).
- 181 `EXTENDED` variants (six or more tokens).
- 42 variants containing digits, including codes, ages, service labels, versions, weights, and timing shorthand.

Each index row preserves variant ID, record ID, ordinal, original and normalized utterance, token count, objective surface-length class, digit presence, current knowledge status, variant source/type, and near-collision record IDs.

The separate 138-row record-language surface ledger proves that every record has at least one surface of four normalized tokens or fewer and one of six or more, in addition to a formal case.

## Formal case coverage

The separate hand-authored validation library now contains 185 cases covering 138/138 records. It includes:

- ten cases with an explicit misspelling signal;
- seventeen shorthand cases;
- ten incomplete-language cases;
- ten terminology-error cases;
- twelve ambiguity cases;
- twenty cases with an explicit multi-record/rule/procedure signal;
- nine safety-priority cases;
- three conflict cases;
- fifteen potentially-outdated cases; and
- twenty-three human-review cases.

Thirty-three cases intentionally map to more than one knowledge record. Their ambiguity, specialized-override, safety, source-authority, recovery, custody, compliance, version/sync, and capacity/time risks are reconciled one-for-one in `validation/high_risk_interaction_coverage.csv`.

## Knowledge gap found through language testing

The utterance “customer refused package” had no ordinary-delivery operational record even though current OP-117 defines Status Code 006. The corpus previously contained only the code-table entry and special ASR/call-tag branches.

`KNO-DEL-REFUSED-001` now preserves the narrow source truth: code 006 applies when a recipient refuses an ordinary package. Because OP-117 does not establish the complete ordinary post-code notation, door-tag, photo, custody, or station-return sequence, the record is `HUMAN_REVIEW_REQUIRED`, begins with the approved-procedure limitation, and adds `REFSRC-029` for controlling-source acquisition. No special-service sequence was generalized.

## Automated controls

`scripts/build_driver_variant_index.py` deterministically regenerates the index. The corpus validator rejects:

- missing, extra, reordered, duplicated, or stale variant rows;
- normalized variant collisions and supplemental duplication of embedded/formal-case surfaces;
- changed record/status/utterance associations;
- stale near-collision metadata;
- loss of very-short, short, or extended surface coverage;
- a record with fewer than four embedded variants;
- a knowledge record without a formal case;
- a record without both a short and extended language surface;
- loss of the validator-enforced minimum counts for misspelling, shorthand, incomplete, terminology, ambiguity, multi-record, safety, conflict, outdated, or human-review case signals; and
- a near-colliding record pair without an explicit multi-record case.

## Result

All 690 current variants are independently indexed and validator-accountable. All 138 records have status-aware formal cases plus short and extended language surfaces. Runtime retrieval accuracy remains untested because application/retrieval implementation is outside this phase.
