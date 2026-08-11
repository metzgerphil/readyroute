# Workspace restoration and archive validation audit

Status date: 2026-08-10

## Scope

The source-bearing original workspace was located at `/Volumes/USB322FD/readyroute`. The portable clone is `/Users/phillipmetzger/Documents/readyroute-workspace`. The excluded directories named by `WORKSPACE_TRANSFER.md` were compared and copied with existing destination files preserved:

- `research/fedex-ground-driver-knowledge/sources/`
- `research/fedex-ground-driver-knowledge/captures/`
- `research/fedex-ground-driver-knowledge/reviews/video_visual/`

The copy used archive-preserving, ignore-existing semantics. No source file was moved, deleted, or overwritten on either workspace.

## Pre-copy comparison

| Directory | USB files | Clone files | Result |
| --- | ---: | ---: | --- |
| `sources/` | 24 | 38 | Clone already contained every USB source plus newer acquisitions. |
| `captures/` | 68 | 227 | Clone already contained every USB capture plus newer captures. |
| `reviews/video_visual/` | 42 | 42 | File sets matched. |

Checksum-aware dry-run comparison found no USB file absent from the clone. One same-path file differed: `captures/mygroundbiz/SRC-MGB-DOC-0008/manifest.sha256`. The clone manifest is a strict extension of the USB manifest: the same five page hashes plus the later `page-01-complete.jpg` hash. The newer clone manifest was correctly preserved.

Post-copy `rsync --ignore-existing --itemize-changes` comparisons returned no missing file in any of the three directories.

## Byte verification

From the workspace root, `sha256sum -c research/fedex-ground-driver-knowledge/inventory/source_checksums.sha256` passed every one of the 69 registered archive and durable-capture entries. The full corpus validator independently rechecked the same controlled archive identities and found no missing, extra, or changed controlled source object.

## Portable and full-corpus validation

- `python3 scripts/validate_knowledge.py`: 144 records valid.
- `python3 scripts/validate_reference_data.py`: 57 reference records valid; documented numeric-namespace collisions and translation classifications intact.
- `npm run knowledge:release`: build and release validation passed with 144 records, 123 sources, 192 formal cases, 97 publication-ready records, zero evidence-gated eligible records, seven active adjudications, and 17 manifest files verified.
- `npm --prefix backend run knowledge:validate-retrieval`: 192/192 top-1, 192/192 top-5, 192/192 response-mode matches, and zero unsafe-answer gating failures.
- `python3 scripts/validate_corpus_integrity.py`: passed across all source, inventory, evidence, taxonomy, claim, allocation, language, interaction, archive, and backlog ledgers.

## Research continuation

The restored archive does not itself close the remaining Phase 1 source obligations because the clone was already the newer superset. The first publication-gap recapture targets remain `SRC-MGB-DOC-0038` (Sideswipe Collisions) and `SRC-MGB-DOC-0039` (Summer Driving). Their complete rendered captures are hashed and reviewed, but original PDF bytes remain unavailable. A current recapture attempt reached MyGroundBiz `Access Denied`, and the connected supplied Drive folder does not contain either filename. Their six dependent `SOURCE_VERIFIED` records therefore remain publication-gated; no evidence standard was weakened.

The controlling next work remains current, mainstream source acquisition: original bytes for those two documents, current OP-324/OP-321 and OP-207/OP-207Res material, HZ-035/SF-920P/ERG and relay guidance, current vehicle/security standards, and the named current safety handbooks. Older and customer-specific material remains deferred behind those sources.
