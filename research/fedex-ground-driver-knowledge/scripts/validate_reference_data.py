#!/usr/bin/env python3
"""Validate structured reference datasets used by the knowledge layer."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path


ALLOWED_STATUSES = {
    "VERIFIED",
    "UNRESOLVED",
    "CONFLICT",
    "POTENTIALLY_OUTDATED",
    "HUMAN_REVIEW_REQUIRED",
}
ROOT = Path(__file__).resolve().parent.parent


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        try:
            rows.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {exc}")
    return rows


def main() -> int:
    required = {
        "code",
        "namespace",
        "label",
        "applies_when",
        "scope_notes",
        "source_id",
        "locator",
        "source_version",
        "knowledge_status",
    }
    total = 0
    with (ROOT / "inventory/source_inventory.csv").open(encoding="utf-8", newline="") as handle:
        source_inventory = {row["source_id"]: row for row in csv.DictReader(handle)}

    datasets = (
        (ROOT / "knowledge/status_codes.jsonl", "DELIVERY_STATUS", r"\d{3}"),
        (ROOT / "knowledge/pickup_reason_codes.jsonl", "PICKUP_REASON", r"\d{2}"),
    )
    rows_by_namespace: dict[str, list[dict]] = {}
    for path, expected_namespace, code_pattern in datasets:
        rows = load_jsonl(path)
        rows_by_namespace[expected_namespace] = rows
        seen: set[str] = set()
        for index, row in enumerate(rows, 1):
            missing = required - row.keys()
            if missing:
                raise SystemExit(f"{path}:{index}: missing {sorted(missing)}")
            if row["code"] in seen:
                raise SystemExit(f"{path}:{index}: duplicate code {row['code']}")
            seen.add(row["code"])
            if row["namespace"] != expected_namespace:
                raise SystemExit(f"{path}:{index}: invalid namespace {row['namespace']}")
            if not re.fullmatch(code_pattern, row["code"]):
                raise SystemExit(f"{path}:{index}: invalid code format {row['code']}")
            if not row["label"] or not row["applies_when"] or not row["source_version"]:
                raise SystemExit(f"{path}:{index}: label, applicability, and source version are required")
            if not isinstance(row["scope_notes"], list):
                raise SystemExit(f"{path}:{index}: scope_notes must be a list")
            if row["knowledge_status"] not in ALLOWED_STATUSES:
                raise SystemExit(f"{path}:{index}: invalid knowledge_status")
            if not row["source_id"] or not row["locator"]:
                raise SystemExit(f"{path}:{index}: source traceability is required")
            source = source_inventory.get(row["source_id"])
            if not source:
                raise SystemExit(f"{path}:{index}: unknown source_id {row['source_id']}")
            if source["review_status"] not in {"FULLY_REVIEWED", "PARTIALLY_REVIEWED"}:
                raise SystemExit(f"{path}:{index}: source is not reviewed")
            if source["relevance_status"] == "SECONDARY_REFERENCE":
                raise SystemExit(f"{path}:{index}: secondary source cannot establish a reference code")
        total += len(rows)
        print(f"validated {len(rows)} reference records from {path}")

    delivery_by_number = {
        int(row["code"]): row for row in rows_by_namespace["DELIVERY_STATUS"]
    }
    pickup_by_number = {
        int(row["code"]): row for row in rows_by_namespace["PICKUP_REASON"]
    }
    collision_numbers = sorted(delivery_by_number.keys() & pickup_by_number.keys())
    missing_collision_warnings: list[tuple[str, str]] = []
    for number in collision_numbers:
        delivery = delivery_by_number[number]
        pickup = pickup_by_number[number]
        if not any("PICKUP_REASON namespace" in note for note in delivery["scope_notes"]):
            missing_collision_warnings.append(("DELIVERY_STATUS", delivery["code"]))
        if not any("DELIVERY_STATUS namespace" in note for note in pickup["scope_notes"]):
            missing_collision_warnings.append(("PICKUP_REASON", pickup["code"]))
    if missing_collision_warnings:
        raise SystemExit(
            f"cross-namespace numeric collisions lack warnings: {missing_collision_warnings}"
        )
    if collision_numbers != [10, 11, 15, 17, 21, 26]:
        raise SystemExit(f"unexpected cross-namespace collision set: {collision_numbers}")

    translation_path = ROOT / "knowledge/status_code_translation_coverage.csv"
    with translation_path.open(encoding="utf-8", newline="") as handle:
        translation_rows = list(csv.DictReader(handle))
    translation_by_code = {row["code"]: row for row in translation_rows}
    if len(translation_by_code) != len(translation_rows):
        raise SystemExit("duplicate delivery-status translation coverage code")
    delivery_codes = set(row["code"] for row in rows_by_namespace["DELIVERY_STATUS"])
    if set(translation_by_code) != delivery_codes:
        raise SystemExit(
            "delivery-status translation coverage mismatch: "
            f"missing={sorted(delivery_codes - set(translation_by_code))}, "
            f"extra={sorted(set(translation_by_code) - delivery_codes)}"
        )

    knowledge_ids = {
        row["knowledge_id"]
        for row in load_jsonl(ROOT / "knowledge/records.jsonl")
    }
    allowed_translation_statuses = {
        "OPERATIONAL_RECORD_LINKED",
        "OPERATIONAL_RECORD_SET_LINKED",
        "AUTO_APPLIED_REFERENCE_ONLY",
        "DEFINITION_ONLY_WORKFLOW_GAP",
        "OUTSIDE_GROUND_SCOPE_REFERENCE",
        "STATUS_LIMITED_REFERENCE",
    }
    invalid_translation_rows: list[tuple[str, str]] = []
    delivery_by_code = {
        row["code"]: row for row in rows_by_namespace["DELIVERY_STATUS"]
    }
    for code, row in translation_by_code.items():
        reference = delivery_by_code[code]
        linked_ids = set(filter(None, row["knowledge_ids"].split(";")))
        status = row["translation_status"]
        if row["label"] != reference["label"]:
            invalid_translation_rows.append((code, "label mismatch"))
        if status not in allowed_translation_statuses:
            invalid_translation_rows.append((code, "invalid translation status"))
        if not row["assessment"]:
            invalid_translation_rows.append((code, "missing assessment"))
        if not linked_ids.issubset(knowledge_ids):
            invalid_translation_rows.append((code, "unknown knowledge link"))
        if status == "OPERATIONAL_RECORD_LINKED" and len(linked_ids) != 1:
            invalid_translation_rows.append((code, "single-record status requires one link"))
        if status == "OPERATIONAL_RECORD_SET_LINKED" and len(linked_ids) < 2:
            invalid_translation_rows.append((code, "record-set status requires multiple links"))
        if status == "DEFINITION_ONLY_WORKFLOW_GAP" and not row["required_follow_up"]:
            invalid_translation_rows.append((code, "workflow gap lacks follow-up"))
        if status == "STATUS_LIMITED_REFERENCE" and reference["knowledge_status"] == "VERIFIED":
            invalid_translation_rows.append((code, "status-limited row has verified reference"))
        if status == "OUTSIDE_GROUND_SCOPE_REFERENCE":
            scope_text = " ".join(reference["scope_notes"]).lower()
            if "express" not in scope_text and "ground" not in scope_text:
                invalid_translation_rows.append((code, "outside-scope row lacks source scope note"))
    if invalid_translation_rows:
        raise SystemExit(
            "delivery-status translation coverage failure: "
            f"{invalid_translation_rows}"
        )

    pickup_translation_path = (
        ROOT / "knowledge/pickup_reason_translation_coverage.csv"
    )
    with pickup_translation_path.open(encoding="utf-8", newline="") as handle:
        pickup_translation_rows = list(csv.DictReader(handle))
    pickup_translation_by_code = {
        row["code"]: row for row in pickup_translation_rows
    }
    if len(pickup_translation_by_code) != len(pickup_translation_rows):
        raise SystemExit("duplicate pickup-reason translation coverage code")
    pickup_codes = set(row["code"] for row in rows_by_namespace["PICKUP_REASON"])
    if set(pickup_translation_by_code) != pickup_codes:
        raise SystemExit(
            "pickup-reason translation coverage mismatch: "
            f"missing={sorted(pickup_codes - set(pickup_translation_by_code))}, "
            f"extra={sorted(set(pickup_translation_by_code) - pickup_codes)}"
        )
    pickup_by_code = {
        row["code"]: row for row in rows_by_namespace["PICKUP_REASON"]
    }
    allowed_pickup_translation_statuses = {
        "OPERATIONAL_RECORD_LINKED",
        "STATUS_LIMITED_RECORD_LINKED",
        "STATUS_LIMITED_RECORD_SET_LINKED",
        "OUTSIDE_GROUND_STATUS_LIMITED",
    }
    invalid_pickup_translation_rows: list[tuple[str, str]] = []
    for code, row in pickup_translation_by_code.items():
        reference = pickup_by_code[code]
        linked_ids = set(filter(None, row["knowledge_ids"].split(";")))
        status = row["translation_status"]
        if row["label"] != reference["label"]:
            invalid_pickup_translation_rows.append((code, "label mismatch"))
        if status not in allowed_pickup_translation_statuses:
            invalid_pickup_translation_rows.append((code, "invalid translation status"))
        if not row["assessment"]:
            invalid_pickup_translation_rows.append((code, "missing assessment"))
        if not linked_ids.issubset(knowledge_ids):
            invalid_pickup_translation_rows.append((code, "unknown knowledge link"))
        if status == "OPERATIONAL_RECORD_LINKED":
            if len(linked_ids) != 1:
                invalid_pickup_translation_rows.append(
                    (code, "operational status requires one record")
                )
            if reference["knowledge_status"] != "VERIFIED":
                invalid_pickup_translation_rows.append(
                    (code, "operational status requires verified reason")
                )
        elif status == "STATUS_LIMITED_RECORD_LINKED":
            if len(linked_ids) != 1:
                invalid_pickup_translation_rows.append(
                    (code, "status-limited record requires one link")
                )
            if reference["knowledge_status"] == "VERIFIED":
                invalid_pickup_translation_rows.append(
                    (code, "status-limited reason is marked verified")
                )
        elif status == "STATUS_LIMITED_RECORD_SET_LINKED":
            if len(linked_ids) < 2:
                invalid_pickup_translation_rows.append(
                    (code, "status-limited record set requires multiple links")
                )
            if reference["knowledge_status"] == "VERIFIED":
                invalid_pickup_translation_rows.append(
                    (code, "status-limited reason is marked verified")
                )
        elif status == "OUTSIDE_GROUND_STATUS_LIMITED":
            scope_text = " ".join(reference["scope_notes"]).lower()
            if "express" not in scope_text:
                invalid_pickup_translation_rows.append(
                    (code, "outside-Ground reason lacks Express source scope")
                )
        if status != "OPERATIONAL_RECORD_LINKED" and not row["required_follow_up"]:
            invalid_pickup_translation_rows.append((code, "missing follow-up"))
    if invalid_pickup_translation_rows:
        raise SystemExit(
            "pickup-reason translation coverage failure: "
            f"{invalid_pickup_translation_rows}"
        )

    print(f"validated {total} total reference records")
    print(f"validated cross-namespace numeric collisions: {collision_numbers}")
    print(
        "validated delivery-status translation coverage: "
        f"{dict(sorted(Counter(row['translation_status'] for row in translation_rows).items()))}"
    )
    print(
        "validated pickup-reason translation coverage: "
        f"{dict(sorted(Counter(row['translation_status'] for row in pickup_translation_rows).items()))}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
