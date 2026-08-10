#!/usr/bin/env python3
"""Build one-row-per-source durable-capture and reproducibility coverage."""

from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
INVENTORY_PATH = ROOT / "inventory/source_inventory.csv"
CHECKSUM_PATH = ROOT / "inventory/source_checksums.sha256"
OUTPUT_PATH = ROOT / "inventory/source_capture_coverage.csv"
RENDERED_CAPTURE_PATH = ROOT / "inventory/rendered_source_capture_coverage.csv"


FIELDS = [
    "source_id",
    "title",
    "source_system",
    "source_type",
    "review_status",
    "capture_status",
    "local_archive_path",
    "checksum_sha256",
    "review_artifact_path",
    "reproducibility_level",
    "knowledge_use_gate",
    "required_follow_up",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_checksums() -> dict[str, str]:
    result: dict[str, str] = {}
    for line_number, raw in enumerate(
        CHECKSUM_PATH.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not raw.strip():
            continue
        try:
            digest, relative_path = raw.split("  ", 1)
        except ValueError as exc:
            raise ValueError(f"malformed checksum row {line_number}") from exc
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or relative_path in result:
            raise ValueError(f"invalid or duplicate checksum row {line_number}")
        result[relative_path] = digest
    return result


def build_rows() -> list[dict[str, str]]:
    inventory = load_csv(INVENTORY_PATH)
    checksums = load_checksums()
    rendered_rows = load_csv(RENDERED_CAPTURE_PATH)
    rendered_by_source = {row["source_id"]: row for row in rendered_rows}
    if len(rendered_by_source) != len(rendered_rows):
        raise ValueError("duplicate rendered source capture row")
    inventory_ids = {row["source_id"] for row in inventory}
    if set(rendered_by_source) - inventory_ids:
        raise ValueError("rendered capture references unknown source")
    rows: list[dict[str, str]] = []

    for source in inventory:
        source_id = source["source_id"]
        review_status = source["review_status"]
        archive_path = source["local_archive_path"]
        output_capture_path = archive_path
        rendered = rendered_by_source.get(source_id)
        review_artifact = ROOT / "reviews" / f"{source_id}.md"
        review_artifact_path = (
            str(review_artifact.relative_to(ROOT))
            if review_status in {"FULLY_REVIEWED", "PARTIALLY_REVIEWED"}
            else ""
        )
        if review_artifact_path and not review_artifact.is_file():
            raise ValueError(f"reviewed source lacks review artifact: {source_id}")

        if archive_path:
            if rendered:
                raise ValueError(f"source has both original archive and rendered capture: {source_id}")
            if archive_path not in checksums:
                raise ValueError(f"archived source lacks checksum: {source_id}")
            capture_status = "LOCAL_ARCHIVE_HASHED"
            checksum = checksums[archive_path]
            reproducibility = "DURABLE_LOCAL_BYTES"
            if review_status == "FULLY_REVIEWED":
                use_gate = "CAPTURE_COMPLETE_AUTHORITY_CURRENCY_AND_SCOPE_REMAIN_SEPARATELY_GATED"
                follow_up = "Reacquire and compare only when source identity version or modification evidence changes."
            else:
                use_gate = "LOCAL_BYTES_PRESENT_BUT_REVIEW_STATUS_LIMITS_KNOWLEDGE_USE"
                follow_up = "Complete source review before expanding knowledge use."
        elif rendered:
            completeness = rendered["capture_completeness"]
            valid_review_state = (
                completeness == "FULL" and review_status == "FULLY_REVIEWED"
            ) or (
                completeness == "PARTIAL" and review_status == "PARTIALLY_REVIEWED"
            )
            if not valid_review_state or rendered["original_bytes_acquired"] != "false":
                raise ValueError(f"invalid rendered capture state: {source_id}")
            if not rendered["coverage_notes"].strip():
                raise ValueError(f"rendered capture lacks coverage notes: {source_id}")
            capture_directory = ROOT / rendered["capture_directory"]
            manifest_path = ROOT / rendered["manifest_path"]
            if manifest_path.parent != capture_directory or not manifest_path.is_file():
                raise ValueError(f"invalid rendered capture manifest path: {source_id}")
            manifest_entries = []
            for raw in manifest_path.read_text(encoding="utf-8").splitlines():
                digest, filename = raw.split("  ", 1)
                page_path = capture_directory / filename
                if not re.fullmatch(r"[0-9a-f]{64}", digest) or not page_path.is_file():
                    raise ValueError(f"invalid rendered page entry: {source_id}:{filename}")
                actual = hashlib.sha256(page_path.read_bytes()).hexdigest()
                if actual != digest:
                    raise ValueError(f"rendered page checksum mismatch: {source_id}:{filename}")
                manifest_entries.append(filename)
            if len(manifest_entries) != int(rendered["page_count"]) or len(set(manifest_entries)) != len(manifest_entries):
                raise ValueError(f"rendered page count/identity mismatch: {source_id}")
            checksum = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
            output_capture_path = rendered["capture_directory"]
            if completeness == "FULL":
                capture_status = "RENDERED_PAGE_CAPTURE_HASHED"
                reproducibility = "DURABLE_RENDERED_PAGES_NOT_ORIGINAL_BYTES"
                use_gate = "RENDERED_CONTENT_REVIEWABLE_ORIGINAL_BYTES_REQUIRED_FOR_BYTE_IDENTITY"
                follow_up = "Acquire and hash the original source bytes, compare identity/version, and retain the rendered pages as review evidence."
            else:
                capture_status = "RENDERED_PARTIAL_PAGE_CAPTURE_HASHED"
                reproducibility = "DURABLE_RENDERED_PARTIAL_PAGES_NOT_ORIGINAL_BYTES"
                use_gate = "ONLY_EXACT_REVIEWED_RENDERED_PORTIONS_MAY_SUPPORT_KNOWLEDGE"
                follow_up = "Acquire the complete original source or complete page renders, review every unseen region, and revalidate the supported scopes."
        elif review_status == "FULLY_REVIEWED":
            capture_status = "TRANSIENT_REVIEW_ARTIFACT_ONLY"
            checksum = ""
            reproducibility = "REVIEW_ARTIFACT_AND_REMOTE_LOCATOR_ONLY"
            use_gate = "REVIEWED_CONTENT_MAPPED_BUT_DURABLE_SOURCE_CAPTURE_UNAVAILABLE"
            follow_up = "Durably recapture the exact page or file and reconcile it before any source-change or supersession claim."
        elif review_status == "PARTIALLY_REVIEWED":
            capture_status = "TRANSIENT_PARTIAL_REVIEW"
            checksum = ""
            reproducibility = "REVIEWED_PORTION_ARTIFACT_AND_REMOTE_LOCATOR_ONLY"
            use_gate = "ONLY_EXACT_REVIEWED_PORTION_MAY_SUPPORT_KNOWLEDGE"
            follow_up = "Acquire a durable complete source and review every unseen section before expanding knowledge use."
        elif review_status == "NOT_YET_REVIEWED":
            capture_status = "NOT_ACQUIRED"
            checksum = ""
            reproducibility = "NONE"
            use_gate = "NO_EXTRACTION_ALLOWED"
            follow_up = "Acquire durably and complete review before creating evidence mappings."
        elif review_status == "INACCESSIBLE":
            capture_status = "INACCESSIBLE_NO_CAPTURE"
            checksum = ""
            reproducibility = "NONE"
            use_gate = "NO_EXTRACTION_ALLOWED"
            follow_up = "Retry only if authorized access changes; preserve the inaccessible reason."
        else:
            raise ValueError(f"unknown review status for {source_id}: {review_status}")

        rows.append(
            {
                "source_id": source_id,
                "title": source["title"],
                "source_system": source["source_system"],
                "source_type": source["source_type"],
                "review_status": review_status,
                "capture_status": capture_status,
                "local_archive_path": output_capture_path,
                "checksum_sha256": checksum,
                "review_artifact_path": review_artifact_path,
                "reproducibility_level": reproducibility,
                "knowledge_use_gate": use_gate,
                "required_follow_up": follow_up,
            }
        )
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} source-capture coverage rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
