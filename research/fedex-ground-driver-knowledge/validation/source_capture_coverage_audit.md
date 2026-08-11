# Source capture coverage audit

Status date: 2026-08-10

## Purpose

Review completeness and durable source reproducibility are different claims. A reviewer may have fully examined a live authenticated page while the session was available, yet later be unable to reproduce that review from preserved source bytes or a complete page capture. Conversely, a source may be durably acquired but remain entirely unreviewed. This audit makes those distinctions explicit across all 123 primary source rows.

## Exact reconciliation

`inventory/source_capture_coverage.csv` contains one deterministic row for every primary source:

| Capture status | Sources | Meaning |
|---|---:|---|
| `LOCAL_ARCHIVE_HASHED` | 77 | Durable local bytes exist and their SHA-256 digests are validator-verified; four byte-identical portal/Drive pairs share archive paths and six sources are fully reviewed historical FCC videos |
| `RENDERED_PAGE_CAPTURE_HASHED` | 2 | All source pages are durably preserved as checksum-verified viewer renders, but original source bytes are not archived |
| `RENDERED_PARTIAL_PAGE_CAPTURE_HASHED` | 2 | Page-addressed reviewed regions are checksum-preserved, but cropped regions prevent complete-source review |
| `TRANSIENT_REVIEW_ARTIFACT_ONLY` | 6 | Source is fully reviewed, but only a review artifact and remote locator remain; one is the Drive connector folder container whose child bytes are separately archive-reconciled |
| `TRANSIENT_PARTIAL_REVIEW` | 2 | Only an exact reviewed portion is documented; complete durable acquisition and review remain open |
| `NOT_ACQUIRED` | 25 | Primary source row exists, but no source content has been acquired or reviewed |
| `INACCESSIBLE_NO_CAPTURE` | 7 | Exact broken MyGroundBiz links have no capture |

All 89 fully or partially reviewed primary sources have a source-specific review artifact. Eighty-one of the 123 primary-source records resolve to durable, checksum-protected local source bytes; four byte-identical portal/Drive pairs share archive paths within the 73-entry checksum manifest. Nine reviewed or partially reviewed MyGroundBiz sources lack original source-byte archives: two have partial hashed page renders, five have only transient full-review artifacts, and two remain transient-partial. The sixth transient full-review row is the Drive connector folder container; its 37 current child files are independently raw-byte hashed and reconciled to 33 registered archive objects. Six additional MyGroundBiz videos have durable bytes and complete source-specific audio-visual reviews; they are retained as historical context without operational extraction.

`knowledge/evidence_capture_risk_coverage.csv` separately projects these source-level limits onto all 144 knowledge records; see `validation/evidence_capture_risk_audit.md`. This prevents a source-level recapture gap from remaining invisible merely because a record's operational status is `VERIFIED`.

## Queue consequence

Three partial sources are in `WAVE_0_PARTIAL_SOURCE_COMPLETION`; a fourth, the version-ambiguous pickup sheet, is deferred and receives no further review unless current authority is established. The newly archived batch, FORGE 3.3, OP-135, the Download Pickup List, the six fully reviewed FCC videos, and byte-reconciled sources have left the queue after complete review and archive reconciliation; current OP-321 remains the pickup-code target. Twenty-five accessible portal primary documents/pages remain in `WAVE_0_UNREVIEWED_PRIMARY_ACQUISITION` and use `UNREVIEWED_PRIMARY_OPEN` because their local archive path is empty. Exact supplied Drive cross-references remain candidate-comparison IDs only. The five fully reviewed sources without original bytes are included as `WAVE_0_DURABLE_RECAPTURE` with `REVIEWED_DURABLE_CAPTURE_OPEN` state. Their exact state basis is:

`SOURCE_INVENTORY_REVIEW_STATUS=FULLY_REVIEWED;LOCAL_ARCHIVE_PATH=EMPTY`

This closes three omission modes: a not-yet-reviewed uncaptured source, a not-yet-reviewed captured source, and a fully reviewed non-durable source cannot disappear from planning. The generated queue order is authoritative and is regenerated whenever a source changes state.

## Knowledge-use boundary

Missing durable capture does not automatically demote an existing knowledge record. Authority, currency, scope, review extent, status, and exact-locator support remain separate controls. However:

- a fully reviewed transient source cannot support a claim that the remote source is unchanged, byte-identical, superseded, or reproducibly re-reviewed;
- a partially reviewed transient source may support only its exact documented portion and cannot support unseen content;
- a not-acquired or inaccessible source cannot support operational extraction;
- durable recapture alone does not promote knowledge status or establish operational relevance.

## Automated control

`scripts/build_source_capture_coverage.py` derives the ledger from the source inventory, checksum manifest, and review artifacts. `scripts/validate_corpus_integrity.py` requires exact 123-row equality, unique source coverage, valid archive/checksum relationships, and exact acquisition-queue inclusion for every reviewed or unreviewed open MyGroundBiz source state.

## Remaining limitation

The ledger proves that capture and review gaps are visible and queued; it does not resolve them. Nine reviewed/partial MyGroundBiz sources still lack original source bytes—two have partial hashed renders, five have transient full-review artifacts, and two remain transient-partial. Twenty-five not-acquired primary sources remain preserved for deliberate future acquisition and review. The six captured FCC videos are fully reviewed historical context and no longer contribute open queue rows.
