# Brightcove FCC video capture audit

Status date: 2026-08-09

## Scope

The fully reviewed MyGroundBiz Customer Experience and Pickup Coordination page exposes six exact Brightcove video URLs. These are authoritative linked resources, but the parent page, video titles, and catalog metadata do not establish their operational contents.

## Acquisition result

- All six source URLs resolve to the same FedEx Brightcove account recorded in the original links.
- The exact video IDs in the source inventory match the playback-catalog IDs.
- Six HTTPS MP4 renditions were durably downloaded, totaling 94,138,756 bytes.
- Catalog metadata preserves each video's name, creation timestamp, update timestamp, duration, selected rendition dimensions/bitrate/expected size, and acquisition date.
- Every downloaded byte count matches the catalog rendition size.
- Every MP4 has a SHA-256 digest in `inventory/source_checksums.sha256`.
- `inventory/mygroundbiz_brightcove_video_capture.csv` reconciles all six source IDs one-to-one with their MP4 and stable metadata capture.
- The playback API exposes thumbnail tracks only. It exposes no `captions` or `subtitles` speech track for any of the six videos.

## Review boundary

All six sources remain `NOT_YET_REVIEWED`. Durable capture changes reproducibility, not knowledge authority or review completion. No title, duration, thumbnail, catalog tag, or parent-page description is used as an operational instruction.

Complete review requires both audio and visual examination. The configured transcription workflow cannot run because `OPENAI_API_KEY` is not currently set, and no publisher caption track is available. Until a complete transcript and visual pass are finished:

- no source-to-knowledge mapping may be created;
- no procedure, condition, exception, prohibition, or escalation may be inferred;
- the sources remain `UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN` in the work queue.

## Mainstream-priority disposition

On 2026-08-09 the user directed the active pass to focus on current, mainstream information affecting most contractors. All six videos were created and last catalog-updated in 2017 and concern the FCC system. They therefore remain inventoried but are deferred to `WAVE_5_DEFERRED_HISTORICAL_VIDEO_REVIEW`, after current driver-facing operational sources.

A visual-only sampling pass was started for `SRC-MGB-VIDEO-0005` before that priority decision. Thirty-eight frames at approximately two-second intervals and three contact sheets are preserved under `reviews/video_visual/SRC-MGB-VIDEO-0005/`. The visible material is an FCC Pickup Alerts dashboard demonstration and includes an on-screen yellow/red pickup-alert timing legend. This observation is not promoted into operational guidance: the narration is untranscribed, the source is from 2017, and complete current applicability is not established. The other five videos were not visually reviewed. All six source statuses remain `NOT_YET_REVIEWED`.

## Automated controls

`scripts/acquire_brightcove_videos.py` reacquires the exact video IDs from their inventoried player links and writes stable metadata plus MP4 files. `scripts/build_brightcove_video_capture_inventory.py` regenerates the local capture ledger without network access. `scripts/validate_corpus_integrity.py` rejects:

- a missing or duplicate video source/capture;
- catalog/source ID drift;
- a local-archive path mismatch;
- an MP4 whose byte count or hash differs from preserved metadata;
- a capture hash absent from the checksum manifest;
- stale capture-ledger output;
- any captured video incorrectly promoted beyond `NOT_YET_REVIEWED` before a complete review artifact exists.

## Remaining action

Defer transcription and complete audio-visual review until a current source or unresolved mainstream procedure points to FCC material, or until the later exhaustive-completeness pass. At that time, configure the transcription workflow locally or supply authoritative captions/transcripts, transcribe all six videos, visually review each complete MP4, inventory every referenced artifact or procedure, then reconcile source review status and create only evidence-supported knowledge mappings.
