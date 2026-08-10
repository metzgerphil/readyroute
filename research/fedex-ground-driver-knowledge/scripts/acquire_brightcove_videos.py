#!/usr/bin/env python3
"""Acquire exact MP4 renditions for the six MyGroundBiz-linked FCC videos."""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_INVENTORY = ROOT / "inventory/source_inventory.csv"
MEDIA_DIR = ROOT / "sources/mygroundbiz/brightcove"
METADATA_DIR = ROOT / "captures/mygroundbiz/brightcove"
MANIFEST = ROOT / "inventory/mygroundbiz_brightcove_video_capture.csv"
WORKSPACE_RELATIVE_PREFIX = "research/fedex-ground-driver-knowledge/"

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


def request_bytes(url: str, headers: dict[str, str] | None = None) -> bytes:
    request_headers = {"Accept-Encoding": "gzip", **(headers or {})}
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    return gzip.decompress(data) if data.startswith(b"\x1f\x8b") else data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def workspace_relative(path: Path) -> str:
    return WORKSPACE_RELATIVE_PREFIX + str(path.relative_to(ROOT))


def load_sources() -> list[dict[str, str]]:
    with SOURCE_INVENTORY.open(encoding="utf-8", newline="") as handle:
        rows = [
            row
            for row in csv.DictReader(handle)
            if row["source_id"].startswith("SRC-MGB-VIDEO-")
        ]
    if len(rows) != 6:
        raise SystemExit(f"expected six MyGroundBiz video sources, found {len(rows)}")
    return rows


def parse_player_url(url: str) -> tuple[str, str, str]:
    parsed = urllib.parse.urlparse(url)
    parts = parsed.path.strip("/").split("/")
    if parsed.hostname != "players.brightcove.net" or len(parts) < 3:
        raise ValueError(f"unsupported Brightcove player URL: {url}")
    video_ids = urllib.parse.parse_qs(parsed.query).get("videoId", [])
    if len(video_ids) != 1 or not video_ids[0].isdigit():
        raise ValueError(f"missing exact videoId: {url}")
    return parts[0], parts[1], video_ids[0]


def main() -> int:
    sources = load_sources()
    account_id, _, _ = parse_player_url(sources[0]["url_or_path"])
    player_html = request_bytes(sources[0]["url_or_path"]).decode("utf-8")
    match = re.search(r'policyKey:"([^"]+)"', player_html)
    if not match:
        raise SystemExit("Brightcove player policy key not found")
    policy_key = match.group(1)

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    result: list[dict[str, str]] = []

    for source in sources:
        source_account, _, video_id = parse_player_url(source["url_or_path"])
        if source_account != account_id:
            raise SystemExit(f"{source['source_id']}: unexpected account {source_account}")
        api_url = (
            f"https://edge.api.brightcove.com/playback/v1/accounts/"
            f"{account_id}/videos/{video_id}"
        )
        metadata = json.loads(
            request_bytes(
                api_url, {"Accept": f"application/json;pk={policy_key}"}
            ).decode("utf-8")
        )
        if str(metadata.get("id")) != video_id:
            raise SystemExit(f"{source['source_id']}: catalog ID mismatch")
        speech_tracks = [
            track
            for track in metadata.get("text_tracks", [])
            if track.get("kind") in {"captions", "subtitles"}
        ]
        mp4_sources = [
            item
            for item in metadata.get("sources", [])
            if item.get("container") == "MP4"
            and str(item.get("src", "")).startswith("https://")
        ]
        if not mp4_sources:
            raise SystemExit(f"{source['source_id']}: no HTTPS MP4 rendition")
        selected = max(
            mp4_sources,
            key=lambda item: (
                int(item.get("width") or 0) * int(item.get("height") or 0),
                int(item.get("avg_bitrate") or 0),
            ),
        )

        media_path = MEDIA_DIR / f"{source['source_id']}-{video_id}.mp4"
        media_bytes = request_bytes(selected["src"])
        expected_size = int(selected.get("size") or 0)
        if expected_size and len(media_bytes) != expected_size:
            raise SystemExit(
                f"{source['source_id']}: expected {expected_size} bytes, "
                f"downloaded {len(media_bytes)}"
            )
        media_path.write_bytes(media_bytes)
        digest = sha256_file(media_path)

        stable_metadata = {
            "source_id": source["source_id"],
            "source_url": source["url_or_path"],
            "brightcove_account_id": account_id,
            "video_id": video_id,
            "catalog_name": metadata.get("name"),
            "created_at": metadata.get("created_at"),
            "updated_at": metadata.get("updated_at"),
            "duration_ms": metadata.get("duration"),
            "tags": metadata.get("tags", []),
            "speech_caption_tracks": speech_tracks,
            "selected_rendition": {
                key: selected.get(key)
                for key in (
                    "container",
                    "codec",
                    "width",
                    "height",
                    "avg_bitrate",
                    "size",
                )
            },
            "downloaded_size_bytes": len(media_bytes),
            "sha256": digest,
            "local_archive_path": workspace_relative(media_path),
            "acquired_at": date.today().isoformat(),
        }
        metadata_path = METADATA_DIR / f"{source['source_id']}-{video_id}.json"
        metadata_path.write_text(
            json.dumps(stable_metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        result.append(
            {
                "source_id": source["source_id"],
                "video_id": video_id,
                "catalog_name": str(metadata.get("name") or ""),
                "created_at": str(metadata.get("created_at") or ""),
                "updated_at": str(metadata.get("updated_at") or ""),
                "duration_ms": str(metadata.get("duration") or ""),
                "width": str(selected.get("width") or ""),
                "height": str(selected.get("height") or ""),
                "avg_bitrate": str(selected.get("avg_bitrate") or ""),
                "expected_size_bytes": str(expected_size or ""),
                "actual_size_bytes": str(len(media_bytes)),
                "sha256": digest,
                "local_archive_path": workspace_relative(media_path),
                "metadata_capture_path": str(metadata_path.relative_to(ROOT)),
                "speech_caption_status": (
                    "PRESENT" if speech_tracks else "NONE_EXPOSED_BY_PLAYBACK_API"
                ),
                "acquired_at": date.today().isoformat(),
            }
        )

    with MANIFEST.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(result)
    print(f"acquired {len(result)} Brightcove videos to {MEDIA_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
