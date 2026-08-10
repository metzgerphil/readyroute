#!/usr/bin/env python3
"""Classify every knowledge record by durability of its evidence sources."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / "knowledge/records.jsonl"
CAPTURE_PATH = ROOT / "inventory/source_capture_coverage.csv"
QUEUE_PATH = ROOT / "inventory/mygroundbiz_authenticated_acquisition_queue.csv"
OUTPUT_PATH = ROOT / "knowledge/evidence_capture_risk_coverage.csv"


FIELDS = [
    "knowledge_id",
    "knowledge_status",
    "evidence_source_ids",
    "durable_source_ids",
    "rendered_full_source_ids",
    "rendered_partial_source_ids",
    "transient_full_source_ids",
    "transient_partial_source_ids",
    "evidence_capture_class",
    "production_capture_gate",
    "authenticated_queue_resource_ids",
    "required_follow_up",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_records() -> list[dict]:
    return [
        json.loads(line)
        for line in RECORDS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def joined(values: set[str]) -> str:
    return ";".join(sorted(values))


def build_rows() -> list[dict[str, str]]:
    captures = {row["source_id"]: row for row in load_csv(CAPTURE_PATH)}
    queue_ids = {
        row["resource_id"] for row in load_csv(QUEUE_PATH)
    }
    rows: list[dict[str, str]] = []

    for record in load_records():
        evidence_ids = {item["source_id"] for item in record["evidence"]}
        missing_capture_rows = evidence_ids - set(captures)
        if missing_capture_rows:
            raise ValueError(
                f"missing source-capture rows for {record['knowledge_id']}: "
                f"{sorted(missing_capture_rows)}"
            )

        durable = {
            source_id
            for source_id in evidence_ids
            if captures[source_id]["capture_status"] == "LOCAL_ARCHIVE_HASHED"
        }
        rendered_full = {
            source_id
            for source_id in evidence_ids
            if captures[source_id]["capture_status"] == "RENDERED_PAGE_CAPTURE_HASHED"
        }
        rendered_partial = {
            source_id
            for source_id in evidence_ids
            if captures[source_id]["capture_status"] == "RENDERED_PARTIAL_PAGE_CAPTURE_HASHED"
        }
        transient_full = {
            source_id
            for source_id in evidence_ids
            if captures[source_id]["capture_status"]
            == "TRANSIENT_REVIEW_ARTIFACT_ONLY"
        }
        transient_partial = {
            source_id
            for source_id in evidence_ids
            if captures[source_id]["capture_status"] == "TRANSIENT_PARTIAL_REVIEW"
        }
        unsupported_capture_states = {
            captures[source_id]["capture_status"]
            for source_id in evidence_ids
        } - {
            "LOCAL_ARCHIVE_HASHED",
            "RENDERED_PAGE_CAPTURE_HASHED",
            "RENDERED_PARTIAL_PAGE_CAPTURE_HASHED",
            "TRANSIENT_REVIEW_ARTIFACT_ONLY",
            "TRANSIENT_PARTIAL_REVIEW",
        }
        if unsupported_capture_states:
            raise ValueError(
                f"knowledge evidence uses unreviewed capture state for "
                f"{record['knowledge_id']}: {sorted(unsupported_capture_states)}"
            )

        transient = transient_full | transient_partial
        partial = transient_partial | rendered_partial
        recapture_open = transient | rendered_full | rendered_partial
        missing_queue = recapture_open - queue_ids
        if missing_queue:
            raise ValueError(
                f"transient evidence source is absent from authenticated queue for "
                f"{record['knowledge_id']}: {sorted(missing_queue)}"
            )

        if partial:
            capture_class = "EVIDENCE_WITH_PARTIAL_SOURCE"
            production_gate = "PARTIAL_SOURCE_COMPLETION_AND_ORIGINAL_BYTE_RECAPTURE_REQUIRED"
            follow_up = (
                "Complete every unseen source portion, preserve durable source bytes or a "
                "complete page capture, and revalidate the exact supported scopes before "
                "production evidence approval."
            )
        elif rendered_full and not transient and not durable:
            capture_class = "ALL_EVIDENCE_RENDERED_CAPTURE"
            production_gate = "ORIGINAL_SOURCE_BYTES_REQUIRED_FOR_BYTE_IDENTITY"
            follow_up = (
                "The complete rendered pages are hashed and reviewable; acquire and hash "
                "the original source bytes before asserting byte identity or source-change detection."
            )
        elif not transient and not rendered_full:
            capture_class = "ALL_EVIDENCE_DURABLE"
            production_gate = "CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY"
            follow_up = (
                "No capture remediation is open; continue normal authority, currency, "
                "scope, status, and source-update controls."
            )
        elif durable or rendered_full:
            capture_class = "MIXED_DURABLE_AND_TRANSIENT_EVIDENCE"
            production_gate = "TRANSIENT_SOURCE_RECAPTURE_REQUIRED_FOR_COMPLETE_REPRODUCIBILITY"
            follow_up = (
                "Durably recapture each transient evidence source and compare it with the "
                "review artifact before asserting full reproducibility or source change."
            )
        else:
            capture_class = "TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE"
            production_gate = "DURABLE_RECAPTURE_REQUIRED_FOR_PRODUCTION_EVIDENCE_REVIEW"
            follow_up = (
                "Preserve durable source bytes or a complete page capture and revalidate "
                "the exact locator before production evidence approval."
            )

        rows.append(
            {
                "knowledge_id": record["knowledge_id"],
                "knowledge_status": record["knowledge_status"],
                "evidence_source_ids": joined(evidence_ids),
                "durable_source_ids": joined(durable),
                "rendered_full_source_ids": joined(rendered_full),
                "rendered_partial_source_ids": joined(rendered_partial),
                "transient_full_source_ids": joined(transient_full),
                "transient_partial_source_ids": joined(transient_partial),
                "evidence_capture_class": capture_class,
                "production_capture_gate": production_gate,
                "authenticated_queue_resource_ids": joined(recapture_open),
                "required_follow_up": follow_up,
            }
        )

    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} evidence-capture risk rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
