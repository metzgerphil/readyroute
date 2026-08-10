#!/usr/bin/env python3
"""Build per-record driver-language surface and formal-case coverage."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECORDS_PATH = ROOT / "knowledge/records.jsonl"
VARIANT_INDEX_PATH = ROOT / "validation/driver_variant_index.jsonl"
CASES_PATH = ROOT / "validation/driver_language_cases.jsonl"
OUTPUT_PATH = ROOT / "validation/record_language_surface_coverage.csv"


FIELDS = [
    "knowledge_id",
    "knowledge_status",
    "taxonomy_paths",
    "embedded_variant_count",
    "supplemental_variant_count",
    "formal_case_count",
    "distinct_surface_count",
    "short_surface_count",
    "extended_surface_count",
    "formal_case_types",
    "surface_coverage_status",
]


def load_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def build_rows() -> list[dict[str, str | int]]:
    records = load_jsonl(RECORDS_PATH)
    variants = load_jsonl(VARIANT_INDEX_PATH)
    cases = load_jsonl(CASES_PATH)
    variants_by_knowledge: dict[str, list[dict]] = {
        record["knowledge_id"]: [] for record in records
    }
    cases_by_knowledge: dict[str, list[dict]] = {
        record["knowledge_id"]: [] for record in records
    }
    for variant in variants:
        variants_by_knowledge[variant["knowledge_id"]].append(variant)
    for case in cases:
        for knowledge_id in case["expected_knowledge_ids"]:
            cases_by_knowledge[knowledge_id].append(case)

    rows: list[dict[str, str | int]] = []
    for record in records:
        knowledge_id = record["knowledge_id"]
        record_variants = variants_by_knowledge[knowledge_id]
        record_cases = cases_by_knowledge[knowledge_id]
        surfaces = {
            normalize(item["utterance"])
            for item in [*record_variants, *record_cases]
        }
        short_count = sum(len(surface.split()) <= 4 for surface in surfaces)
        extended_count = sum(len(surface.split()) >= 6 for surface in surfaces)
        rows.append(
            {
                "knowledge_id": knowledge_id,
                "knowledge_status": record["knowledge_status"],
                "taxonomy_paths": ";".join(record["taxonomy_paths"]),
                "embedded_variant_count": str(
                    sum(
                        item["variant_source"] == "EMBEDDED_RECORD"
                        for item in record_variants
                    )
                ),
                "supplemental_variant_count": str(
                    sum(
                        item["variant_source"] != "EMBEDDED_RECORD"
                        for item in record_variants
                    )
                ),
                "formal_case_count": str(len(record_cases)),
                "distinct_surface_count": str(len(surfaces)),
                "short_surface_count": str(short_count),
                "extended_surface_count": str(extended_count),
                "formal_case_types": ";".join(
                    sorted({case["case_type"] for case in record_cases})
                ),
                "surface_coverage_status": (
                    "SHORT_AND_EXTENDED_PRESENT"
                    if short_count and extended_count
                    else "SURFACE_GAP"
                ),
            }
        )
    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} record-language surface rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
