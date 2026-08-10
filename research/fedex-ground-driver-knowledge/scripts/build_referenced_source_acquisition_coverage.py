#!/usr/bin/env python3
"""Build exact acquisition-route coverage for every referenced-source gap."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKLOG_PATH = ROOT / "inventory/referenced_source_backlog.csv"
ACQUISITION_QUEUE_PATH = (
    ROOT / "inventory/mygroundbiz_authenticated_acquisition_queue.csv"
)
RESOLUTION_COVERAGE_PATH = ROOT / "knowledge/nonverified_resolution_coverage.csv"
KNOWLEDGE_RECORDS_PATH = ROOT / "knowledge/records.jsonl"
TAXONOMY_PATH = ROOT / "knowledge/taxonomy.json"
OUTPUT_PATH = ROOT / "inventory/referenced_source_acquisition_coverage.csv"


FIELDS = [
    "backlog_id",
    "priority",
    "source_identifier",
    "title_or_description",
    "origin_source_ids",
    "affected_targets",
    "affected_knowledge_ids",
    "affected_taxonomy_ids",
    "direct_gap_queue_resource_ids",
    "contextual_resolution_queue_resource_ids",
    "all_linked_queue_resource_ids",
    "queue_link_class",
    "acquisition_status",
    "review_status",
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


def build_rows() -> list[dict[str, str]]:
    backlog = load_csv(BACKLOG_PATH)
    acquisition_queue = load_csv(ACQUISITION_QUEUE_PATH)
    resolution_coverage = load_csv(RESOLUTION_COVERAGE_PATH)
    records = load_jsonl(KNOWLEDGE_RECORDS_PATH)
    taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))

    records_by_id = {record["knowledge_id"]: record for record in records}
    taxonomy_ids = {node["id"] for node in taxonomy["nodes"]}

    direct_queue_by_gap: dict[str, set[str]] = defaultdict(set)
    for queue_row in acquisition_queue:
        for gap_id in filter(None, queue_row["related_gap_ids"].split(";")):
            direct_queue_by_gap[gap_id].add(queue_row["resource_id"])

    contextual_queue_by_gap: dict[str, set[str]] = defaultdict(set)
    resolution_records_by_gap: dict[str, set[str]] = defaultdict(set)
    for resolution_row in resolution_coverage:
        gap_ids = set(filter(None, resolution_row["backlog_ids"].split(";")))
        queue_ids = set(
            filter(
                None,
                resolution_row["acquisition_queue_resource_ids"].split(";"),
            )
        )
        for gap_id in gap_ids:
            contextual_queue_by_gap[gap_id].update(queue_ids)
            resolution_records_by_gap[gap_id].add(resolution_row["knowledge_id"])

    rows: list[dict[str, str]] = []
    for backlog_row in backlog:
        gap_id = backlog_row["backlog_id"]
        affected_targets = set(
            filter(None, backlog_row["affected_targets"].split(";"))
        )
        affected_knowledge_ids = {
            target for target in affected_targets if target in records_by_id
        }
        affected_knowledge_ids.update(resolution_records_by_gap[gap_id])
        affected_taxonomy_ids = {
            target for target in affected_targets if target in taxonomy_ids
        }
        affected_taxonomy_ids.update(
            taxonomy_id
            for knowledge_id in affected_knowledge_ids
            for path in records_by_id[knowledge_id]["taxonomy_paths"]
            for taxonomy_id in path.split("/")
        )

        direct_ids = direct_queue_by_gap[gap_id]
        contextual_ids = contextual_queue_by_gap[gap_id]
        all_ids = direct_ids | contextual_ids
        if direct_ids and contextual_ids:
            queue_link_class = "DIRECT_GAP_AND_CONTEXTUAL_RESOLUTION_LINKS"
            coverage_basis = (
                "The queue has an explicit related-gap link and record-resolution "
                "dependencies. Neither link proves that a page contains the missing source."
            )
            required_follow_up = (
                "Acquire and fully review the direct gap-linked resources, inspect the "
                "contextual resolution pages, and locate the exact missing source before "
                "reconciling this backlog row."
            )
        elif direct_ids:
            queue_link_class = "DIRECT_GAP_LINK_ONLY"
            coverage_basis = (
                "The queue has an explicit related-gap link based on reviewed source/path "
                "discovery; content and source availability remain unverified."
            )
            required_follow_up = (
                "Acquire and fully review the direct gap-linked resources and verify whether "
                "they provide the exact missing source before reconciling this backlog row."
            )
        elif contextual_ids:
            queue_link_class = "CONTEXTUAL_RESOLUTION_LINK_ONLY"
            coverage_basis = (
                "Non-verified record resolution rows name queued context pages, but no queue "
                "resource is explicitly linked to this source gap."
            )
            required_follow_up = (
                "Review the contextual resolution pages and separately locate the exact "
                "missing source; a record dependency is not proof of source availability."
            )
        else:
            queue_link_class = "NO_CURRENT_AUTHENTICATED_QUEUE_LINK"
            coverage_basis = (
                "No acquisition-queue row directly names this gap and no linked non-verified "
                "resolution row supplies a contextual queue target."
            )
            required_follow_up = (
                "Locate the exact source through the authorized corpus or authenticated portal, "
                "then add an evidence-backed acquisition target without inferring from its title."
            )

        rows.append(
            {
                "backlog_id": gap_id,
                "priority": backlog_row["priority"],
                "source_identifier": backlog_row["source_identifier"],
                "title_or_description": backlog_row["title_or_description"],
                "origin_source_ids": backlog_row["origin_source_ids"],
                "affected_targets": backlog_row["affected_targets"],
                "affected_knowledge_ids": ";".join(sorted(affected_knowledge_ids)),
                "affected_taxonomy_ids": ";".join(sorted(affected_taxonomy_ids)),
                "direct_gap_queue_resource_ids": ";".join(sorted(direct_ids)),
                "contextual_resolution_queue_resource_ids": ";".join(
                    sorted(contextual_ids)
                ),
                "all_linked_queue_resource_ids": ";".join(sorted(all_ids)),
                "queue_link_class": queue_link_class,
                "acquisition_status": backlog_row["acquisition_status"],
                "review_status": backlog_row["review_status"],
                "coverage_basis": coverage_basis,
                "required_follow_up": required_follow_up,
            }
        )

    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} referenced-source acquisition rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
