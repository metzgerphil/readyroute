# Safety Topic Library coverage audit

Status date: 2026-08-09

Purpose: make every expanded Safety Topic Library child accountable as an acquired primary source or a unique-resource acquisition backlog item, without treating titles as operational evidence.

## Coverage result

- 77 displayed library entries are inventoried.
- Those entries resolve to 74 unique document URLs.
- Three URL groups are duplicate listings: Cognitive Distraction, Distracted Driving, and Sideswipe Collisions each appear twice under different library dates/entries.
- Dog Bite Prevention is represented by `SRC-MGB-DOC-0011`; all seven pages are visually reviewed from page-addressed authenticated viewer renders, and pages 3-6 support the extracted animal-encounter safety record.
- The other 76 listings resolve to 73 unique unacquired documents, now represented one-for-one in `inventory/mygroundbiz_safety_topic_backlog.csv`.
- Every duplicate listing is attached to its canonical backlog resource so it cannot be counted as separate acquisition progress.

## Status repair

`MGB-SAFETY-TOPIC-0019` now matches the `FULLY_REVIEWED`/`HIGH_RELEVANCE` state of `SRC-MGB-DOC-0011`. Pages 3-6 establish avoidance, approaching-dog, knockdown, and wound-response guidance. A complete-review boundary separately records that the topic does not state a delivery status, package disposition, or internal business-reporting procedure.

## Required action for each unique backlog resource

1. Download and archive the authoritative document.
2. Calculate a checksum and preserve title/date/version/page count.
3. Review every page, including diagrams and image-only content.
4. Inventory referenced sources and distinguish duplicate/superseded versions.
5. Promote only source-established operational knowledge with exact locators and the appropriate status.
6. Remove the resource from the backlog only after a primary source row and review artifact are reconciled.

## Regression controls

The corpus validator now enforces:

- Valid duplicate-of IDs with identical URLs.
- Review/relevance agreement between a library item and any matching primary source.
- Exact equality between unique unrepresented library URLs and canonical backlog rows.
- Exact duplicate-alias membership for each backlog resource.
- `NOT_YET_REVIEWED`/`PENDING_ASSESSMENT` status for every item whose URL lacks a primary source.

This audit proves inventory accountability, not content completeness. Seventy-three unique Safety Topic documents remain unacquired. Dog Bite Prevention is fully reviewed, but its original PDF bytes remain a durable-recapture target; the seven page-addressed review screenshots and hashes are preserved under `captures/mygroundbiz/SRC-MGB-DOC-0011/`.

All 73 unique unacquired documents now occupy Wave 1 of `inventory/mygroundbiz_authenticated_acquisition_queue.csv` so durable direct-asset acquisition is attempted before short-lived authentication expires. Download alone does not satisfy the complete-review gate.
