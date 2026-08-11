# Source archive integrity audit

Status date: 2026-08-10

Purpose: prove that every locally archived Google Drive source object is inventoried, checksum-protected, present on disk, unchanged since acquisition, and reconciled from the complete ZIP to its extracted source record. This audit covers the original durable Drive archive objects; `source_capture_coverage_audit.md` separately reconciles durable-capture status across all 123 primary sources.

## Result

- The Google Drive browser inventory contains 18 archived objects: one complete folder ZIP snapshot and 17 extracted direct-child files.
- All 18 inventory paths exist on disk.
- The archive directory contains exactly those 18 objects and no untracked files.
- `inventory/source_checksums.sha256` contains 73 unique path/digest entries, including all 18 original Google Drive archive objects, the complete FORGE 3.3, OP-130/132/135, Dog Bite Prevention, Equipment Terms, SRS/SRI, Vehicle Appearance, OP-117, pickup-reference originals, the two owner-uploaded safety originals, two official public compliance sources, and all current durable MyGroundBiz captures.
- All 73 current SHA-256 digests match the manifest.
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

This validates archive identity only. Four portal/Drive candidates are now byte-identical. Portal OP-117 remains a distinct-byte object whose 89 rendered pages match the reviewed Drive copy.

The broader 123-source capture ledger identifies five fully reviewed and four partially reviewed MyGroundBiz sources that currently lack original source-byte archives. Two partial sources have hashed page renders; the remaining reviewed sources are explicitly transient. Four byte-identical portal/Drive source pairs share controlled archive paths, so the 81 `LOCAL_ARCHIVE_HASHED` source rows resolve through the 73-entry checksum manifest. Their remaining deferred original-byte gaps stay explicit and are not archive-integrity failures.
