#!/usr/bin/env python3
"""Build the exact current-version confirmation queue."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "knowledge/version_confirmation_queue.csv"

PRIORITY = [
    "KNO-FORGE-DEVICE-ROAD-001",
    "KNO-FORGE-STANDARD-DELIVERY-001",
    "KNO-FORGE-STANDARD-PICKUP-001",
    "KNO-FORGE-DOWNLOAD-SYNC-001",
    "KNO-FORGE-SYNC-QUEUE-001",
    "KNO-FORGE-SPLIT-DELIVERY-001",
    "KNO-FORGE-COMBINE-DELIVERY-001",
    "KNO-FORGE-MERGE-PICKUP-001",
    "KNO-FORGE-COMMENT-SCOPE-001",
    "KNO-FORGE-MULTICODE-001",
    "KNO-FORGE-MANIFEST-PERMISSIONS-001",
    "KNO-FORGE-FIRST-LAUNCH-001",
    "KNO-FORGE-MANIFEST-SEARCH-001",
    "KNO-FORGE-TIME-REMINDER-001",
    "KNO-FORGE-MESSAGING-001",
    "KNO-PUP-SERVICE-TYPES-001",
    "KNO-FORGE-AUDIO-ALERTS-001",
    "KNO-FORGE-DISPLAY-NAV-SETTINGS-001",
    "KNO-FORGE-DEVICE-INFO-001",
    "KNO-FORGE-LANGUAGE-001",
]

FIELDNAMES = [
    "priority",
    "confirmation_lane",
    "knowledge_id",
    "canonical_situation",
    "existing_source_ids",
    "existing_source_date_or_version",
    "existing_evidence_locators",
    "resolution_type",
    "controlling_update_needed",
    "human_owner_class",
    "exact_confirmation_request",
    "required_evidence_elements",
    "current_safe_boundary",
    "backlog_ids",
    "acquisition_queue_resource_ids",
    "publication_gate",
]


def load_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def build_rows() -> list[dict[str, str]]:
    records = load_jsonl(ROOT / "knowledge/records.jsonl")
    records_by_id = {record["knowledge_id"]: record for record in records}
    resolutions = load_csv(ROOT / "knowledge/nonverified_resolution_coverage.csv")
    resolution_by_id = {row["knowledge_id"]: row for row in resolutions}
    expected_ids = {
        record["knowledge_id"]
        for record in records
        if record["knowledge_status"] == "POTENTIALLY_OUTDATED"
    }
    if set(PRIORITY) != expected_ids:
        raise ValueError(
            "version confirmation priority list is stale: "
            f"missing={sorted(expected_ids - set(PRIORITY))}, "
            f"extra={sorted(set(PRIORITY) - expected_ids)}"
        )

    rows: list[dict[str, str]] = []
    for priority, knowledge_id in enumerate(PRIORITY, 1):
        record = records_by_id[knowledge_id]
        resolution = resolution_by_id[knowledge_id]
        if priority == 1:
            lane = "SAFETY_AND_CURRENT_POLICY"
        elif priority <= 10:
            lane = "MAINSTREAM_SERVICE_AND_DATA_INTEGRITY"
        elif priority <= 15:
            lane = "DEVICE_ACCESS_AND_OPERATIONAL_SUPPORT"
        else:
            lane = "SETTINGS_REFERENCE_AND_PRODUCT_TAXONOMY"

        evidence = record["evidence"]
        source_ids = ";".join(dict.fromkeys(item["source_id"] for item in evidence))
        locators = "; ".join(
            dict.fromkeys(
                f"{item['source_id']}: {item['locator']}" for item in evidence
            )
        )
        needed = resolution["required_evidence_or_decision"].strip()
        request = (
            f"Obtain the current controlling source or an explicit determination from "
            f"{resolution['human_owner_class']} for: {record['canonical_situation']}. "
            f"Confirm this exact requirement: {needed}"
        )
        evidence_elements = (
            "Preserve the authorized source bytes or durable capture; source title, version/build, "
            "effective date, geography, role/device scope, and exact pages/screens; compare every "
            "existing retained behavior as unchanged, changed, removed, or not addressed; record "
            "conditions, exceptions, operational-authority boundaries, and the named owner/date for "
            "any explicit determination. A current-looking screen, filename, recollection, or date alone "
            "does not establish the controlling version."
        )
        rows.append(
            {
                "priority": str(priority),
                "confirmation_lane": lane,
                "knowledge_id": knowledge_id,
                "canonical_situation": record["canonical_situation"],
                "existing_source_ids": source_ids,
                "existing_source_date_or_version": record["source_date_or_version"],
                "existing_evidence_locators": locators,
                "resolution_type": resolution["resolution_type"],
                "controlling_update_needed": needed,
                "human_owner_class": resolution["human_owner_class"],
                "exact_confirmation_request": request,
                "required_evidence_elements": evidence_elements,
                "current_safe_boundary": record["concise_ready_route_answer"],
                "backlog_ids": resolution["backlog_ids"],
                "acquisition_queue_resource_ids": resolution[
                    "acquisition_queue_resource_ids"
                ],
                "publication_gate": resolution["publication_gate"],
            }
        )
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} version-confirmation questions to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
