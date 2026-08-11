# Brightcove FCC video capture and review audit

Status date: 2026-08-10

## Scope and acquisition

The fully reviewed MyGroundBiz Customer Experience and Pickup Coordination page exposes six exact Brightcove video URLs. All six video IDs resolve to the preserved FedEx catalog metadata and checksum-protected MP4 files.

- Six MP4s total 94,138,756 bytes.
- Catalog identity, creation/update timestamp, duration, rendition dimensions/bitrate, expected size, actual size, and SHA-256 are reconciled in `inventory/mygroundbiz_brightcove_video_capture.csv`.
- Every hash is enforced by `inventory/source_checksums.sha256`.
- The playback API exposes no publisher speech captions or subtitles.

## Complete review result

All six videos are now `FULLY_REVIEWED`. Each source has:

- a source-specific review at `reviews/SRC-MGB-VIDEO-0001.md` through `0006.md`;
- an unedited local machine-transcript review aid under `reviews/video_transcripts/`;
- a complete time-addressed visual timeline and three contact sheets under `reviews/video_visual/<source_id>/`;
- the original checksum-preserved MP4 and catalog metadata.

The audio was transcribed locally with `mlx-whisper` 0.4.3 and `mlx-community/whisper-small-mlx`. The machine output is not evidence by itself. Known errors are preserved and called out in the source reviews, including repeated recognition of “pickup” as “pitch up” and a hallucinated repeated sentence after the substantive narration in the Messaging video. Audio findings were accepted only after comparison with the original MP4 and the complete visual sequence.

## Operational disposition

The videos were created and last catalog-updated in 2017. They demonstrate the old FCC desktop interface for Authorized Officers and Business Contacts: overview/access, messaging, P&D manifests, service-area status, pickup alerts, and pickup planning. They are business-management and historical FCC/STAR context, not modern driver-at-stop instructions.

No video creates a distinct current canonical knowledge mapping. They do not override current OP-117 or FORGE material, resolve current driver custody or authority gaps, or authorize a driver action from an old screen control. Historical observations remain available for audit and comparison.

## Automated controls

`scripts/build_brightcove_video_capture_inventory.py` regenerates the capture ledger without network access. `scripts/validate_corpus_integrity.py` rejects:

- missing or duplicate video source/capture rows;
- catalog/source ID, archive-path, byte-count, metadata-hash, or checksum-manifest drift;
- unsupported caption status;
- a video marked fully reviewed without its source review, transcript aid, visual timeline, and exactly three contact sheets;
- stale capture, source-capture, source-knowledge, or acquisition-queue output.

Review completion changes source coverage and removes six captured-review tasks from the authenticated acquisition queue. It does not change any canonical operational record or publication status.
