# Source archive integrity audit

Status date: 2026-08-09

Purpose: prove that every locally archived Google Drive source object is inventoried, checksum-protected, present on disk, unchanged since acquisition, and reconciled from the complete ZIP to its extracted source record. This audit covers the original durable Drive archive objects; `source_capture_coverage_audit.md` separately reconciles durable-capture status across all 106 primary sources.

## Result

- The Google Drive browser inventory contains 18 archived objects: one complete folder ZIP snapshot and 17 extracted direct-child files.
- All 18 inventory paths exist on disk.
- The archive directory contains exactly those 18 objects and no untracked files.
- `inventory/source_checksums.sha256` contains 43 unique path/digest entries, including all 18 Google Drive archive objects and all current durable MyGroundBiz captures.
- All 43 current SHA-256 digests match the manifest.
- `inventory/google_drive_zip_member_inventory.csv` contains exactly 17 ZIP-member rows and maps every member one-to-one to a distinct `SRC-GDRIVE-FILE-*` record.
- Every ZIP member and its extracted source file have the same SHA-256 digest. The mapping does not depend on filename equality, which protects the non-ASCII screenshot filename from ZIP-decoding differences.
- All 17 mapped extracted source records remain `FULLY_REVIEWED`; member identity does not substitute for or expand the existing review evidence.

## Repair made

The checksum manifest originally protected the 17 extracted files but not the complete ZIP snapshot. The ZIP digest is now included. A direct `shasum -c` invocation from the research subdirectory also failed because manifest paths are workspace-root-relative; this was an invocation-context problem, not a byte mismatch. The corpus validator now resolves paths from the workspace root and verifies bytes independently of the caller's working directory.

## Regression controls

The corpus validator now rejects:

- A Google Drive browser source with a missing archive path.
- An archive file absent from the source inventory.
- An inventory archive path absent from the checksum manifest.
- Duplicate or malformed checksum rows.
- Missing files or SHA-256 mismatches.
- Any untracked file added under the controlled Google Drive archive directory.
- Any ZIP member without exactly one extracted-source content-hash match.
- Duplicate ZIP member paths, duplicate mapped source IDs, stale member metadata, or a missing/extra `SRC-GDRIVE-FILE-*` mapping.

For independent command-line verification from the Ready Route repository root:

`shasum -a 256 -c research/fedex-ground-driver-knowledge/inventory/source_checksums.sha256`

This validates archive identity only. It does not prove that a Drive file is byte-identical to a similarly named MyGroundBiz download; those five candidate pairs remain in the authenticated identity-comparison queue.

The broader 106-source capture ledger identifies nine fully reviewed and five partially reviewed MyGroundBiz sources that currently lack original source-byte archives. Dog Bite Prevention has complete hashed page renders; OP-135 and the rejected version-ambiguous pickup sheet have partial hashed page renders. Their original-byte gap remains explicit and is not an archive-integrity failure.
