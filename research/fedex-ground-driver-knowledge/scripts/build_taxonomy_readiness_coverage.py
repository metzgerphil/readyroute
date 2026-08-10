#!/usr/bin/env python3
"""Build status, capture, and dependency readiness coverage for every taxonomy node."""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = ROOT / "knowledge/taxonomy.json"
RECORDS_PATH = ROOT / "knowledge/records.jsonl"
CAPTURE_RISK_PATH = ROOT / "knowledge/evidence_capture_risk_coverage.csv"
RESOLUTION_PATH = ROOT / "knowledge/nonverified_resolution_coverage.csv"
REFERENCED_BACKLOG_PATH = ROOT / "inventory/referenced_source_backlog.csv"
OUTPUT_PATH = ROOT / "knowledge/taxonomy_readiness_coverage.csv"


FIELDS = [
    "taxonomy_id",
    "label",
    "parent_ids",
    "mapped_record_count",
    "mapped_knowledge_ids",
    "verified_count",
    "conflict_count",
    "human_review_count",
    "potentially_outdated_count",
    "durable_evidence_record_count",
    "capture_open_record_count",
    "referenced_source_gap_ids",
    "authenticated_queue_resource_ids",
    "readiness_class",
    "coverage_basis",
    "required_follow_up",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def load_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def joined(values: set[str]) -> str:
    return ";".join(sorted(values))


def build_rows() -> list[dict[str, str]]:
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    records = load_jsonl(RECORDS_PATH)
    records_by_id = {record["knowledge_id"]: record for record in records}
    capture_by_knowledge = {
        row["knowledge_id"]: row for row in load_csv(CAPTURE_RISK_PATH)
    }
    resolution_by_knowledge = {
        row["knowledge_id"]: row for row in load_csv(RESOLUTION_PATH)
    }
    gap_ids_by_taxonomy_target: dict[str, set[str]] = {}
    for gap in load_csv(REFERENCED_BACKLOG_PATH):
        for target in filter(None, gap["affected_targets"].split(";")):
            if target.startswith("TAX-"):
                gap_ids_by_taxonomy_target.setdefault(target, set()).add(
                    gap["backlog_id"]
                )
    exceptions = {
        item["node_id"]: item for item in taxonomy.get("coverage_exceptions", [])
    }
    record_ids_by_node: dict[str, set[str]] = {
        node["id"]: set() for node in taxonomy["nodes"]
    }
    for record in records:
        for path in record["taxonomy_paths"]:
            for node_id in path.split("/"):
                record_ids_by_node[node_id].add(record["knowledge_id"])

    rows: list[dict[str, str]] = []
    for node in taxonomy["nodes"]:
        node_id = node["id"]
        knowledge_ids = record_ids_by_node[node_id]
        statuses = Counter(
            records_by_id[knowledge_id]["knowledge_status"]
            for knowledge_id in knowledge_ids
        )
        durable_count = sum(
            capture_by_knowledge[knowledge_id]["evidence_capture_class"]
            == "ALL_EVIDENCE_DURABLE"
            for knowledge_id in knowledge_ids
        )
        capture_open_count = len(knowledge_ids) - durable_count
        gap_ids: set[str] = set(gap_ids_by_taxonomy_target.get(node_id, set()))
        resolution_queue_ids: set[str] = set()
        capture_queue_ids: set[str] = set()
        for knowledge_id in knowledge_ids:
            resolution = resolution_by_knowledge.get(knowledge_id)
            if resolution:
                gap_ids.update(filter(None, resolution["backlog_ids"].split(";")))
                resolution_queue_ids.update(
                    filter(None, resolution["acquisition_queue_resource_ids"].split(";"))
                )
            capture_queue_ids.update(
                filter(
                    None,
                    capture_by_knowledge[knowledge_id][
                        "authenticated_queue_resource_ids"
                    ].split(";"),
                )
            )

        if not knowledge_ids:
            exception = exceptions.get(node_id)
            if not exception:
                raise ValueError(f"taxonomy node has no records or exception: {node_id}")
            readiness_class = "SOURCE_GAP_NO_OPERATIONAL_RECORD"
            coverage_basis = exception["reason"]
            required_follow_up = (
                "Acquire and completely review the referenced procedure before creating "
                "operational records or driver-language variants for this branch."
            )
        elif statuses["VERIFIED"] == len(knowledge_ids):
            if capture_open_count:
                readiness_class = "ALL_RECORDS_VERIFIED_CAPTURE_OPEN"
                coverage_basis = (
                    "Every mapped record is VERIFIED, but at least one record uses "
                    "transient evidence requiring durable recapture."
                )
                required_follow_up = (
                    "Complete the listed authenticated recaptures and revalidate exact "
                    "evidence locators before production evidence approval."
                )
            else:
                readiness_class = "ALL_RECORDS_VERIFIED_DURABLE"
                coverage_basis = (
                    "Every mapped record is VERIFIED and every supporting evidence set "
                    "is durably archived."
                )
                required_follow_up = (
                    "Maintain source currency and repeat taxonomy/status/capture review "
                    "when new evidence changes this branch."
                )
        elif statuses["VERIFIED"] == 0:
            readiness_class = "NO_VERIFIED_RECORDS"
            coverage_basis = (
                "The branch has mapped records, but none currently has VERIFIED status."
            )
            required_follow_up = (
                "Resolve the listed source, authority, version, conflict, and capture "
                "dependencies before presenting this branch as approved guidance."
            )
        else:
            readiness_class = "MIXED_VERIFIED_AND_NONVERIFIED"
            coverage_basis = (
                "The branch contains both VERIFIED and conflict, human-review, or "
                "potentially-outdated records; retrieval must preserve record-level gates."
            )
            required_follow_up = (
                "Resolve the listed non-verified dependencies and transient evidence "
                "captures without generalizing a verified sibling rule to gated records."
            )

        rows.append(
            {
                "taxonomy_id": node_id,
                "label": node["label"],
                "parent_ids": ";".join(node["parents"]),
                "mapped_record_count": str(len(knowledge_ids)),
                "mapped_knowledge_ids": joined(knowledge_ids),
                "verified_count": str(statuses["VERIFIED"]),
                "conflict_count": str(statuses["CONFLICT"]),
                "human_review_count": str(statuses["HUMAN_REVIEW_REQUIRED"]),
                "potentially_outdated_count": str(
                    statuses["POTENTIALLY_OUTDATED"]
                ),
                "durable_evidence_record_count": str(durable_count),
                "capture_open_record_count": str(capture_open_count),
                "referenced_source_gap_ids": joined(gap_ids),
                "authenticated_queue_resource_ids": joined(
                    resolution_queue_ids | capture_queue_ids
                ),
                "readiness_class": readiness_class,
                "coverage_basis": coverage_basis,
                "required_follow_up": required_follow_up,
            }
        )
    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} taxonomy-readiness rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
