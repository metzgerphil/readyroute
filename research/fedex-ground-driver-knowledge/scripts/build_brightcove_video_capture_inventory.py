#!/usr/bin/env python3
"""Build the offline-validated capture ledger for acquired Brightcove videos."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent.parent
SOURCE_INVENTORY = ROOT / "inventory/source_inventory.csv"
METADATA_DIR = ROOT / "captures/mygroundbiz/brightcove"
OUTPUT = ROOT / "inventory/mygroundbiz_brightcove_video_capture.csv"

FIELDS = [
    "source_id",
    "video_id",
    "catalog_name",
    "created_at",
    "updated_at",
    "duration_ms",
    "width",
    "height",
    "avg_bitrate",
    "expected_size_bytes",
    "actual_size_bytes",
    "sha256",
    "local_archive_path",
    "metadata_capture_path",
    "speech_caption_status",
    "acquired_at",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_rows() -> list[dict[str, str]]:
    with SOURCE_INVENTORY.open(encoding="utf-8", newline="") as handle:
        sources = [
            row
            for row in csv.DictReader(handle)
            if row["source_id"].startswith("SRC-MGB-VIDEO-")
        ]
    if len(sources) != 6:
        raise ValueError(f"expected six video source rows, found {len(sources)}")

    rows: list[dict[str, str]] = []
    for source in sorted(sources, key=lambda row: row["source_id"]):
        metadata_matches = sorted(METADATA_DIR.glob(f"{source['source_id']}-*.json"))
        if len(metadata_matches) != 1:
            raise ValueError(
                f"{source['source_id']}: expected one metadata capture, "
                f"found {len(metadata_matches)}"
            )
        metadata_path = metadata_matches[0]
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("source_id") != source["source_id"]:
            raise ValueError(f"{source['source_id']}: metadata source ID mismatch")
        local_archive_path = str(metadata.get("local_archive_path") or "")
        if local_archive_path != source["local_archive_path"]:
            raise ValueError(f"{source['source_id']}: local archive path mismatch")
        media_path = WORKSPACE_ROOT / local_archive_path
        if not media_path.is_file():
            raise ValueError(f"{source['source_id']}: missing MP4 {media_path}")
        digest = sha256_file(media_path)
        if digest != metadata.get("sha256"):
            raise ValueError(f"{source['source_id']}: MP4/metadata hash mismatch")
        selected = metadata.get("selected_rendition") or {}
        expected_size = int(selected.get("size") or 0)
        actual_size = media_path.stat().st_size
        if expected_size and actual_size != expected_size:
            raise ValueError(f"{source['source_id']}: MP4 size mismatch")
        speech_tracks = metadata.get("speech_caption_tracks") or []
        rows.append(
            {
                "source_id": source["source_id"],
                "video_id": str(metadata.get("video_id") or ""),
                "catalog_name": str(metadata.get("catalog_name") or ""),
                "created_at": str(metadata.get("created_at") or ""),
                "updated_at": str(metadata.get("updated_at") or ""),
                "duration_ms": str(metadata.get("duration_ms") or ""),
                "width": str(selected.get("width") or ""),
                "height": str(selected.get("height") or ""),
                "avg_bitrate": str(selected.get("avg_bitrate") or ""),
                "expected_size_bytes": str(expected_size or ""),
                "actual_size_bytes": str(actual_size),
                "sha256": digest,
                "local_archive_path": local_archive_path,
                "metadata_capture_path": str(metadata_path.relative_to(ROOT)),
                "speech_caption_status": (
                    "PRESENT" if speech_tracks else "NONE_EXPOSED_BY_PLAYBACK_API"
                ),
                "acquired_at": str(metadata.get("acquired_at") or ""),
            }
        )
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} Brightcove capture rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
