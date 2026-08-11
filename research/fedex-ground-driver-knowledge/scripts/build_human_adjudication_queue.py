#!/usr/bin/env python3
"""Build the exact unresolved human-adjudication queue."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent.parent
OUTPUT = ROOT / "knowledge/human_adjudication_queue.csv"

PRIORITY = [
    "KNO-DEL-REFUSED-001",
    "KNO-FORGE-EOD-001",
    "KNO-PUP-PACKAGING-001",
    "KNO-PUP-INTERNATIONAL-DOCS-001",
    "KNO-DEL-COD-MULTI-001",
    "KNO-DEL-PHARMACY-001",
    "KNO-DEL-CRITICAL-HEALTH-001",
    "KNO-FORGE-UNMANIFESTED-DELIVERY-001",
    "KNO-FORGE-EDIT-ADDRESS-001",
    "KNO-FORGE-BULK-TRANSFER-001",
    "KNO-FORGE-BULK-001",
    "KNO-PUP-CALLTAG-FRAUD-001",
    "KNO-PUP-OFFER-DECLINE-001",
    "KNO-PUP-DROPBOX-SCHEDULE-001",
    "KNO-FORGE-LOGIN-WARNING-001",
    "KNO-FORGE-LOGIN-DISPATCH-001",
    "KNO-DEL-ALT-SIGNATURE-001",
    "KNO-DEL-BUS-OP201-001",
    "KNO-DEL-TOBACCO-001",
    "KNO-SEC-STOLEN-VEHICLE-001",
    "KNO-DOT-ROADSIDE-REPORT-001",
    "KNO-HOS-RENTAL-ELD-001",
    "KNO-VEH-RENTAL-PREP-001",
    "KNO-VEH-ANNUAL-INSPECTION-001",
    "KNO-VEH-CA-90DAY-INSPECTION-001",
    "KNO-QUAL-L10-ACTIVATION-001",
    "KNO-LH-COUPLING-BASIC-001",
]

FIELDNAMES = [
    "priority",
    "review_lane",
    "knowledge_id",
    "canonical_situation",
    "research_status",
    "resolution_type",
    "human_owner_class",
    "exact_question",
    "required_answer_elements",
    "current_safe_boundary",
    "backlog_ids",
    "acquisition_queue_resource_ids",
    "publication_gate",
]


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def active_adjudicated_ids() -> set[str]:
    rows = json.loads(
        (WORKSPACE_ROOT / "knowledge/adjudications/records.json").read_text(encoding="utf-8")
    )
    return {row["knowledge_id"] for row in rows if row["status"] == "APPROVED"}


def build_rows() -> list[dict[str, str]]:
    records = load_jsonl(ROOT / "knowledge/records.jsonl")
    records_by_id = {record["knowledge_id"]: record for record in records}
    resolutions = load_csv(ROOT / "knowledge/nonverified_resolution_coverage.csv")
    resolution_by_id = {row["knowledge_id"]: row for row in resolutions}
    adjudicated = active_adjudicated_ids()
    expected_ids = {
        record["knowledge_id"]
        for record in records
        if record["knowledge_status"] in {"CONFLICT", "HUMAN_REVIEW_REQUIRED"}
        and record["knowledge_id"] not in adjudicated
    }
    if set(PRIORITY) != expected_ids:
        raise ValueError(
            "human adjudication priority list is stale: "
            f"missing={sorted(expected_ids - set(PRIORITY))}, "
            f"extra={sorted(set(PRIORITY) - expected_ids)}"
        )

    rows: list[dict[str, str]] = []
    for priority, knowledge_id in enumerate(PRIORITY, 1):
        record = records_by_id[knowledge_id]
        resolution = resolution_by_id[knowledge_id]
        if priority <= 20:
            lane = "MAINSTREAM_P_AND_D"
        elif priority <= 26:
            lane = "SAFETY_COMPLIANCE_AND_QUALIFICATION"
        else:
            lane = "SPECIALIZED_LINEHAUL"
        required = resolution["required_evidence_or_decision"].strip()
        question = (
            f"What is the current approved FedEx Ground procedure for: "
            f"{record['canonical_situation']}? Resolve this exact gap: {required}"
        )
        answer_elements = (
            "Identify the authorized responder/owner role, answer date, applicable geography, "
            "source or policy version/effective date, material conditions and exceptions, ordered "
            "driver steps, required codes/forms/documentation, prohibited actions, escalation, and "
            "any part that remains unresolved. A title, recollection, or likely practice alone is insufficient."
        )
        rows.append(
            {
                "priority": str(priority),
                "review_lane": lane,
                "knowledge_id": knowledge_id,
                "canonical_situation": record["canonical_situation"],
                "research_status": record["knowledge_status"],
                "resolution_type": resolution["resolution_type"],
                "human_owner_class": resolution["human_owner_class"],
                "exact_question": question,
                "required_answer_elements": answer_elements,
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
    print(f"wrote {len(rows)} human-adjudication questions to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
