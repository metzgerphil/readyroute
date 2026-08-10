# Source identity and supersession audit

Status date: 2026-08-08

Purpose: distinguish verified duplicate files, strong identity candidates, related-but-distinct documents, and potential supersession. Filename or title similarity is not treated as byte identity or policy supersession.

## Strong portal/Drive identity candidates awaiting byte comparison

Five MyGroundBiz download links have supplied Google Drive counterparts with matching titles or exact URL basenames and matching dates or document identifiers:

| MyGroundBiz source | Supplied Drive source | Matching evidence | Current treatment |
|---|---|---|---|
| `SRC-MGB-DOC-0001` | `SRC-GDRIVE-FILE-0014` | Exact `On-the-Road-Reference-GuideOP117MGB121525v2` basename; 2025-12-15; OP-117 v2 | Drive copy fully reviewed; portal source remains unreviewed until downloaded bytes can be compared. |
| `SRC-MGB-DOC-0002` | `SRC-GDRIVE-FILE-0002` | Exact `CustomerExperienceGuideUS10282024` basename/date | Drive copy fully reviewed; portal byte identity unverified. The PDF body says OP-119 last update 2024-09-09, creating a separate filename/body-date issue. |
| `SRC-MGB-DOC-0003` | `SRC-GDRIVE-FILE-0001` | MGB-119 identifier and 2025-11-06 date | Drive copy fully reviewed; portal byte identity unverified. |
| `SRC-MGB-DOC-0004` | `SRC-GDRIVE-FILE-0004` | Matching title and 2024-11-15 date | Drive copy fully reviewed; portal byte identity unverified. |
| `SRC-MGB-DOC-0005` | `SRC-GDRIVE-FILE-0015` | Exact `Package-placement_quick-reference` basename and 2025-02-13 date | Drive copy fully reviewed; portal byte identity unverified. |

These pairs are cross-referenced, not marked `duplicate_of`. After authenticated download, compare SHA-256 hashes. Identical bytes may be represented as duplicate source locations without repeating extraction; different bytes require a document-level diff and independent review.

## Related documents that must not be flattened into duplicates

- OP-117, OP-119, and MGB-119 overlap but have different scope, dates, detail, and authority. Newer OP-117 statements may control a same-scope conflict, but the documents are not wholesale replacements for one another.
- `Focus on Package Placement` and `Package Placement Quick Reference` address the same subject at different depth and use different language strength. Both remain separate evidence.
- The two undated hand-sheet images are similar reference examples, but absent identity/version metadata and visible content differences prevent duplicate or supersession classification.
- The FORGE Business Closure and Settings filenames imply version 2.2.0 while their bodies show 2.0.0. No version precedence is inferred until authoritative metadata resolves the mismatch.
- The Authenticated Delivery screenshot and MyGroundBiz announcement are two representations of the same time-sensitive announcement. The screenshot is corroborating evidence, not proof of current Ground availability.

## Supersession controls

No primary inventory row is currently marked definitively superseded solely from filename chronology. Operational conflicts are handled at the knowledge-record level and remain `CONFLICT`, `POTENTIALLY_OUTDATED`, or `HUMAN_REVIEW_REQUIRED` until a controlling source establishes precedence. The executed ISP Agreement remains controlling where the reviewed OP-117 says the Agreement controls.

## Authenticated follow-up

1. Download the five MyGroundBiz documents above and calculate SHA-256 hashes.
2. If hashes differ, compare metadata, page count, and page text before changing review or duplicate status.
3. Acquire current FORGE version documentation before resolving filename/body version mismatches.
4. Acquire current OP-207/OP-207Res and status-code references before classifying the hand sheets as superseded.
5. Recheck the time-sensitive Authenticated Delivery article for a later Ground launch notice.

