# Source identity and supersession audit

Status date: 2026-08-10

Purpose: distinguish verified duplicate files, strong identity candidates, related-but-distinct documents, and potential supersession. Filename or title similarity is not treated as byte identity or policy supersession.

## Resolved portal/Drive identity comparisons

Five MyGroundBiz downloads have supplied Google Drive counterparts. Original-byte or complete rendered-page comparison now resolves each relationship:

| MyGroundBiz source | Supplied Drive source | Matching evidence | Current treatment |
|---|---|---|---|
| `SRC-MGB-DOC-0001` | `SRC-GDRIVE-FILE-0014` | Exact basename/date; distinct SHA-256 values; 89/89 pages render identically | Preserve both originals and identities; retain mappings on the supplied source. |
| `SRC-MGB-DOC-0002` | `SRC-GDRIVE-FILE-0002` | Exact SHA-256 identity | Mark portal location as an exact duplicate and share the controlled archive object/mappings. The PDF-body OP-119 date issue remains separate. |
| `SRC-MGB-DOC-0003` | `SRC-GDRIVE-FILE-0001` | Exact SHA-256 identity | Mark portal location as an exact duplicate and share the controlled archive object/mappings. |
| `SRC-MGB-DOC-0004` | `SRC-GDRIVE-FILE-0004` | Exact SHA-256 identity | Mark portal location as an exact duplicate and share the controlled archive object/mappings. |
| `SRC-MGB-DOC-0005` | `SRC-GDRIVE-FILE-0015` | Exact SHA-256 identity | Mark portal location as an exact duplicate and share the controlled archive object/mappings. |

The four exact pairs are marked with `duplicate_of` and retain independent portal identities without repeating operational extraction. OP-117 remains distinct at the byte level; complete rendered identity supports reuse of the finished page review but does not justify deleting or collapsing either source object.

## Related documents that must not be flattened into duplicates

- OP-117, OP-119, and MGB-119 overlap but have different scope, dates, detail, and authority. Newer OP-117 statements may control a same-scope conflict, but the documents are not wholesale replacements for one another.
- `Focus on Package Placement` and `Package Placement Quick Reference` address the same subject at different depth and use different language strength. Both remain separate evidence.
- The two undated hand-sheet images are similar reference examples, but absent identity/version metadata and visible content differences prevent duplicate or supersession classification.
- The FORGE Business Closure and Settings filenames imply version 2.2.0 while their bodies show 2.0.0. No version precedence is inferred until authoritative metadata resolves the mismatch.
- The Authenticated Delivery screenshot and MyGroundBiz announcement are two representations of the same time-sensitive announcement. They remain historical launch evidence; the later fully reviewed FORGE 3.3 guide controls the active conditional Ground workflow.

## Supersession controls

No primary inventory row is currently marked definitively superseded solely from filename chronology. Operational conflicts are handled at the knowledge-record level and remain `CONFLICT`, `POTENTIALLY_OUTDATED`, or `HUMAN_REVIEW_REQUIRED` until a controlling source establishes precedence. The executed ISP Agreement remains controlling where the reviewed OP-117 says the Agreement controls.

## Authenticated follow-up

1. Revalidate these relationships only when a portal version or byte hash changes.
2. Acquire current FORGE version documentation before resolving remaining filename/body version mismatches.
3. Acquire current OP-207/OP-207Res and status-code references before classifying the hand sheets as superseded.
4. Recheck FAD only when newer authoritative material materially conflicts with or supersedes the current FORGE 3.3 workflow.
