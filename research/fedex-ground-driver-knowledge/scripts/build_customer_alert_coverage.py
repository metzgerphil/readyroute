#!/usr/bin/env python3
"""Build one-row-per-alert review coverage from the durable MyGroundBiz capture."""

from __future__ import annotations

import csv
import hashlib
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ID = "SRC-MGB-PAGE-0023"
CAPTURE_PATH = ROOT / "captures/mygroundbiz/recent_customer_alerts_2026-08-06.txt"
OUTPUT_PATH = ROOT / "knowledge/customer_alert_review_coverage.csv"
REVIEW_PATH = ROOT / "validation/customer_alert_operational_review.jsonl"

FIELDS = [
    "alert_id",
    "source_id",
    "customer_or_subject",
    "alert_date",
    "display_scope",
    "source_line_start",
    "source_line_end",
    "segment_sha256",
    "review_status",
    "currency_review_status",
    "knowledge_extraction_status",
    "operational_record_id",
    "required_follow_up",
]

HEADING_RE = re.compile(
    r"^(?P<title>.+?)\s*\((?P<date>\d{1,2}/\d{1,2}/\d{4})\)(?P<tail>.*)$"
)
EXTENDED_HEADING_RE = re.compile(
    r"^(?P<title>.+?)\s*\((?:UPDATED\s+)?(?P<date>\d{1,2}/\d{1,2}/(?:\d{2}|\d{4}))\)(?P<tail>.*)$"
)
SUPPLEMENTAL_ALERT_IDS = {
    ("Kroger and banner stores", "7/14/2025"): "MGB-ALERT-0048A",
    ("New customer: LeMans Corporation", "4/26/24"): "MGB-ALERT-0107A",
}
SCOPE_RE = re.compile(r"^\s*\((?P<scope>[^)]+)\)")


def build_rows() -> list[dict[str, str]]:
    reviewed_alerts: dict[str, dict] = {}
    if REVIEW_PATH.is_file():
        import json

        for raw in REVIEW_PATH.read_text(encoding="utf-8").splitlines():
            if not raw.strip():
                continue
            spec = json.loads(raw)
            for alert_id in spec["source_alert_ids"]:
                if alert_id in reviewed_alerts:
                    raise ValueError(f"alert assigned to multiple operational records: {alert_id}")
                reviewed_alerts[alert_id] = spec

    lines = CAPTURE_PATH.read_text(encoding="utf-8").splitlines()
    article_limit = next(
        index
        for index, line in enumerate(lines)
        if line.startswith("The information contained herein is Confidential Information")
    )
    headings: list[tuple[int, re.Match[str], str]] = []
    baseline_position = 0
    for index, line in enumerate(lines[:article_limit]):
        stripped = line.strip()
        baseline_match = HEADING_RE.match(stripped)
        if baseline_match:
            baseline_position += 1
            headings.append(
                (index, baseline_match, f"MGB-ALERT-{baseline_position:04d}")
            )
            continue
        extended_match = EXTENDED_HEADING_RE.match(stripped)
        if not extended_match:
            continue
        supplemental_key = (
            extended_match.group("title").strip(),
            extended_match.group("date"),
        )
        supplemental_id = SUPPLEMENTAL_ALERT_IDS.get(supplemental_key)
        if not supplemental_id:
            raise ValueError(
                "Unassigned non-baseline customer-alert heading: "
                f"line={index + 1}, key={supplemental_key}"
            )
        headings.append((index, extended_match, supplemental_id))

    discovered_supplemental_ids = {
        alert_id for _, _, alert_id in headings if alert_id in SUPPLEMENTAL_ALERT_IDS.values()
    }
    if discovered_supplemental_ids != set(SUPPLEMENTAL_ALERT_IDS.values()):
        raise ValueError(
            "Supplemental customer-alert heading mismatch: "
            f"missing={sorted(set(SUPPLEMENTAL_ALERT_IDS.values()) - discovered_supplemental_ids)}"
        )

    rows: list[dict[str, str]] = []
    for position, (start_index, match, alert_id) in enumerate(headings):
        raw_end = (
            headings[position + 1][0] - 1
            if position + 1 < len(headings)
            else article_limit - 1
        )
        end_index = raw_end
        while end_index > start_index and not lines[end_index].strip(" \t\u00a0"):
            end_index -= 1
        segment = "\n".join(lines[start_index : end_index + 1]) + "\n"
        date_format = "%m/%d/%y" if len(match.group("date").rsplit("/", 1)[1]) == 2 else "%m/%d/%Y"
        parsed_date = datetime.strptime(match.group("date"), date_format).date()
        scope_match = SCOPE_RE.match(match.group("tail"))
        current_year = parsed_date.year == 2026
        review_spec = reviewed_alerts.get(alert_id)
        if review_spec:
            temporal_classification = review_spec["temporal_classification"]
            if review_spec["knowledge_status"] == "POTENTIALLY_OUTDATED":
                currency_status = "EXPLICIT_WINDOW_ELAPSED_CURRENT_SOURCE_REQUIRED"
                follow_up = "Acquire and review a current customer instruction before answering as current."
            elif review_spec["answer_mode"] == "REFERENCE_ONLY":
                currency_status = "CURRENT_PAGE_INFORMATIONAL_ONLY"
                follow_up = "Revalidate when the alert page changes; do not infer an unprovided procedure."
            else:
                currency_status = temporal_classification
                follow_up = "Revalidate customer-specific scope and instructions when the alert page changes."
        else:
            currency_status = (
                "CURRENT_YEAR_CURRENCY_CONFIRMATION_REQUIRED"
                if current_year
                else "HISTORICAL_CURRENCY_REVIEW_REQUIRED"
            )
            follow_up = (
                "Review the exact segment; classify customer, geography, time window, "
                "conditions, exceptions, prohibitions, escalation, and cross-references; "
                "then map only source-established current guidance."
            )
        rows.append(
            {
                "alert_id": alert_id,
                "source_id": SOURCE_ID,
                "customer_or_subject": match.group("title").strip(),
                "alert_date": parsed_date.isoformat(),
                "display_scope": (
                    scope_match.group("scope").strip() if scope_match else ""
                ),
                "source_line_start": str(start_index + 1),
                "source_line_end": str(end_index + 1),
                "segment_sha256": hashlib.sha256(segment.encode("utf-8")).hexdigest(),
                "review_status": (
                    "FULLY_REVIEWED"
                    if review_spec
                    else ("INITIAL_REVIEW_ONLY" if current_year else "NOT_YET_REVIEWED")
                ),
                "currency_review_status": currency_status,
                "knowledge_extraction_status": (
                    "EXTRACTED_TO_CUSTOMER_ALERT_LAYER"
                    if review_spec
                    else "NOT_YET_EXTRACTED"
                ),
                "operational_record_id": (
                    review_spec["alert_knowledge_id"] if review_spec else ""
                ),
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
    print(f"wrote {len(rows)} customer-alert coverage rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
