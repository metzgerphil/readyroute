#!/usr/bin/env python3
"""Build an exact member-to-source ledger for the supplied Google Drive ZIP."""

from __future__ import annotations

import csv
import hashlib
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent.parent
SOURCE_INVENTORY = ROOT / "inventory/source_inventory.csv"
OUTPUT = ROOT / "inventory/google_drive_zip_member_inventory.csv"
ARCHIVE_SOURCE_ID = "SRC-GDRIVE-BROWSER-ROOT-0001"

FIELDS = [
    "member_order",
    "archive_source_id",
    "archive_local_path",
    "member_path",
    "member_size_bytes",
    "compressed_size_bytes",
    "crc32",
    "member_sha256",
    "mapped_source_id",
    "extracted_local_archive_path",
    "extracted_sha256",
    "review_status",
    "mapping_status",
]


def load_inventory() -> list[dict[str, str]]:
    with SOURCE_INVENTORY.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_rows() -> list[dict[str, str]]:
    inventory = load_inventory()
    by_id = {row["source_id"]: row for row in inventory}
    archive_row = by_id.get(ARCHIVE_SOURCE_ID)
    if archive_row is None:
        raise SystemExit(f"missing archive source {ARCHIVE_SOURCE_ID}")

    archive_local_path = archive_row["local_archive_path"]
    archive_path = WORKSPACE_ROOT / archive_local_path
    if not archive_path.is_file():
        raise SystemExit(f"missing Google Drive ZIP: {archive_path}")

    extracted_by_hash: dict[str, list[dict[str, str]]] = {}
    for row in inventory:
        if not row["source_id"].startswith("SRC-GDRIVE-FILE-"):
            continue
        local_path = row["local_archive_path"]
        path = WORKSPACE_ROOT / local_path
        if not path.is_file():
            raise SystemExit(f"{row['source_id']}: missing extracted source {path}")
        digest = sha256_file(path)
        extracted_by_hash.setdefault(digest, []).append(row)

    rows: list[dict[str, str]] = []
    with zipfile.ZipFile(archive_path) as archive:
        members = [info for info in archive.infolist() if not info.is_dir()]
        for order, info in enumerate(members, 1):
            data = archive.read(info)
            member_digest = sha256_bytes(data)
            matches = extracted_by_hash.get(member_digest, [])
            if len(matches) != 1:
                raise SystemExit(
                    f"{info.filename!r}: expected one extracted source hash match, "
                    f"found {[row['source_id'] for row in matches]}"
                )
            source = matches[0]
            rows.append(
                {
                    "member_order": str(order),
                    "archive_source_id": ARCHIVE_SOURCE_ID,
                    "archive_local_path": archive_local_path,
                    "member_path": info.filename,
                    "member_size_bytes": str(info.file_size),
                    "compressed_size_bytes": str(info.compress_size),
                    "crc32": f"{info.CRC:08x}",
                    "member_sha256": member_digest,
                    "mapped_source_id": source["source_id"],
                    "extracted_local_archive_path": source["local_archive_path"],
                    "extracted_sha256": member_digest,
                    "review_status": source["review_status"],
                    "mapping_status": "EXACT_CONTENT_HASH_MATCH",
                }
            )

    expected_source_ids = {
        row["source_id"]
        for row in inventory
        if row["source_id"].startswith("SRC-GDRIVE-FILE-")
    }
    mapped_source_ids = {row["mapped_source_id"] for row in rows}
    if mapped_source_ids != expected_source_ids or len(rows) != len(expected_source_ids):
        raise SystemExit(
            "Google Drive ZIP/source mapping mismatch: "
            f"missing={sorted(expected_source_ids - mapped_source_ids)}, "
            f"extra={sorted(mapped_source_ids - expected_source_ids)}, "
            f"members={len(rows)}, sources={len(expected_source_ids)}"
        )
    return rows


def write_rows(rows: list[dict[str, str]]) -> None:
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    rows = build_rows()
    write_rows(rows)
    print(f"wrote {len(rows)} Google Drive ZIP member rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
