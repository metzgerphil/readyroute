#!/usr/bin/env python3
"""Build traceable customer-alert operational records from reviewed alert specifications."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REVIEW_PATH = ROOT / "validation/customer_alert_operational_review.jsonl"
COVERAGE_PATH = ROOT / "knowledge/customer_alert_review_coverage.csv"
OUTPUT_PATH = ROOT / "knowledge/customer_alert_operational_records.jsonl"
MAPPING_PATH = ROOT / "knowledge/customer_alert_source_to_knowledge.csv"
MAPPING_FIELDS = [
    "source_id",
    "alert_id",
    "alert_knowledge_id",
    "source_locator",
    "segment_sha256",
    "alert_date",
    "temporal_classification",
    "knowledge_status",
    "answer_mode",
]


def load_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def build_rows() -> list[dict]:
    specs = load_jsonl(REVIEW_PATH)
    with COVERAGE_PATH.open(encoding="utf-8", newline="") as handle:
        coverage = list(csv.DictReader(handle))
    coverage_by_id = {row["alert_id"]: row for row in coverage}
    rows: list[dict] = []
    for spec in specs:
        evidence = []
        for alert_id in spec["source_alert_ids"]:
            alert = coverage_by_id[alert_id]
            evidence.append(
                {
                    "source_id": alert["source_id"],
                    "alert_id": alert_id,
                    "locator": (
                        f"Recent Customer Alerts capture lines "
                        f"{alert['source_line_start']}-{alert['source_line_end']}"
                    ),
                    "segment_sha256": alert["segment_sha256"],
                    "alert_date": alert["alert_date"],
                    "display_scope": alert["display_scope"],
                }
            )
        row = dict(spec)
        row["source_evidence"] = evidence
        row["source_page_updated"] = "2026-08-06"
        row["reviewed_at"] = "2026-08-09"
        rows.append(row)
    return rows


def build_mapping_rows(rows: list[dict] | None = None) -> list[dict[str, str]]:
    operational_rows = build_rows() if rows is None else rows
    mapping_rows: list[dict[str, str]] = []
    for row in operational_rows:
        for evidence in row["source_evidence"]:
            mapping_rows.append(
                {
                    "source_id": evidence["source_id"],
                    "alert_id": evidence["alert_id"],
                    "alert_knowledge_id": row["alert_knowledge_id"],
                    "source_locator": evidence["locator"],
                    "segment_sha256": evidence["segment_sha256"],
                    "alert_date": evidence["alert_date"],
                    "temporal_classification": row["temporal_classification"],
                    "knowledge_status": row["knowledge_status"],
                    "answer_mode": row["answer_mode"],
                }
            )
    return mapping_rows


def main() -> int:
    rows = build_rows()
    OUTPUT_PATH.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
            for row in rows
        ),
        encoding="utf-8",
    )
    mapping_rows = build_mapping_rows(rows)
    with MAPPING_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MAPPING_FIELDS)
        writer.writeheader()
        writer.writerows(mapping_rows)
    print(f"wrote {len(rows)} customer-alert operational records to {OUTPUT_PATH}")
    print(f"wrote {len(mapping_rows)} customer-alert source mappings to {MAPPING_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
