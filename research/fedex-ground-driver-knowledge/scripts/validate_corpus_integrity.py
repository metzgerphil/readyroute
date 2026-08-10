#!/usr/bin/env python3
"""Validate cross-file integrity for the Ready Route research corpus."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

from build_claim_provenance import build_rows as build_claim_provenance_rows
from build_brightcove_video_capture_inventory import (
    build_rows as build_brightcove_video_capture_rows,
)
from build_claim_evidence_allocation_coverage import (
    build_rows as build_claim_evidence_allocation_rows,
)
from build_clarification_strategy_index import build_rows as build_clarification_strategy_rows
from build_customer_alert_coverage import build_rows as build_customer_alert_rows
from build_customer_alert_operational_records import (
    build_mapping_rows as build_customer_alert_mapping_rows,
    build_rows as build_customer_alert_operational_rows,
)
from build_driver_variant_index import build_rows as build_driver_variant_rows
from build_evidence_capture_risk_coverage import (
    build_rows as build_evidence_capture_risk_rows,
)
from build_form_artifact_coverage import build_rows as build_form_artifact_rows
from build_forge_page_coverage import build_rows as build_forge_page_rows
from build_drive_pdf_page_coverage import build_rows as build_drive_pdf_page_rows
from build_google_drive_zip_member_inventory import (
    build_rows as build_google_drive_zip_member_rows,
)
from build_mygb_acquisition_queue import build_rows as build_mygb_acquisition_rows
from build_mygb_news_archive_backlog import (
    build_rows as build_mygb_news_archive_rows,
)
from build_op117_page_coverage import build_rows as build_op117_page_rows
from build_referenced_source_acquisition_coverage import (
    build_rows as build_referenced_source_acquisition_rows,
)
from build_referenced_source_occurrences import (
    build_rows as build_referenced_source_occurrence_rows,
)
from build_record_language_surface_coverage import (
    build_rows as build_record_language_surface_rows,
)
from build_source_capture_coverage import build_rows as build_source_capture_rows
from build_source_knowledge_coverage import build_rows as build_source_knowledge_rows
from build_taxonomy_readiness_coverage import (
    build_rows as build_taxonomy_readiness_rows,
)
from build_workbook_scenario_coverage import (
    build_rows as build_workbook_scenario_rows,
)


ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent.parent


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


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def assert_unique(values: list[str], label: str) -> set[str]:
    counts = Counter(values)
    duplicates = sorted(value for value, count in counts.items() if count > 1)
    if duplicates:
        raise SystemExit(f"duplicate {label}: {duplicates}")
    return set(values)


def ids_in_status_index(path: Path, status: str) -> set[str]:
    text = path.read_text(encoding="utf-8")
    match = re.search(
        rf"^## Record-status index: {re.escape(status)}\s*$\n(.*?)(?=^## |\Z)",
        text,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not match:
        raise SystemExit(f"{path}: missing Record-status index for {status}")
    return set(re.findall(r"KNO-[A-Z0-9-]+-\d{3}", match.group(1)))


def normalize_driver_text(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def parse_iso_date(value: str, context: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit(f"{context}: invalid ISO date {value!r}") from exc
    if parsed.isoformat() != value:
        raise SystemExit(f"{context}: non-canonical ISO date {value!r}")
    return parsed


def main() -> int:
    inventory = load_csv(ROOT / "inventory/source_inventory.csv")
    source_ids = assert_unique([row["source_id"] for row in inventory], "source_id")
    inventory_by_id = {row["source_id"]: row for row in inventory}
    today = date.today()

    recovery_counts = Counter(row["metadata_recovery_status"] for row in inventory)
    expected_recovery_counts = {
        "ORIGINAL_ROW_RETAINED": 26,
        "RECONSTRUCTED_FROM_CONTROLLED_LEDGERS": 62,
        "NEW_AUTHORITATIVE_ROW_AFTER_RECOVERY": 11,
        "ORIGINAL_BYTES_ACQUIRED_AND_FULLY_REVIEWED": 22,
    }
    invalid_recovery_basis = [
        row["source_id"]
        for row in inventory
        if not row["metadata_recovery_basis"].strip()
    ]
    if dict(recovery_counts) != expected_recovery_counts or invalid_recovery_basis:
        raise SystemExit(
            "source inventory recovery-control failure: "
            f"counts={dict(recovery_counts)}, missing_basis={invalid_recovery_basis}"
        )

    invalid_source_dates: list[tuple[str, str, str]] = []
    missing_review_dates: list[str] = []
    for row in inventory:
        for field in ("created_at", "modified_at", "effective_date", "last_reviewed_at"):
            value = row[field]
            if not value:
                continue
            try:
                parsed = parse_iso_date(value, f"{row['source_id']} {field}")
            except SystemExit:
                invalid_source_dates.append((row["source_id"], field, value))
                continue
            if field == "last_reviewed_at" and parsed > today:
                invalid_source_dates.append((row["source_id"], field, value))
        if (
            row["review_status"] in {"FULLY_REVIEWED", "PARTIALLY_REVIEWED"}
            and not row["last_reviewed_at"]
        ):
            missing_review_dates.append(row["source_id"])
    if invalid_source_dates or missing_review_dates:
        raise SystemExit(
            "source temporal metadata failure: "
            f"invalid_dates={invalid_source_dates}, "
            f"reviewed_without_last_reviewed_at={missing_review_dates}"
        )
    review_artifact_ids = {
        path.stem for path in (ROOT / "reviews").glob("SRC-*.md")
    }
    missing_review_artifacts = sorted(
        row["source_id"]
        for row in inventory
        if row["review_status"] in {"FULLY_REVIEWED", "PARTIALLY_REVIEWED"}
        and row["source_id"] not in review_artifact_ids
    )
    if missing_review_artifacts:
        raise SystemExit(
            "reviewed sources without review artifacts: "
            f"{missing_review_artifacts}"
        )

    checksum_manifest_path = ROOT / "inventory/source_checksums.sha256"
    checksum_entries: dict[str, str] = {}
    malformed_checksum_rows: list[int] = []
    for line_number, raw in enumerate(
        checksum_manifest_path.read_text(encoding="utf-8").splitlines(), 1
    ):
        if not raw.strip():
            continue
        try:
            digest, relative_path = raw.split("  ", 1)
        except ValueError:
            malformed_checksum_rows.append(line_number)
            continue
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or relative_path in checksum_entries:
            malformed_checksum_rows.append(line_number)
            continue
        checksum_entries[relative_path] = digest

    expected_archive_paths = {
        row["local_archive_path"]
        for row in inventory
        if row["local_archive_path"]
    }
    archive_root = ROOT / "sources/google-drive"
    on_disk_archive_paths = {
        str(path.relative_to(WORKSPACE_ROOT))
        for path in archive_root.rglob("*")
        if path.is_file()
    }
    on_disk_archive_paths.update(
        path
        for path in expected_archive_paths
        if not path.startswith("research/fedex-ground-driver-knowledge/sources/google-drive/")
        and (WORKSPACE_ROOT / path).is_file()
    )
    missing_archive_files = sorted(
        path for path in expected_archive_paths if not (WORKSPACE_ROOT / path).is_file()
    )
    checksum_mismatches: list[str] = []
    for relative_path, expected_digest in checksum_entries.items():
        archive_path = WORKSPACE_ROOT / relative_path
        if not archive_path.is_file():
            checksum_mismatches.append(relative_path)
            continue
        actual_digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        if actual_digest != expected_digest:
            checksum_mismatches.append(relative_path)
    if (
        malformed_checksum_rows
        or set(checksum_entries) != expected_archive_paths
        or on_disk_archive_paths != expected_archive_paths
        or missing_archive_files
        or checksum_mismatches
    ):
        raise SystemExit(
            "source archive integrity failure: "
            f"malformed_manifest_rows={malformed_checksum_rows}, "
            f"manifest_missing={sorted(expected_archive_paths - set(checksum_entries))}, "
            f"manifest_extra={sorted(set(checksum_entries) - expected_archive_paths)}, "
            f"disk_missing={sorted(expected_archive_paths - on_disk_archive_paths)}, "
            f"disk_extra={sorted(on_disk_archive_paths - expected_archive_paths)}, "
            f"missing_files={missing_archive_files}, hash_mismatches={checksum_mismatches}"
        )

    google_drive_zip_members = load_csv(
        ROOT / "inventory/google_drive_zip_member_inventory.csv"
    )
    google_drive_zip_member_paths = assert_unique(
        [row["member_path"] for row in google_drive_zip_members],
        "Google Drive ZIP member_path",
    )
    google_drive_zip_member_source_ids = assert_unique(
        [row["mapped_source_id"] for row in google_drive_zip_members],
        "Google Drive ZIP mapped_source_id",
    )
    expected_google_drive_zip_members = build_google_drive_zip_member_rows()
    expected_google_drive_file_source_ids = {
        row["source_id"]
        for row in inventory
        if row["source_id"].startswith("SRC-GDRIVE-FILE-")
    }
    if (
        google_drive_zip_members != expected_google_drive_zip_members
        or len(google_drive_zip_member_paths) != 17
        or google_drive_zip_member_source_ids
        != expected_google_drive_file_source_ids
        or any(
            row["mapping_status"] != "EXACT_CONTENT_HASH_MATCH"
            or row["member_sha256"] != row["extracted_sha256"]
            for row in google_drive_zip_members
        )
    ):
        raise SystemExit(
            "Google Drive ZIP member inventory failure: "
            f"stale={google_drive_zip_members != expected_google_drive_zip_members}, "
            f"members={len(google_drive_zip_member_paths)}, "
            f"missing_sources={sorted(expected_google_drive_file_source_ids - google_drive_zip_member_source_ids)}, "
            f"extra_sources={sorted(google_drive_zip_member_source_ids - expected_google_drive_file_source_ids)}"
        )

    brightcove_video_captures = load_csv(
        ROOT / "inventory/mygroundbiz_brightcove_video_capture.csv"
    )
    brightcove_capture_ids = assert_unique(
        [row["source_id"] for row in brightcove_video_captures],
        "Brightcove capture source_id",
    )
    expected_brightcove_video_captures = build_brightcove_video_capture_rows()
    expected_brightcove_source_ids = {
        row["source_id"]
        for row in inventory
        if row["source_id"].startswith("SRC-MGB-VIDEO-")
    }
    invalid_brightcove_capture_rows = sorted(
        row["source_id"]
        for row in brightcove_video_captures
        if row["speech_caption_status"]
        not in {"PRESENT", "NONE_EXPOSED_BY_PLAYBACK_API"}
        or row["sha256"] != checksum_entries.get(row["local_archive_path"])
        or inventory_by_id[row["source_id"]]["review_status"]
        != "NOT_YET_REVIEWED"
    )
    if (
        brightcove_video_captures != expected_brightcove_video_captures
        or brightcove_capture_ids != expected_brightcove_source_ids
        or invalid_brightcove_capture_rows
    ):
        raise SystemExit(
            "Brightcove video capture inventory failure: "
            f"stale={brightcove_video_captures != expected_brightcove_video_captures}, "
            f"missing={sorted(expected_brightcove_source_ids - brightcove_capture_ids)}, "
            f"extra={sorted(brightcove_capture_ids - expected_brightcove_source_ids)}, "
            f"invalid={invalid_brightcove_capture_rows}"
        )

    source_capture_coverage = load_csv(
        ROOT / "inventory/source_capture_coverage.csv"
    )
    source_capture_ids = assert_unique(
        [row["source_id"] for row in source_capture_coverage],
        "source-capture coverage source_id",
    )
    expected_source_capture_coverage = build_source_capture_rows()
    if (
        source_capture_coverage != expected_source_capture_coverage
        or source_capture_ids != source_ids
    ):
        raise SystemExit(
            "source-capture coverage failure: "
            f"stale={source_capture_coverage != expected_source_capture_coverage}, "
            f"missing={sorted(source_ids - source_capture_ids)}, "
            f"extra={sorted(source_capture_ids - source_ids)}"
        )

    navigation = load_csv(ROOT / "inventory/mygroundbiz_navigation.csv")
    navigation_ids = assert_unique(
        [row["nav_id"] for row in navigation], "MyGroundBiz nav_id"
    )
    navigation_by_id = {row["nav_id"]: row for row in navigation}
    inventory_by_url = {
        row["url_or_path"].rstrip("/"): row
        for row in inventory
        if row["url_or_path"].startswith("http")
    }
    navigation_status_mismatches = sorted(
        (
            nav["nav_id"],
            nav["review_status"],
            source["review_status"],
            nav["relevance_status"],
            source["relevance_status"],
        )
        for nav in navigation
        if (source := inventory_by_url.get(nav["url"].rstrip("/")))
        and (
            nav["review_status"] != source["review_status"]
            or nav["relevance_status"] != source["relevance_status"]
        )
    )
    if navigation_status_mismatches:
        raise SystemExit(
            "MyGroundBiz navigation/source-inventory status mismatch: "
            f"{navigation_status_mismatches}"
        )

    destination_backlog = load_csv(
        ROOT / "inventory/mygroundbiz_destination_backlog.csv"
    )
    backlog_navigation_ids = assert_unique(
        [row["nav_id"] for row in destination_backlog],
        "MyGroundBiz destination backlog nav_id",
    )
    matched_navigation_ids = {
        nav["nav_id"]
        for nav in navigation
        if nav["url"].rstrip("/") in inventory_by_url
    }
    unmatched_navigation_ids = navigation_ids - matched_navigation_ids
    nonpending_unmatched_navigation = sorted(
        nav_id
        for nav_id in unmatched_navigation_ids
        if navigation_by_id[nav_id]["review_status"] != "NOT_YET_REVIEWED"
        or navigation_by_id[nav_id]["relevance_status"] != "PENDING_ASSESSMENT"
    )
    invalid_backlog_rows = sorted(
        row["nav_id"]
        for row in destination_backlog
        if row["nav_id"] not in navigation_ids
        or row["backlog_status"] != "OPEN"
        or row["source_inventory_status"] != "NOT_CREATED"
        or not row["next_action"]
    )
    if (
        backlog_navigation_ids != unmatched_navigation_ids
        or nonpending_unmatched_navigation
        or invalid_backlog_rows
    ):
        raise SystemExit(
            "MyGroundBiz destination backlog mismatch: "
            f"missing={sorted(unmatched_navigation_ids - backlog_navigation_ids)}, "
            f"extra={sorted(backlog_navigation_ids - unmatched_navigation_ids)}, "
            f"nonpending_unmatched={nonpending_unmatched_navigation}, "
            f"invalid_rows={invalid_backlog_rows}"
        )

    customer_alert_rows = load_csv(
        ROOT / "knowledge/customer_alert_review_coverage.csv"
    )
    expected_customer_alert_rows = build_customer_alert_rows()
    alert_ids = assert_unique(
        [row["alert_id"] for row in customer_alert_rows],
        "customer-alert coverage alert_id",
    )
    invalid_customer_alert_rows = sorted(
        row["alert_id"]
        for row in customer_alert_rows
        if row["source_id"] != "SRC-MGB-PAGE-0023"
        or not re.fullmatch(r"[0-9a-f]{64}", row["segment_sha256"])
        or row["review_status"] not in {"FULLY_REVIEWED", "INITIAL_REVIEW_ONLY", "NOT_YET_REVIEWED"}
        or row["knowledge_extraction_status"] not in {"EXTRACTED_TO_CUSTOMER_ALERT_LAYER", "NOT_YET_EXTRACTED"}
        or ((row["review_status"] == "FULLY_REVIEWED") != bool(row["operational_record_id"]))
        or ((row["knowledge_extraction_status"] == "EXTRACTED_TO_CUSTOMER_ALERT_LAYER") != bool(row["operational_record_id"]))
        or not row["required_follow_up"]
    )
    if (
        customer_alert_rows != expected_customer_alert_rows
        or len(alert_ids) != len(expected_customer_alert_rows)
        or invalid_customer_alert_rows
    ):
        raise SystemExit(
            "customer-alert review coverage failure: "
            f"stale={customer_alert_rows != expected_customer_alert_rows}, "
            f"count={len(alert_ids)}/{len(expected_customer_alert_rows)}, invalid={invalid_customer_alert_rows}"
        )

    customer_alert_operational_rows = load_jsonl(
        ROOT / "knowledge/customer_alert_operational_records.jsonl"
    )
    expected_customer_alert_operational_rows = build_customer_alert_operational_rows()
    expected_operational_record_count = len(expected_customer_alert_operational_rows)
    operational_alert_ids = assert_unique(
        [row["alert_knowledge_id"] for row in customer_alert_operational_rows],
        "customer-alert operational record id",
    )
    assigned_alert_ids = [
        alert_id
        for row in customer_alert_operational_rows
        for alert_id in row["source_alert_ids"]
    ]
    expected_assigned_alert_ids = {
        row["alert_id"]
        for row in customer_alert_rows
        if row["review_status"] == "FULLY_REVIEWED"
    }
    invalid_customer_alert_operational_rows = sorted(
        row["alert_knowledge_id"]
        for row in customer_alert_operational_rows
        if row["knowledge_status"] not in {"VERIFIED", "POTENTIALLY_OUTDATED"}
        or row["answer_mode"] not in {"ANSWER_CUSTOMER_SPECIFIC", "WITHHOLD_CURRENT_ANSWER", "REFERENCE_ONLY"}
        or (row["knowledge_status"] == "POTENTIALLY_OUTDATED" and row["answer_mode"] != "WITHHOLD_CURRENT_ANSWER")
        or (row["answer_mode"] == "ANSWER_CUSTOMER_SPECIFIC" and not row["required_procedure"])
        or len(row["driver_question_variants"]) < 3
        or not row["authoritative_rule"]
        or not row["concise_ready_route_answer"]
        or not row["more_info_answer"]
        or not row["clarification_requirements"]
        or not row["source_evidence"]
        or any(evidence["source_id"] != "SRC-MGB-PAGE-0023" for evidence in row["source_evidence"])
    )
    if (
        customer_alert_operational_rows != expected_customer_alert_operational_rows
        or len(operational_alert_ids) != expected_operational_record_count
        or len(assigned_alert_ids) != len(set(assigned_alert_ids))
        or set(assigned_alert_ids) != expected_assigned_alert_ids
        or invalid_customer_alert_operational_rows
    ):
        raise SystemExit(
            "customer-alert operational layer failure: "
            f"stale={customer_alert_operational_rows != expected_customer_alert_operational_rows}, "
            f"records={len(operational_alert_ids)}/{expected_operational_record_count}, "
            f"assigned={len(set(assigned_alert_ids))}/{len(expected_assigned_alert_ids)}, "
            f"invalid={invalid_customer_alert_operational_rows}"
        )

    customer_alert_mapping_rows = load_csv(
        ROOT / "knowledge/customer_alert_source_to_knowledge.csv"
    )
    expected_customer_alert_mapping_rows = build_customer_alert_mapping_rows(
        expected_customer_alert_operational_rows
    )
    mapping_alert_ids = assert_unique(
        [row["alert_id"] for row in customer_alert_mapping_rows],
        "customer-alert source mapping alert_id",
    )
    invalid_customer_alert_mapping_rows = sorted(
        row["alert_id"]
        for row in customer_alert_mapping_rows
        if row["source_id"] != "SRC-MGB-PAGE-0023"
        or row["alert_id"] not in expected_assigned_alert_ids
        or row["alert_knowledge_id"] not in operational_alert_ids
        or not re.fullmatch(r"[0-9a-f]{64}", row["segment_sha256"])
        or not row["source_locator"]
        or not row["temporal_classification"]
        or row["knowledge_status"] not in {"VERIFIED", "POTENTIALLY_OUTDATED"}
        or row["answer_mode"]
        not in {"ANSWER_CUSTOMER_SPECIFIC", "WITHHOLD_CURRENT_ANSWER", "REFERENCE_ONLY"}
    )
    if (
        customer_alert_mapping_rows != expected_customer_alert_mapping_rows
        or mapping_alert_ids != expected_assigned_alert_ids
        or invalid_customer_alert_mapping_rows
    ):
        raise SystemExit(
            "customer-alert source mapping failure: "
            f"stale={customer_alert_mapping_rows != expected_customer_alert_mapping_rows}, "
            f"mapped={len(mapping_alert_ids)}/{len(expected_assigned_alert_ids)}, "
            f"invalid={invalid_customer_alert_mapping_rows}"
        )

    records = load_jsonl(ROOT / "knowledge/records.jsonl")
    knowledge_ids = assert_unique([row["knowledge_id"] for row in records], "knowledge_id")

    invalid_record_dates: list[tuple[str, str]] = []
    invalid_evidence_dates: list[tuple[str, str, str]] = []
    missing_source_versions: list[str] = []
    time_sensitive_status_mismatches: list[tuple[str, str, str]] = []
    for record in records:
        try:
            created_at = parse_iso_date(
                record["created_at"], f"{record['knowledge_id']} created_at"
            )
            updated_at = parse_iso_date(
                record["updated_at"], f"{record['knowledge_id']} updated_at"
            )
        except SystemExit:
            invalid_record_dates.append((record["knowledge_id"], "invalid date format"))
            continue
        if created_at > updated_at or updated_at > today:
            invalid_record_dates.append(
                (
                    record["knowledge_id"],
                    f"created_at={created_at.isoformat()} updated_at={updated_at.isoformat()}",
                )
            )
        if not record["source_date_or_version"].strip():
            missing_source_versions.append(record["knowledge_id"])
        for evidence in record["evidence"]:
            try:
                reviewed_at = parse_iso_date(
                    evidence["reviewed_at"],
                    f"{record['knowledge_id']} evidence {evidence['source_id']} reviewed_at",
                )
            except SystemExit:
                invalid_evidence_dates.append(
                    (record["knowledge_id"], evidence["source_id"], evidence["reviewed_at"])
                )
                continue
            if reviewed_at > updated_at or reviewed_at > today:
                invalid_evidence_dates.append(
                    (record["knowledge_id"], evidence["source_id"], evidence["reviewed_at"])
                )
            source = inventory_by_id.get(evidence["source_id"])
            if (
                source
                and source["relevance_status"] == "TIME_SENSITIVE_RELEVANCE"
                and record["knowledge_status"] != "POTENTIALLY_OUTDATED"
            ):
                time_sensitive_status_mismatches.append(
                    (
                        record["knowledge_id"],
                        evidence["source_id"],
                        record["knowledge_status"],
                    )
                )
    if (
        invalid_record_dates
        or invalid_evidence_dates
        or missing_source_versions
        or time_sensitive_status_mismatches
    ):
        raise SystemExit(
            "knowledge temporal metadata failure: "
            f"record_dates={invalid_record_dates}, "
            f"evidence_dates={invalid_evidence_dates}, "
            f"missing_source_versions={missing_source_versions}, "
            f"time_sensitive_status_mismatches={time_sensitive_status_mismatches}"
        )

    human_review_prefix = (
        "Ready Route cannot establish the complete approved procedure from the "
        "supplied sources. "
    )
    unsafe_nonverified_answers: list[tuple[str, str]] = []
    version_qualifiers = ("version", "older", "current", "recheck", "time-sensitive")
    verification_actions = (
        "check",
        "confirm",
        "contact",
        "notify",
        "support",
        "management",
        "station",
    )
    for record in records:
        status = record["knowledge_status"]
        answer = record["concise_ready_route_answer"]
        answer_lower = answer.lower()
        if status == "VERIFIED":
            continue
        if not record["escalation_requirements"]:
            unsafe_nonverified_answers.append(
                (record["knowledge_id"], "missing escalation requirement")
            )
        if status in {"HUMAN_REVIEW_REQUIRED", "UNRESOLVED"} and not answer.startswith(
            human_review_prefix
        ):
            unsafe_nonverified_answers.append(
                (record["knowledge_id"], "missing approved-procedure source-limit preamble")
            )
        elif status == "CONFLICT" and "conflict" not in answer_lower:
            unsafe_nonverified_answers.append(
                (record["knowledge_id"], "answer does not disclose source conflict")
            )
        elif status == "POTENTIALLY_OUTDATED":
            if not any(term in answer_lower for term in version_qualifiers):
                unsafe_nonverified_answers.append(
                    (record["knowledge_id"], "answer lacks version/currency qualifier")
                )
            if not any(term in answer_lower for term in verification_actions):
                unsafe_nonverified_answers.append(
                    (record["knowledge_id"], "answer lacks current-version verification action")
                )
    if unsafe_nonverified_answers:
        raise SystemExit(
            "non-verified answer publication-safety failure: "
            f"{unsafe_nonverified_answers}"
        )

    status_report_paths = {
        "CONFLICT": ROOT / "reports/conflicts.md",
        "HUMAN_REVIEW_REQUIRED": ROOT / "reports/human_review_queue.md",
        "POTENTIALLY_OUTDATED": ROOT / "reports/potentially_outdated.md",
        "UNRESOLVED": ROOT / "reports/unresolved_knowledge.md",
    }
    status_report_mismatches: list[tuple[str, list[str], list[str]]] = []
    for status, path in status_report_paths.items():
        record_ids = {
            record["knowledge_id"] for record in records if record["knowledge_status"] == status
        }
        report_ids = ids_in_status_index(path, status)
        if record_ids != report_ids:
            status_report_mismatches.append(
                (status, sorted(record_ids - report_ids), sorted(report_ids - record_ids))
            )
    if status_report_mismatches:
        raise SystemExit(
            "knowledge-status report mismatch (status, missing, extra): "
            f"{status_report_mismatches}"
        )

    decision_map_text = (ROOT / "knowledge/decision_logic.md").read_text(encoding="utf-8")
    decision_map_ids = set(re.findall(r"KNO-[A-Z0-9-]+-\d{3}", decision_map_text))
    missing_decision_map_records = sorted(knowledge_ids - decision_map_ids)
    unknown_decision_map_records = sorted(decision_map_ids - knowledge_ids)
    if missing_decision_map_records or unknown_decision_map_records:
        raise SystemExit(
            "decision-map coverage failure: "
            f"missing={missing_decision_map_records}, unknown={unknown_decision_map_records}"
        )

    missing_related = sorted(
        (record["knowledge_id"], related)
        for record in records
        for related in record["related_knowledge_ids"]
        if related not in knowledge_ids
    )
    if missing_related:
        raise SystemExit(f"missing related knowledge records: {missing_related}")

    invalid_related_lists = sorted(
        record["knowledge_id"]
        for record in records
        if len(record["related_knowledge_ids"]) != len(set(record["related_knowledge_ids"]))
        or record["knowledge_id"] in record["related_knowledge_ids"]
    )
    linked_record_ids = {
        record_id
        for record in records
        for related_id in record["related_knowledge_ids"]
        for record_id in (record["knowledge_id"], related_id)
    }
    isolated_record_ids = knowledge_ids - linked_record_ids
    standalone_justifications = load_csv(
        ROOT / "knowledge/standalone_record_justifications.csv"
    )
    standalone_justification_ids = assert_unique(
        [row["knowledge_id"] for row in standalone_justifications],
        "standalone knowledge justification",
    )
    allowed_standalone_types = {
        "NARROW_STANDALONE_POLICY",
        "TIME_SENSITIVE_SOURCE_LIMIT",
        "CONTENT_RESTRICTION_WITHHELD_BRANCH",
        "VERSION_SPECIFIC_SETTING",
        "VERSION_SENSITIVE_SAFETY_WARNING",
    }
    invalid_standalone_justifications = sorted(
        row["knowledge_id"]
        for row in standalone_justifications
        if row["knowledge_id"] not in knowledge_ids
        or row["justification_type"] not in allowed_standalone_types
        or not row["reason"]
    )
    if (
        invalid_related_lists
        or standalone_justification_ids != isolated_record_ids
        or invalid_standalone_justifications
    ):
        raise SystemExit(
            "record relationship graph failure: "
            f"invalid_related_lists={invalid_related_lists}, "
            f"missing_standalone_justifications={sorted(isolated_record_ids - standalone_justification_ids)}, "
            f"stale_standalone_justifications={sorted(standalone_justification_ids - isolated_record_ids)}, "
            f"invalid_justifications={invalid_standalone_justifications}"
        )

    missing_evidence_sources = sorted(
        (record["knowledge_id"], evidence["source_id"])
        for record in records
        for evidence in record["evidence"]
        if evidence["source_id"] not in source_ids
    )
    if missing_evidence_sources:
        raise SystemExit(f"evidence references unknown sources: {missing_evidence_sources}")

    invalid_evidence_authority: list[tuple[str, str, str]] = []
    weak_relevance_statuses = {
        "SECONDARY_REFERENCE",
        "POTENTIALLY_RELEVANT",
        "TIME_SENSITIVE_RELEVANCE",
    }
    generic_locators = {"document", "source", "page", "complete document", "full document"}
    for record in records:
        evidence_sources = [inventory_by_id[item["source_id"]] for item in record["evidence"]]
        for evidence, source in zip(record["evidence"], evidence_sources):
            if source["review_status"] not in {"FULLY_REVIEWED", "PARTIALLY_REVIEWED"}:
                invalid_evidence_authority.append(
                    (record["knowledge_id"], source["source_id"], "source is not reviewed")
                )
            if source["relevance_status"] == "SECONDARY_REFERENCE":
                invalid_evidence_authority.append(
                    (record["knowledge_id"], source["source_id"], "secondary source used as evidence")
                )
            if evidence["locator"].strip().lower() in generic_locators:
                invalid_evidence_authority.append(
                    (record["knowledge_id"], source["source_id"], "generic evidence locator")
                )

        if record["knowledge_status"] == "VERIFIED":
            if all(
                source["relevance_status"] in weak_relevance_statuses
                for source in evidence_sources
            ):
                invalid_evidence_authority.append(
                    (record["knowledge_id"], "<all>", "verified record lacks high-relevance evidence")
                )
            partial_sources = [
                source for source in evidence_sources if source["review_status"] == "PARTIALLY_REVIEWED"
            ]
            if partial_sources:
                limitation_text = " ".join(
                    [record["review_notes"], record["more_info_answer"], record["source_date_or_version"]]
                ).lower()
                if "unreviewed" not in limitation_text and "partial" not in limitation_text:
                    invalid_evidence_authority.append(
                        (
                            record["knowledge_id"],
                            ";".join(source["source_id"] for source in partial_sources),
                            "verified record does not disclose partial-source limitation",
                        )
                    )
    if invalid_evidence_authority:
        raise SystemExit(f"invalid evidence authority: {invalid_evidence_authority}")

    mappings = load_csv(ROOT / "knowledge/source_to_knowledge.csv")
    mapping_rows = [
        (row["source_id"], row["locator"], row["knowledge_id"], row["supported_scope"])
        for row in mappings
    ]
    assert_unique(["\x1f".join(row) for row in mapping_rows], "source-to-knowledge mapping row")

    missing_mapping_sources = sorted(
        (row["knowledge_id"], row["source_id"])
        for row in mappings
        if row["source_id"] not in source_ids
    )
    missing_mapping_records = sorted(
        (row["knowledge_id"], row["source_id"])
        for row in mappings
        if row["knowledge_id"] not in knowledge_ids
    )
    if missing_mapping_sources or missing_mapping_records:
        raise SystemExit(
            f"invalid mappings: sources={missing_mapping_sources}, records={missing_mapping_records}"
        )

    evidence_triples = {
        (record["knowledge_id"], evidence["source_id"], evidence["locator"])
        for record in records
        for evidence in record["evidence"]
    }
    mapping_triples = {
        (row["knowledge_id"], row["source_id"], row["locator"])
        for row in mappings
    }
    if evidence_triples != mapping_triples:
        raise SystemExit(
            "evidence/mapping exact-locator mismatch: "
            f"evidence_only={sorted(evidence_triples - mapping_triples)}, "
            f"mapping_only={sorted(mapping_triples - evidence_triples)}"
        )

    source_knowledge_coverage = load_csv(
        ROOT / "inventory/source_knowledge_coverage.csv"
    )
    assert_unique(
        [row["source_id"] for row in source_knowledge_coverage],
        "source-knowledge coverage source_id",
    )
    expected_source_knowledge_coverage = build_source_knowledge_rows()
    allowed_source_coverage_dispositions = {
        "MAPPED_OPERATIONAL_EVIDENCE",
        "MAPPED_PARTIAL_SOURCE_SCOPE",
        "INACCESSIBLE",
        "NOT_YET_REVIEWED",
        "REVIEWED_CONTAINER_CHILDREN_CARRY_EVIDENCE",
        "SECONDARY_REFERENCE_NO_AUTHORITY",
        "PARTIAL_CONTAINER_REVIEW",
        "PARTIAL_LANDING_CHILDREN_PENDING",
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "REINSPECTION_REQUIRED",
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "REVIEWED_CONTEXT_NO_DISTINCT_DRIVER_PROCEDURE",
        "REVIEWED_DUPLICATE_CANDIDATE_MAPPING_ON_SUPPLIED_SOURCE",
        "REVIEWED_EXACT_DUPLICATE_MAPPING_ON_SUPPLIED_SOURCE",
        "REVIEWED_RENDER_IDENTICAL_MAPPING_ON_SUPPLIED_SOURCE",
        "REVIEWED_HISTORICAL_CONTEXT_NEWER_SOURCE_CONTROLS",
        "REVIEWED_CORROBORATIVE_CONTEXT_NEWER_SOURCE_CONTROLS",
        "REVIEWED_VERSION_SENSITIVE_PENDING_CURRENT_CONFIRMATION",
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "DURABLY_CAPTURED_PARTIAL_REVIEW",
        "REVIEWED_CUSTOMER_ALERT_LAYER_CARRIES_EVIDENCE",
        "REVIEWED_REDIRECT_TARGET_CARRIES_EVIDENCE",
    }
    invalid_source_coverage_rows: list[tuple[str, str]] = []
    coverage_mapping_total = 0
    for row in source_knowledge_coverage:
        source_id = row["source_id"]
        source = inventory_by_id.get(source_id)
        if not source:
            invalid_source_coverage_rows.append((source_id, "unknown source"))
            continue
        try:
            mapping_count = int(row["mapping_rows"])
            knowledge_count = int(row["mapped_knowledge_count"])
        except ValueError:
            invalid_source_coverage_rows.append((source_id, "invalid numeric counts"))
            continue
        coverage_mapping_total += mapping_count
        mapped_ids = set(filter(None, row["mapped_knowledge_ids"].split(";")))
        actual_mappings = [
            mapping for mapping in mappings if mapping["source_id"] == source_id
        ]
        actual_mapped_ids = {mapping["knowledge_id"] for mapping in actual_mappings}
        if row["title"] != source["title"]:
            invalid_source_coverage_rows.append((source_id, "title mismatch"))
        if (
            row["review_status"] != source["review_status"]
            or row["relevance_status"] != source["relevance_status"]
        ):
            invalid_source_coverage_rows.append((source_id, "inventory status mismatch"))
        if mapping_count != len(actual_mappings) or knowledge_count != len(actual_mapped_ids):
            invalid_source_coverage_rows.append((source_id, "mapping count mismatch"))
        if mapped_ids != actual_mapped_ids:
            invalid_source_coverage_rows.append((source_id, "mapped knowledge mismatch"))
        if row["coverage_disposition"] not in allowed_source_coverage_dispositions:
            invalid_source_coverage_rows.append((source_id, "invalid disposition"))
        if not row["coverage_basis"] or not row["required_follow_up"]:
            invalid_source_coverage_rows.append((source_id, "missing basis/follow-up"))
        if mapping_count and row["coverage_disposition"] not in {
            "MAPPED_OPERATIONAL_EVIDENCE",
            "MAPPED_PARTIAL_SOURCE_SCOPE",
        }:
            invalid_source_coverage_rows.append((source_id, "mapped source has zero-map disposition"))
        if not mapping_count and row["coverage_disposition"].startswith("MAPPED_"):
            invalid_source_coverage_rows.append((source_id, "unmapped source has mapped disposition"))
        if (
            row["coverage_disposition"] == "MAPPED_PARTIAL_SOURCE_SCOPE"
            and source["review_status"] != "PARTIALLY_REVIEWED"
        ):
            invalid_source_coverage_rows.append((source_id, "partial mapping status mismatch"))
        if (
            row["coverage_disposition"] == "MAPPED_OPERATIONAL_EVIDENCE"
            and source["review_status"] != "FULLY_REVIEWED"
        ):
            invalid_source_coverage_rows.append((source_id, "full mapping status mismatch"))
        if (
            row["coverage_disposition"] == "NOT_YET_REVIEWED"
            and source["review_status"] != "NOT_YET_REVIEWED"
        ):
            invalid_source_coverage_rows.append((source_id, "not-reviewed status mismatch"))
        if (
            row["coverage_disposition"] == "INACCESSIBLE"
            and source["review_status"] != "INACCESSIBLE"
        ):
            invalid_source_coverage_rows.append((source_id, "inaccessible status mismatch"))

    if (
        source_knowledge_coverage != expected_source_knowledge_coverage
        or {row["source_id"] for row in source_knowledge_coverage} != source_ids
        or coverage_mapping_total != len(mappings)
        or invalid_source_coverage_rows
    ):
        raise SystemExit(
            "source-knowledge coverage failure: "
            f"stale={source_knowledge_coverage != expected_source_knowledge_coverage}, "
            f"missing_sources={sorted(source_ids - {row['source_id'] for row in source_knowledge_coverage})}, "
            f"extra_sources={sorted({row['source_id'] for row in source_knowledge_coverage} - source_ids)}, "
            f"mapping_total={coverage_mapping_total}/{len(mappings)}, "
            f"invalid_rows={invalid_source_coverage_rows}"
        )

    claim_provenance = load_jsonl(ROOT / "knowledge/claim_provenance.jsonl")
    assert_unique(
        [row["claim_id"] for row in claim_provenance],
        "claim provenance claim_id",
    )
    expected_claim_provenance = build_claim_provenance_rows(records)
    if claim_provenance != expected_claim_provenance:
        first_difference = next(
            (
                index,
                actual,
                expected,
            )
            for index, (actual, expected) in enumerate(
                zip(claim_provenance, expected_claim_provenance), 1
            )
            if actual != expected
        ) if len(claim_provenance) == len(expected_claim_provenance) else None
        raise SystemExit(
            "claim provenance is stale or invalid: "
            f"actual_count={len(claim_provenance)}, "
            f"expected_count={len(expected_claim_provenance)}, "
            f"first_difference={first_difference}"
        )
    allowed_claim_traceability = {
        "SINGLE_EVIDENCE_FRAGMENT": (
            "SINGLE_FRAGMENT_UNAMBIGUOUS",
            "TRACEABLE_TO_SINGLE_EXACT_RECORD_FRAGMENT",
        ),
        "MULTI_FRAGMENT_SINGLE_SOURCE": (
            "CLAIM_TO_FRAGMENT_ALLOCATION_REQUIRED",
            "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED",
        ),
        "MULTI_SOURCE_EVIDENCE_SET": (
            "CLAIM_TO_FRAGMENT_ALLOCATION_REQUIRED",
            "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED",
        ),
    }
    invalid_claim_traceability = sorted(
        row["claim_id"]
        for row in claim_provenance
        if row["traceability_class"] not in allowed_claim_traceability
        or (
            row["claim_evidence_allocation_status"],
            row["production_trace_gate"],
        )
        != allowed_claim_traceability.get(row["traceability_class"])
        or (
            row["traceability_class"] == "SINGLE_EVIDENCE_FRAGMENT"
            and len(row["evidence_refs"]) != 1
        )
        or (
            row["traceability_class"] == "MULTI_FRAGMENT_SINGLE_SOURCE"
            and (
                len(row["evidence_refs"]) <= 1
                or len({ref["source_id"] for ref in row["evidence_refs"]}) != 1
            )
        )
        or (
            row["traceability_class"] == "MULTI_SOURCE_EVIDENCE_SET"
            and len({ref["source_id"] for ref in row["evidence_refs"]}) <= 1
        )
    )
    if invalid_claim_traceability:
        raise SystemExit(
            "claim traceability control failure: "
            f"{invalid_claim_traceability}"
        )

    claim_evidence_allocation_coverage = load_jsonl(
        ROOT / "knowledge/claim_evidence_allocation_coverage.jsonl"
    )
    claim_allocation_ids = assert_unique(
        [row["claim_id"] for row in claim_evidence_allocation_coverage],
        "claim-evidence allocation claim_id",
    )
    expected_claim_evidence_allocation_coverage = (
        build_claim_evidence_allocation_rows()
    )
    allowed_allocation_controls = {
        "AUTO_ALLOCATED_SINGLE_FRAGMENT": "CLAIM_FRAGMENT_TRACE_READY",
        "HUMAN_ALLOCATED_MULTI_FRAGMENT": "CLAIM_FRAGMENT_TRACE_READY",
        "PENDING_MULTI_FRAGMENT_REVIEW": (
            "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED"
        ),
    }
    invalid_claim_allocations = sorted(
        row["claim_id"]
        for row in claim_evidence_allocation_coverage
        if row["allocation_status"] not in allowed_allocation_controls
        or row["production_trace_gate"]
        != allowed_allocation_controls.get(row["allocation_status"])
        or not row["allocation_basis"]
        or (
            row["allocation_status"] == "PENDING_MULTI_FRAGMENT_REVIEW"
            and (row["allocated_evidence_refs"] or row["reviewed_at"])
        )
        or (
            row["allocation_status"] != "PENDING_MULTI_FRAGMENT_REVIEW"
            and (not row["allocated_evidence_refs"] or not row["reviewed_at"])
        )
    )
    if (
        claim_evidence_allocation_coverage
        != expected_claim_evidence_allocation_coverage
        or claim_allocation_ids
        != {row["claim_id"] for row in claim_provenance}
        or invalid_claim_allocations
    ):
        raise SystemExit(
            "claim-evidence allocation coverage failure: "
            f"stale={claim_evidence_allocation_coverage != expected_claim_evidence_allocation_coverage}, "
            f"missing={sorted({row['claim_id'] for row in claim_provenance} - claim_allocation_ids)}, "
            f"extra={sorted(claim_allocation_ids - {row['claim_id'] for row in claim_provenance})}, "
            f"invalid={invalid_claim_allocations}"
        )

    taxonomy = json.loads((ROOT / "knowledge/taxonomy.json").read_text(encoding="utf-8"))
    taxonomy_ids = assert_unique([node["id"] for node in taxonomy["nodes"]], "taxonomy node")
    taxonomy_by_id = {node["id"]: node for node in taxonomy["nodes"]}
    bad_parents = sorted(
        (node["id"], parent)
        for node in taxonomy["nodes"]
        for parent in node["parents"]
        if parent not in taxonomy_ids
    )
    bad_relationships = sorted(
        (edge["from"], edge["to"])
        for edge in taxonomy["relationships"]
        if edge["from"] not in taxonomy_ids or edge["to"] not in taxonomy_ids
    )
    bad_paths = sorted(
        (record["knowledge_id"], path, segment)
        for record in records
        for path in record["taxonomy_paths"]
        for segment in path.split("/")
        if segment not in taxonomy_ids
    )
    empty_taxonomy_paths = sorted(
        record["knowledge_id"] for record in records if not record["taxonomy_paths"]
    )
    nonroot_path_starts = sorted(
        (record["knowledge_id"], path, path.split("/")[0])
        for record in records
        for path in record["taxonomy_paths"]
        if path.split("/")[0] in taxonomy_by_id
        and taxonomy_by_id[path.split("/")[0]]["parents"]
    )
    invalid_path_edges = sorted(
        (record["knowledge_id"], path, parent, child)
        for record in records
        for path in record["taxonomy_paths"]
        for parent, child in zip(path.split("/"), path.split("/")[1:])
        if child in taxonomy_by_id and parent not in taxonomy_by_id[child]["parents"]
    )
    if (
        bad_parents
        or bad_relationships
        or bad_paths
        or empty_taxonomy_paths
        or nonroot_path_starts
        or invalid_path_edges
    ):
        raise SystemExit(
            f"taxonomy integrity failure: parents={bad_parents}, "
            f"relationships={bad_relationships}, paths={bad_paths}, "
            f"empty_paths={empty_taxonomy_paths}, nonroot_starts={nonroot_path_starts}, "
            f"invalid_edges={invalid_path_edges}"
        )

    taxonomy_usage = Counter(
        segment
        for record in records
        for path in record["taxonomy_paths"]
        for segment in path.split("/")
    )
    coverage_exceptions = taxonomy.get("coverage_exceptions", [])
    coverage_exception_ids = assert_unique(
        [item["node_id"] for item in coverage_exceptions], "taxonomy coverage exception"
    )
    invalid_coverage_exceptions = sorted(
        item["node_id"]
        for item in coverage_exceptions
        if item["node_id"] not in taxonomy_ids
        or not item.get("status")
        or not item.get("reason")
        or not item.get("source_ids")
        or any(source_id not in source_ids for source_id in item.get("source_ids", []))
    )
    uncovered_taxonomy_nodes = sorted(
        node_id
        for node_id in taxonomy_ids
        if not taxonomy_usage[node_id] and node_id not in coverage_exception_ids
    )
    stale_coverage_exceptions = sorted(
        node_id for node_id in coverage_exception_ids if taxonomy_usage[node_id]
    )
    if invalid_coverage_exceptions or uncovered_taxonomy_nodes or stale_coverage_exceptions:
        raise SystemExit(
            "taxonomy coverage failure: "
            f"invalid_exceptions={invalid_coverage_exceptions}, "
            f"uncovered_nodes={uncovered_taxonomy_nodes}, "
            f"stale_exceptions={stale_coverage_exceptions}"
        )

    referenced_source_backlog = load_csv(
        ROOT / "inventory/referenced_source_backlog.csv"
    )
    referenced_backlog_ids = assert_unique(
        [row["backlog_id"] for row in referenced_source_backlog],
        "referenced-source backlog_id",
    )
    nonempty_source_identifiers = [
        row["source_identifier"]
        for row in referenced_source_backlog
        if row["source_identifier"]
    ]
    assert_unique(nonempty_source_identifiers, "referenced-source identifier")
    allowed_backlog_priorities = {
        "P0_BLOCKS_APPROVED_GUIDANCE",
        "P1_COMPLETENESS",
    }
    invalid_referenced_backlog_rows: list[tuple[str, str]] = []
    for row in referenced_source_backlog:
        origin_ids = set(filter(None, row["origin_source_ids"].split(";")))
        affected_targets = set(filter(None, row["affected_targets"].split(";")))
        invalid_targets = {
            target
            for target in affected_targets
            if target not in knowledge_ids
            and target not in taxonomy_ids
            and not (ROOT / target).exists()
        }
        if not re.fullmatch(r"REFSRC-\d{3}", row["backlog_id"]):
            invalid_referenced_backlog_rows.append((row["backlog_id"], "invalid backlog_id"))
        if not row["title_or_description"] or not row["reason_required"]:
            invalid_referenced_backlog_rows.append((row["backlog_id"], "missing description/reason"))
        if not origin_ids or not origin_ids.issubset(source_ids):
            invalid_referenced_backlog_rows.append((row["backlog_id"], "invalid origin source"))
        if row["priority"] not in allowed_backlog_priorities:
            invalid_referenced_backlog_rows.append((row["backlog_id"], "invalid priority"))
        if row["acquisition_status"] != "NOT_ACQUIRED" or row["review_status"] != "NOT_YET_REVIEWED":
            invalid_referenced_backlog_rows.append((row["backlog_id"], "invalid open status"))
        if not affected_targets or invalid_targets:
            invalid_referenced_backlog_rows.append(
                (row["backlog_id"], f"invalid targets {sorted(invalid_targets)}")
            )
    required_missing_identifiers = {
        "OP-324",
        "OP-321",
        "OP-207",
        "OP-207Res",
        "HZ-035",
        "SF-920P",
        "SF-034",
        "OP-900LL/LG",
        "OP-901/OP-902",
        "OP-950",
        "OP-200/OP-200SP",
        "OP-201",
        "OP-206",
        "OP-406",
        "SF-136/OP-908",
        "SF-035",
    }
    missing_required_identifiers = sorted(
        required_missing_identifiers - set(nonempty_source_identifiers)
    )
    if invalid_referenced_backlog_rows or missing_required_identifiers:
        raise SystemExit(
            "referenced-source backlog failure: "
            f"invalid_rows={invalid_referenced_backlog_rows}, "
            f"missing_required_identifiers={missing_required_identifiers}"
        )

    referenced_source_occurrences = load_csv(
        ROOT / "inventory/referenced_source_occurrences.csv"
    )
    occurrence_ids = assert_unique(
        [row["occurrence_id"] for row in referenced_source_occurrences],
        "referenced-source occurrence_id",
    )
    expected_occurrence_ids = {
        f"REFSRC-OCC-{index:04d}"
        for index in range(1, len(referenced_source_occurrences) + 1)
    }
    expected_referenced_source_occurrences = build_referenced_source_occurrence_rows()
    invalid_reference_occurrences = [
        (row["occurrence_id"], "missing required field")
        for row in referenced_source_occurrences
        if not row["exact_locator"]
        or not row["reference_identity"]
        or not row["reference_basis"]
        or row["backlog_id"] not in referenced_backlog_ids
        or row["origin_source_id"] not in source_ids
    ]
    if (
        occurrence_ids != expected_occurrence_ids
        or referenced_source_occurrences != expected_referenced_source_occurrences
        or invalid_reference_occurrences
    ):
        raise SystemExit(
            "referenced-source occurrence coverage failure: "
            f"ids_match={occurrence_ids == expected_occurrence_ids}, "
            f"stale={referenced_source_occurrences != expected_referenced_source_occurrences}, "
            f"invalid={invalid_reference_occurrences}"
        )

    form_artifacts = load_csv(ROOT / "knowledge/form_artifact_coverage.csv")
    assert_unique(
        [row["artifact_id"] for row in form_artifacts],
        "form/artifact coverage artifact_id",
    )
    expected_form_artifacts = build_form_artifact_rows()
    allowed_artifact_access = {
        "CURRENT_ARTIFACT_REVIEWED",
        "CURRENT_ARTIFACT_PARTIALLY_REVIEWED",
        "DESCRIBED_BUT_NOT_ACQUIRED",
        "PHOTOGRAPHED_EXAMPLE_IDENTITY_UNRESOLVED",
        "GENERIC_DOCUMENT_TYPE_ONLY",
    }
    allowed_procedure_coverage = {
        "COMPLETE_PROCEDURE_MODELED",
        "PARTIAL_PROCEDURE_MODELED",
        "REFERENCE_ONLY",
        "FORM_FIELDS_PARTIALLY_REVIEWED",
    }
    allowed_publication_gates = {
        "VERIFIED_PROCEDURE_WITH_ARTIFACT_GAP",
        "HUMAN_REVIEW_REQUIRED",
        "SOURCE_LIMIT_ONLY",
        "COMPLIANCE_REVIEW_REQUIRED",
        "LOCAL_CONFIGURATION_REQUIRED",
    }
    invalid_form_artifacts: list[tuple[str, str]] = []
    covered_artifact_backlogs: set[str] = set()
    official_artifact_identifiers: set[str] = set()
    for row in form_artifacts:
        artifact_id = row["artifact_id"]
        linked_sources = set(filter(None, row["source_ids"].split(";")))
        linked_backlogs = set(filter(None, row["backlog_ids"].split(";")))
        linked_knowledge = set(filter(None, row["knowledge_ids"].split(";")))
        covered_artifact_backlogs.update(linked_backlogs)
        row_identifiers = set(filter(None, row["official_identifiers"].split(";")))
        duplicate_identifiers = row_identifiers & official_artifact_identifiers
        if duplicate_identifiers:
            invalid_form_artifacts.append(
                (artifact_id, f"duplicate official identifiers {sorted(duplicate_identifiers)}")
            )
        official_artifact_identifiers.update(row_identifiers)
        if not re.fullmatch(r"ART-[A-Z]+-\d{3}", artifact_id):
            invalid_form_artifacts.append((artifact_id, "invalid artifact_id"))
        if not row["artifact_name"] or not row["artifact_family"]:
            invalid_form_artifacts.append((artifact_id, "missing identity/family"))
        if not linked_sources or not linked_sources.issubset(source_ids):
            invalid_form_artifacts.append((artifact_id, "invalid source_ids"))
        if not linked_backlogs.issubset(referenced_backlog_ids):
            invalid_form_artifacts.append((artifact_id, "invalid backlog_ids"))
        if not linked_knowledge or not linked_knowledge.issubset(knowledge_ids):
            invalid_form_artifacts.append((artifact_id, "invalid knowledge_ids"))
        if row["artifact_access"] not in allowed_artifact_access:
            invalid_form_artifacts.append((artifact_id, "invalid artifact_access"))
        if row["procedure_coverage"] not in allowed_procedure_coverage:
            invalid_form_artifacts.append((artifact_id, "invalid procedure_coverage"))
        if row["publication_gate"] not in allowed_publication_gates:
            invalid_form_artifacts.append((artifact_id, "invalid publication_gate"))
        if not row["coverage_limit"] or not row["required_follow_up"]:
            invalid_form_artifacts.append((artifact_id, "missing limit/follow-up"))
        if (
            row["artifact_access"] == "CURRENT_ARTIFACT_PARTIALLY_REVIEWED"
            and not any(
                inventory_by_id[source_id]["review_status"] == "PARTIALLY_REVIEWED"
                for source_id in linked_sources
            )
        ):
            invalid_form_artifacts.append(
                (artifact_id, "partial artifact lacks partially reviewed source")
            )
        if (
            row["artifact_access"] == "PHOTOGRAPHED_EXAMPLE_IDENTITY_UNRESOLVED"
            and row["publication_gate"] not in {"HUMAN_REVIEW_REQUIRED", "SOURCE_LIMIT_ONLY"}
        ):
            invalid_form_artifacts.append(
                (artifact_id, "unresolved photographed identity is not publication-gated")
            )

    required_artifact_backlogs = {
        "REFSRC-002",
        "REFSRC-003",
        "REFSRC-004",
        "REFSRC-005",
        "REFSRC-006",
        "REFSRC-007",
        "REFSRC-010",
        "REFSRC-012",
        "REFSRC-013",
        "REFSRC-014",
        "REFSRC-015",
        "REFSRC-016",
        "REFSRC-017",
        "REFSRC-018",
        "REFSRC-019",
        "REFSRC-020",
        "REFSRC-031",
        "REFSRC-032",
        "REFSRC-033",
        "REFSRC-034",
    }
    handsheet_rows = [
        row
        for row in form_artifacts
        if "KNO-DOC-HANDSHEET-001" in row["knowledge_ids"].split(";")
    ]
    if (
        form_artifacts != expected_form_artifacts
        or invalid_form_artifacts
        or not required_artifact_backlogs.issubset(covered_artifact_backlogs)
        or {row["artifact_id"] for row in handsheet_rows}
        != {"ART-DOC-001", "ART-DOC-002"}
    ):
        raise SystemExit(
            "form/artifact coverage failure: "
            f"stale={form_artifacts != expected_form_artifacts}, "
            f"invalid_rows={invalid_form_artifacts}, "
            f"missing_backlogs={sorted(required_artifact_backlogs - covered_artifact_backlogs)}, "
            f"handsheet_rows={sorted(row['artifact_id'] for row in handsheet_rows)}"
        )

    op117_page_coverage = load_csv(ROOT / "knowledge/op117_page_coverage.csv")
    expected_op117_page_coverage = build_op117_page_rows()
    allowed_page_dispositions = {
        "GOVERNING_FRONT_MATTER",
        "TABLE_OF_CONTENTS",
        "KNOWLEDGE_MAPPED",
        "KNOWLEDGE_AND_REFERENCE_MAPPED",
        "REFERENCE_DATA_MODELED",
        "SECTION_DIVIDER",
        "VISUAL_REFERENCE_ONLY",
        "LOCAL_CONTACT_TEMPLATE_TRACKED",
    }
    invalid_op117_pages: list[tuple[str, str]] = []
    expected_pages = [str(page) for page in range(1, 90)]
    if [row["page"] for row in op117_page_coverage] != expected_pages:
        invalid_op117_pages.append(("ALL", "pages must be exactly 1 through 89 in order"))
    for row in op117_page_coverage:
        page = row["page"]
        linked_knowledge = set(filter(None, row["knowledge_ids"].split(";")))
        linked_artifacts = set(filter(None, row["artifact_ids"].split(";")))
        if row["coverage_disposition"] not in allowed_page_dispositions:
            invalid_op117_pages.append((page, "invalid or unreconciled disposition"))
        if not row["section_or_subject"] or not row["coverage_basis"]:
            invalid_op117_pages.append((page, "missing subject or coverage basis"))
        if not linked_knowledge.issubset(knowledge_ids):
            invalid_op117_pages.append((page, "invalid knowledge_ids"))
        if not linked_artifacts.issubset({item["artifact_id"] for item in form_artifacts}):
            invalid_op117_pages.append((page, "invalid artifact_ids"))
    expected_explicit_dispositions = {
        "1": "GOVERNING_FRONT_MATTER",
        "2": "TABLE_OF_CONTENTS",
        "3": "TABLE_OF_CONTENTS",
        "4": "TABLE_OF_CONTENTS",
        "5": "TABLE_OF_CONTENTS",
        "74": "SECTION_DIVIDER",
        "88": "VISUAL_REFERENCE_ONLY",
        "89": "LOCAL_CONTACT_TEMPLATE_TRACKED",
    }
    actual_dispositions = {
        row["page"]: row["coverage_disposition"] for row in op117_page_coverage
    }
    for page, disposition in expected_explicit_dispositions.items():
        if actual_dispositions.get(page) != disposition:
            invalid_op117_pages.append((page, f"expected {disposition}"))
    for required_mapped_page in ("26", "75"):
        if not next(
            (row["knowledge_ids"] for row in op117_page_coverage if row["page"] == required_mapped_page),
            "",
        ):
            invalid_op117_pages.append((required_mapped_page, "substantive page is not knowledge-mapped"))
    if op117_page_coverage != expected_op117_page_coverage or invalid_op117_pages:
        raise SystemExit(
            "OP-117 page coverage failure: "
            f"stale={op117_page_coverage != expected_op117_page_coverage}, "
            f"invalid_pages={invalid_op117_pages}"
        )

    forge_page_coverage = load_csv(ROOT / "knowledge/forge_page_coverage.csv")
    expected_forge_page_coverage = build_forge_page_rows()
    allowed_forge_dispositions = {
        "KNOWLEDGE_MAPPED",
        "GOVERNING_FRONT_MATTER",
        "TABLE_OF_CONTENTS",
        "UI_SCREEN_REFERENCE",
        "ICON_GLOSSARY_REFERENCE",
        "NAVIGATION_REFERENCE",
        "DEMO_FIXTURE_REFERENCE",
    }
    invalid_forge_pages: list[tuple[str, str]] = []
    if [row["page"] for row in forge_page_coverage] != [str(page) for page in range(1, 247)]:
        invalid_forge_pages.append(("ALL", "pages must be exactly 1 through 246 in order"))
    for row in forge_page_coverage:
        page = row["page"]
        linked_knowledge = set(filter(None, row["knowledge_ids"].split(";")))
        if row["coverage_disposition"] not in allowed_forge_dispositions:
            invalid_forge_pages.append((page, "invalid or unreconciled disposition"))
        if not row["section_or_subject"] or not row["coverage_basis"]:
            invalid_forge_pages.append((page, "missing subject or coverage basis"))
        if not linked_knowledge.issubset(knowledge_ids):
            invalid_forge_pages.append((page, "invalid knowledge_ids"))
    expected_forge_explicit = {
        "1": "GOVERNING_FRONT_MATTER", "2": "TABLE_OF_CONTENTS", "3": "TABLE_OF_CONTENTS", "4": "TABLE_OF_CONTENTS",
        "23": "UI_SCREEN_REFERENCE", "24": "UI_SCREEN_REFERENCE", "27": "ICON_GLOSSARY_REFERENCE",
        "235": "NAVIGATION_REFERENCE", "240": "DEMO_FIXTURE_REFERENCE", "241": "DEMO_FIXTURE_REFERENCE",
    }
    actual_forge_dispositions = {row["page"]: row["coverage_disposition"] for row in forge_page_coverage}
    for page, disposition in expected_forge_explicit.items():
        if actual_forge_dispositions.get(page) != disposition:
            invalid_forge_pages.append((page, f"expected {disposition}"))
    for required_page in ("5", "6", "8", "25", "28", "33", "40", "73", "77", "92", "115", "117", "122", "186", "237", "239", "246"):
        if not next((row["knowledge_ids"] for row in forge_page_coverage if row["page"] == required_page), ""):
            invalid_forge_pages.append((required_page, "substantive page is not knowledge-mapped"))
    if forge_page_coverage != expected_forge_page_coverage or invalid_forge_pages:
        raise SystemExit("FORGE page coverage failure: " f"stale={forge_page_coverage != expected_forge_page_coverage}, " f"invalid_pages={invalid_forge_pages}")

    drive_pdf_page_coverage = load_csv(ROOT / "knowledge/drive_pdf_page_coverage.csv")
    expected_drive_pdf_page_coverage = build_drive_pdf_page_rows()
    allowed_drive_pdf_dispositions = allowed_page_dispositions | allowed_forge_dispositions | {
        "OLDER_STATUS_REFERENCE_ONLY", "OLDER_STATUS_REFERENCE_PARTIALLY_MODELED",
        "PRESENTATION_CONTEXT", "METRICS_CONTEXT", "OLDER_VERSION_REFERENCE_ONLY",
        "VISUAL_EXAMPLE_ONLY",
    }
    invalid_drive_pdf_pages: list[tuple[str, str, str]] = []
    expected_drive_pdf_sources = {
        row["source_id"] for row in inventory
        if row["source_system"] == "Google Drive browser" and row["source_type"] == "PDF"
    }
    if len(drive_pdf_page_coverage) != 407:
        invalid_drive_pdf_pages.append(("ALL", "ALL", "expected exactly 407 PDF pages"))
    if {row["source_id"] for row in drive_pdf_page_coverage} != expected_drive_pdf_sources:
        invalid_drive_pdf_pages.append(("ALL", "ALL", "PDF source set differs from inventory"))
    for row in drive_pdf_page_coverage:
        sid, page = row["source_id"], row["page"]
        linked = set(filter(None, row["knowledge_ids"].split(";")))
        if row["coverage_disposition"] not in allowed_drive_pdf_dispositions:
            invalid_drive_pdf_pages.append((sid, page, "invalid or unreconciled disposition"))
        if not row["title"] or not row["section_or_subject"] or not row["coverage_basis"]:
            invalid_drive_pdf_pages.append((sid, page, "missing title/subject/basis"))
        if not linked.issubset(knowledge_ids):
            invalid_drive_pdf_pages.append((sid, page, "invalid knowledge_ids"))
    if drive_pdf_page_coverage != expected_drive_pdf_page_coverage or invalid_drive_pdf_pages:
        raise SystemExit("Drive PDF page coverage failure: " f"stale={drive_pdf_page_coverage != expected_drive_pdf_page_coverage}, " f"invalid_pages={invalid_drive_pdf_pages}")

    legacy_page_crosswalk = load_csv(
        ROOT / "knowledge/legacy_reference_page_crosswalk.csv"
    )
    legacy_crosswalk_keys = assert_unique(
        [f"{row['legacy_source_id']}:{row['legacy_page']}" for row in legacy_page_crosswalk],
        "legacy reference page crosswalk key",
    )
    expected_legacy_crosswalk_keys = {
        f"{row['source_id']}:{row['page']}"
        for row in drive_pdf_page_coverage
        if row["coverage_disposition"].startswith("OLDER_")
    }
    allowed_legacy_crosswalk_dispositions = {
        "CURRENT_REFERENCE_DATA_WITH_GAPS",
        "MIXED_CURRENT_MODEL_AND_GAPS",
        "VERSION_GATED_CURRENT_MODEL",
        "CURRENT_POLICY_AND_VERSION_GATED_UI",
    }
    allowed_reference_data_scopes = {
        "",
        "DELIVERY_STATUS:50",
        "DELIVERY_STATUS:50;PICKUP_REASON:7",
    }
    invalid_legacy_crosswalk_rows: list[tuple[str, str]] = []
    for row in legacy_page_crosswalk:
        key = f"{row['legacy_source_id']}:{row['legacy_page']}"
        current_sources = set(filter(None, row["current_source_ids"].split(";")))
        linked_knowledge = set(filter(None, row["knowledge_ids"].split(";")))
        linked_gaps = set(filter(None, row["remaining_gap_ids"].split(";")))
        if row["crosswalk_disposition"] not in allowed_legacy_crosswalk_dispositions:
            invalid_legacy_crosswalk_rows.append((key, "invalid disposition"))
        if not row["legacy_subject"] or not row["current_locators"] or not row["review_basis"]:
            invalid_legacy_crosswalk_rows.append((key, "missing subject/locator/review basis"))
        if not current_sources or not current_sources.issubset(source_ids):
            invalid_legacy_crosswalk_rows.append((key, "invalid current source IDs"))
        elif any(inventory_by_id[sid]["review_status"] != "FULLY_REVIEWED" for sid in current_sources):
            invalid_legacy_crosswalk_rows.append((key, "current source is not fully reviewed"))
        if not linked_knowledge.issubset(knowledge_ids):
            invalid_legacy_crosswalk_rows.append((key, "invalid knowledge IDs"))
        if not linked_gaps.issubset(referenced_backlog_ids):
            invalid_legacy_crosswalk_rows.append((key, "invalid remaining gap IDs"))
        if row["reference_data_scope"] not in allowed_reference_data_scopes:
            invalid_legacy_crosswalk_rows.append((key, "invalid reference-data scope"))
        if not linked_knowledge and not row["reference_data_scope"]:
            invalid_legacy_crosswalk_rows.append((key, "no modeled replacement"))
        if "GAPS" in row["crosswalk_disposition"] and not linked_gaps:
            invalid_legacy_crosswalk_rows.append((key, "gap disposition lacks gap IDs"))
    if legacy_crosswalk_keys != expected_legacy_crosswalk_keys or invalid_legacy_crosswalk_rows:
        raise SystemExit(
            "legacy reference page crosswalk failure: "
            f"missing={sorted(expected_legacy_crosswalk_keys - legacy_crosswalk_keys)}, "
            f"extra={sorted(legacy_crosswalk_keys - expected_legacy_crosswalk_keys)}, "
            f"invalid={invalid_legacy_crosswalk_rows}"
        )

    artifact_identifier_exclusions = load_csv(
        ROOT / "knowledge/artifact_identifier_exclusions.csv"
    )
    excluded_artifact_identifiers = assert_unique(
        [row["identifier"] for row in artifact_identifier_exclusions],
        "artifact identifier exclusion",
    )
    allowed_identifier_exclusion_classes = {"SOURCE_PUBLICATION_IDENTIFIER"}
    invalid_identifier_exclusions: list[tuple[str, str]] = []
    for row in artifact_identifier_exclusions:
        exclusion_sources = set(filter(None, row["source_ids"].split(";")))
        if row["exclusion_class"] not in allowed_identifier_exclusion_classes:
            invalid_identifier_exclusions.append(
                (row["identifier"], "invalid exclusion class")
            )
        if not exclusion_sources or not exclusion_sources.issubset(source_ids):
            invalid_identifier_exclusions.append(
                (row["identifier"], "invalid exclusion sources")
            )
        if not row["reason"]:
            invalid_identifier_exclusions.append((row["identifier"], "missing reason"))
        if row["identifier"] in official_artifact_identifiers:
            invalid_identifier_exclusions.append(
                (row["identifier"], "identifier is both artifact and exclusion")
            )

    identifier_pattern = re.compile(
        r"(?<![A-Z0-9])((?:OP|SF|HZ)[ -]?\d{3}(?:RES|SP|PRP|LL|LG|P)?)(?![A-Z0-9])"
        r"|(?<![A-Z0-9])(20159S)(?![A-Z0-9])",
        re.IGNORECASE,
    )

    def normalize_artifact_identifier(raw: str) -> str:
        compact = raw.upper().replace(" ", "").replace("-", "")
        if compact == "20159S":
            return compact
        match = re.fullmatch(r"(OP|SF|HZ)(.+)", compact)
        if not match:
            return compact
        return f"{match.group(1)}-{match.group(2)}"

    identifier_scan_paths = [
        ROOT / "knowledge/records.jsonl",
        *sorted((ROOT / "reviews").glob("*.md")),
        *sorted((ROOT / "tmp/pdf-text").glob("*.txt")),
    ]
    discovered_artifact_identifiers: set[str] = set()
    for path in identifier_scan_paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in identifier_pattern.finditer(text):
            discovered_artifact_identifiers.add(
                normalize_artifact_identifier(match.group(1) or match.group(2))
            )
    unresolved_artifact_identifiers = sorted(
        discovered_artifact_identifiers
        - official_artifact_identifiers
        - excluded_artifact_identifiers
    )
    stale_identifier_exclusions = sorted(
        excluded_artifact_identifiers - discovered_artifact_identifiers
    )
    if (
        invalid_identifier_exclusions
        or unresolved_artifact_identifiers
        or stale_identifier_exclusions
    ):
        raise SystemExit(
            "artifact identifier discovery failure: "
            f"invalid_exclusions={invalid_identifier_exclusions}, "
            f"unresolved={unresolved_artifact_identifiers}, "
            f"stale_exclusions={stale_identifier_exclusions}"
        )

    cases = load_jsonl(ROOT / "validation/driver_language_cases.jsonl")
    assert_unique([case["case_id"] for case in cases], "driver-language case_id")
    normalized_case_utterances = [normalize_driver_text(case["utterance"]) for case in cases]
    assert_unique(normalized_case_utterances, "normalized driver-language utterance")
    missing_case_records = sorted(
        (case["case_id"], expected)
        for case in cases
        for expected in case["expected_knowledge_ids"]
        if expected not in knowledge_ids
    )
    if missing_case_records:
        raise SystemExit(f"driver-language cases reference unknown records: {missing_case_records}")

    clarification_strategy_index = load_jsonl(
        ROOT / "validation/clarification_strategy_index.jsonl"
    )
    assert_unique(
        [row["case_id"] for row in clarification_strategy_index],
        "clarification-strategy case_id",
    )
    expected_clarification_strategy_index = build_clarification_strategy_rows(cases)
    if clarification_strategy_index != expected_clarification_strategy_index:
        first_difference = next(
            (
                index,
                actual,
                expected,
            )
            for index, (actual, expected) in enumerate(
                zip(
                    clarification_strategy_index,
                    expected_clarification_strategy_index,
                ),
                1,
            )
            if actual != expected
        ) if len(clarification_strategy_index) == len(
            expected_clarification_strategy_index
        ) else None
        raise SystemExit(
            "clarification strategy index is stale or invalid: "
            f"actual_count={len(clarification_strategy_index)}, "
            f"expected_count={len(expected_clarification_strategy_index)}, "
            f"first_difference={first_difference}"
        )

    cases_by_knowledge: dict[str, list[str]] = {knowledge_id: [] for knowledge_id in knowledge_ids}
    for case in cases:
        for expected in case["expected_knowledge_ids"]:
            cases_by_knowledge[expected].append(case["case_id"])
    untested_records = sorted(
        knowledge_id for knowledge_id, case_ids in cases_by_knowledge.items() if not case_ids
    )
    if untested_records:
        raise SystemExit(f"knowledge records without driver-language coverage: {untested_records}")

    underrepresented_variant_records = sorted(
        record["knowledge_id"]
        for record in records
        if len(record["driver_question_variants"]) < 4
    )
    if underrepresented_variant_records:
        raise SystemExit(
            "knowledge records with fewer than four driver-question variants: "
            f"{underrepresented_variant_records}"
        )

    supplemental_variants = load_jsonl(
        ROOT / "validation/supplemental_driver_variants.jsonl"
    )
    assert_unique(
        [row["supplemental_variant_id"] for row in supplemental_variants],
        "supplemental driver variant_id",
    )
    allowed_supplemental_variant_types = {
        "CONTEXT_RICH",
        "CONTEXT_RICH_RARE_EXCEPTION",
        "CONTEXT_RICH_SAFETY",
        "CONTEXT_RICH_SHORTHAND",
        "CONTEXT_RICH_TERMINOLOGY",
        "INCOMPLETE",
        "SHORTHAND",
        "TERMINOLOGY_ERROR",
    }
    invalid_supplemental_variants: list[tuple[str, str]] = []
    for row in supplemental_variants:
        normalized = normalize_driver_text(row["utterance"])
        token_count = len(normalized.split())
        if row["knowledge_id"] not in knowledge_ids:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "unknown knowledge record")
            )
        if row["variant_type"] not in allowed_supplemental_variant_types:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "invalid variant type")
            )
        if row["surface_goal"] not in {"SHORT", "EXTENDED"}:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "invalid surface goal")
            )
        if row["surface_goal"] == "SHORT" and token_count > 4:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "short goal exceeds four tokens")
            )
        if row["surface_goal"] == "EXTENDED" and token_count < 6:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "extended goal below six tokens")
            )
        if not normalized or not row["rationale"]:
            invalid_supplemental_variants.append(
                (row["supplemental_variant_id"], "missing utterance or rationale")
            )
    if invalid_supplemental_variants:
        raise SystemExit(
            "supplemental driver variant failure: "
            f"{invalid_supplemental_variants}"
        )

    variant_entries = [
        (
            record["knowledge_id"],
            variant,
            normalize_driver_text(variant),
        )
        for record in records
        for variant in record["driver_question_variants"]
    ]
    embedded_normalized_variants = {entry[2] for entry in variant_entries}
    supplemental_normalized_variants = {
        normalize_driver_text(row["utterance"]) for row in supplemental_variants
    }
    supplemental_surface_duplicates = sorted(
        supplemental_normalized_variants
        & (embedded_normalized_variants | set(normalized_case_utterances))
    )
    if supplemental_surface_duplicates:
        raise SystemExit(
            "supplemental driver variants duplicate an existing surface: "
            f"{supplemental_surface_duplicates}"
        )
    variant_entries.extend(
        (
            row["knowledge_id"],
            row["utterance"],
            normalize_driver_text(row["utterance"]),
        )
        for row in supplemental_variants
    )
    assert_unique(
        [entry[2] for entry in variant_entries],
        "normalized driver-question variant",
    )
    driver_variant_index = load_jsonl(
        ROOT / "validation/driver_variant_index.jsonl"
    )
    assert_unique(
        [row["variant_id"] for row in driver_variant_index],
        "driver variant_id",
    )
    expected_driver_variant_index = build_driver_variant_rows(
        records, supplemental_variants
    )
    if driver_variant_index != expected_driver_variant_index:
        first_difference = next(
            (
                index,
                actual,
                expected,
            )
            for index, (actual, expected) in enumerate(
                zip(driver_variant_index, expected_driver_variant_index), 1
            )
            if actual != expected
        ) if len(driver_variant_index) == len(expected_driver_variant_index) else None
        raise SystemExit(
            "driver variant index is stale or invalid: "
            f"actual_count={len(driver_variant_index)}, "
            f"expected_count={len(expected_driver_variant_index)}, "
            f"first_difference={first_difference}"
        )
    surface_lengths = {row["surface_length"] for row in driver_variant_index}
    if surface_lengths != {"VERY_SHORT", "SHORT", "EXTENDED"}:
        raise SystemExit(
            "driver variant surface-length coverage failure: "
            f"{sorted(surface_lengths)}"
        )

    surface_utterances_by_knowledge: dict[str, list[str]] = {
        knowledge_id: [] for knowledge_id in knowledge_ids
    }
    for row in driver_variant_index:
        surface_utterances_by_knowledge[row["knowledge_id"]].append(row["utterance"])
    for case in cases:
        for knowledge_id in case["expected_knowledge_ids"]:
            surface_utterances_by_knowledge[knowledge_id].append(case["utterance"])
    records_without_short_surface = sorted(
        knowledge_id
        for knowledge_id, utterances in surface_utterances_by_knowledge.items()
        if not any(
            len(normalize_driver_text(utterance).split()) <= 4
            for utterance in utterances
        )
    )
    records_without_extended_surface = sorted(
        knowledge_id
        for knowledge_id, utterances in surface_utterances_by_knowledge.items()
        if not any(
            len(normalize_driver_text(utterance).split()) >= 6
            for utterance in utterances
        )
    )
    if records_without_short_surface or records_without_extended_surface:
        raise SystemExit(
            "per-record driver-language surface coverage failure: "
            f"no_short={records_without_short_surface}, "
            f"no_extended={records_without_extended_surface}"
        )

    record_language_surface_coverage = load_csv(
        ROOT / "validation/record_language_surface_coverage.csv"
    )
    record_language_surface_ids = assert_unique(
        [row["knowledge_id"] for row in record_language_surface_coverage],
        "record-language surface knowledge_id",
    )
    expected_record_language_surface_coverage = (
        build_record_language_surface_rows()
    )
    invalid_record_language_surfaces = [
        row["knowledge_id"]
        for row in record_language_surface_coverage
        if row["surface_coverage_status"] != "SHORT_AND_EXTENDED_PRESENT"
        or int(row["embedded_variant_count"]) < 4
        or int(row["formal_case_count"]) < 1
        or int(row["short_surface_count"]) < 1
        or int(row["extended_surface_count"]) < 1
    ]
    if (
        record_language_surface_coverage
        != expected_record_language_surface_coverage
        or record_language_surface_ids != knowledge_ids
        or invalid_record_language_surfaces
    ):
        raise SystemExit(
            "record-language surface coverage failure: "
            f"stale={record_language_surface_coverage != expected_record_language_surface_coverage}, "
            f"missing={sorted(knowledge_ids - record_language_surface_ids)}, "
            f"extra={sorted(record_language_surface_ids - knowledge_ids)}, "
            f"invalid={sorted(invalid_record_language_surfaces)}"
        )

    required_case_type_signals = {
        "MISSPELLING",
        "SHORTHAND",
        "INCOMPLETE",
        "TERMINOLOGY",
        "AMBIGUOUS",
        "MULTI",
        "SAFETY",
        "CONFLICT",
        "POTENTIALLY_OUTDATED",
        "HUMAN_REVIEW",
    }
    minimum_case_type_signal_counts = {
        "MISSPELLING": 10,
        "SHORTHAND": 17,
        "INCOMPLETE": 10,
        "TERMINOLOGY": 10,
        "AMBIGUOUS": 12,
        "MULTI": 20,
        "SAFETY": 9,
        "CONFLICT": 3,
        "POTENTIALLY_OUTDATED": 15,
        "HUMAN_REVIEW": 23,
    }
    case_type_signal_counts = {
        signal: sum(signal in case["case_type"] for case in cases)
        for signal in required_case_type_signals
    }
    missing_case_type_signals = sorted(
        signal
        for signal in required_case_type_signals
        if case_type_signal_counts[signal] == 0
    )
    deficient_case_type_signals = sorted(
        (signal, case_type_signal_counts[signal], minimum_count)
        for signal, minimum_count in minimum_case_type_signal_counts.items()
        if case_type_signal_counts[signal] < minimum_count
    )
    if missing_case_type_signals or deficient_case_type_signals:
        raise SystemExit(
            "driver-language case-type coverage failure: "
            f"missing={missing_case_type_signals}, "
            f"below_minimum={deficient_case_type_signals}"
        )
    ambiguous_record_pairs: set[frozenset[str]] = set()
    for index, left in enumerate(variant_entries):
        for right in variant_entries[index + 1 :]:
            if left[0] == right[0]:
                continue
            if SequenceMatcher(None, left[2], right[2]).ratio() >= 0.78:
                ambiguous_record_pairs.add(frozenset((left[0], right[0])))
    uncovered_ambiguous_pairs = sorted(
        tuple(sorted(pair))
        for pair in ambiguous_record_pairs
        if not any(pair.issubset(set(case["expected_knowledge_ids"])) for case in cases)
    )
    if uncovered_ambiguous_pairs:
        raise SystemExit(
            "near-colliding question variants lack a multi-record validation case: "
            f"{uncovered_ambiguous_pairs}"
        )

    records_by_id = {record["knowledge_id"]: record for record in records}
    allowed_sufficiency = {
        "SUFFICIENT",
        "CONDITIONALLY_SUFFICIENT",
        "INSUFFICIENT_CONFLICT",
        "INSUFFICIENT_FOR_APPROVED_ANSWER",
        "INSUFFICIENT_WITHOUT_VERSION_CONFIRMATION",
    }
    allowed_response_modes = {
        "DIRECT_SOURCE_GROUNDED_ANSWER",
        "ASK_MINIMUM_CLARIFICATION",
        "IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY",
        "WITHHOLD_DISPUTED_STEP_AND_ESCALATE",
        "STATE_SOURCE_LIMIT_AND_ESCALATE",
        "QUALIFY_AND_REQUIRE_CURRENT_VERSION_CHECK",
    }
    bad_case_assessments: list[tuple[str, str]] = []
    for case in cases:
        if not case.get("utterance") or not case.get("expected_knowledge_ids"):
            bad_case_assessments.append((case.get("case_id", "<missing>"), "missing utterance/records"))
            continue
        if not case.get("must_not_do"):
            bad_case_assessments.append((case["case_id"], "missing must_not_do"))
        if case.get("information_sufficiency") not in allowed_sufficiency:
            bad_case_assessments.append((case["case_id"], "invalid information_sufficiency"))
        if case.get("response_mode") not in allowed_response_modes:
            bad_case_assessments.append((case["case_id"], "invalid response_mode"))

        required_source_gap_ids = case.get("required_source_gap_ids", [])
        if (
            not isinstance(required_source_gap_ids, list)
            or len(required_source_gap_ids) != len(set(required_source_gap_ids))
            or any(gap_id not in referenced_backlog_ids for gap_id in required_source_gap_ids)
        ):
            bad_case_assessments.append(
                (case["case_id"], "invalid required_source_gap_ids")
            )

        statuses = {
            records_by_id[knowledge_id]["knowledge_status"]
            for knowledge_id in case["expected_knowledge_ids"]
        }
        if "CONFLICT" in statuses:
            expected_sufficiency = "INSUFFICIENT_CONFLICT"
            expected_modes = {"WITHHOLD_DISPUTED_STEP_AND_ESCALATE"}
        elif required_source_gap_ids or statuses & {"HUMAN_REVIEW_REQUIRED", "UNRESOLVED"}:
            expected_sufficiency = "INSUFFICIENT_FOR_APPROVED_ANSWER"
            expected_modes = {"STATE_SOURCE_LIMIT_AND_ESCALATE"}
        elif "POTENTIALLY_OUTDATED" in statuses:
            expected_sufficiency = "INSUFFICIENT_WITHOUT_VERSION_CONFIRMATION"
            expected_modes = {"QUALIFY_AND_REQUIRE_CURRENT_VERSION_CHECK"}
        elif case.get("must_clarify"):
            expected_sufficiency = "CONDITIONALLY_SUFFICIENT"
            expected_modes = {
                "ASK_MINIMUM_CLARIFICATION",
                "IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY",
            }
        else:
            expected_sufficiency = "SUFFICIENT"
            expected_modes = {"DIRECT_SOURCE_GROUNDED_ANSWER"}
        if case.get("information_sufficiency") != expected_sufficiency:
            bad_case_assessments.append(
                (case["case_id"], f"expected sufficiency {expected_sufficiency}")
            )
        if case.get("response_mode") not in expected_modes:
            bad_case_assessments.append(
                (case["case_id"], f"unexpected response mode {case.get('response_mode')}")
            )
    if bad_case_assessments:
        raise SystemExit(f"invalid driver-language assessments: {bad_case_assessments}")

    interaction_coverage = load_csv(
        ROOT / "validation/high_risk_interaction_coverage.csv"
    )
    interaction_case_ids = assert_unique(
        [row["case_id"] for row in interaction_coverage],
        "high-risk interaction case_id",
    )
    cases_by_id = {case["case_id"]: case for case in cases}
    expected_interaction_case_ids = {
        case["case_id"] for case in cases if len(case["expected_knowledge_ids"]) > 1
    }
    allowed_interaction_risks = {
        "AMBIGUOUS_BRANCH",
        "CAPACITY_TIME",
        "COMPLIANCE_INTEGRITY",
        "DOCUMENT_CUSTODY",
        "RECOVERY_INTEGRITY",
        "SAFETY_PRIORITY",
        "SOURCE_AUTHORITY",
        "SPECIALIZED_OVERRIDE",
        "VERSION_SYNC",
    }
    invalid_interaction_rows: list[tuple[str, str]] = []
    for row in interaction_coverage:
        case = cases_by_id.get(row["case_id"])
        required_ids = set(filter(None, row["required_knowledge_ids"].split(";")))
        if not case:
            invalid_interaction_rows.append((row["case_id"], "unknown case"))
            continue
        if required_ids != set(case["expected_knowledge_ids"]):
            invalid_interaction_rows.append((row["case_id"], "knowledge set differs from case"))
        if row["risk_class"] not in allowed_interaction_risks:
            invalid_interaction_rows.append((row["case_id"], "invalid risk class"))
        if not row["interaction_family"] or not row["coverage_rationale"]:
            invalid_interaction_rows.append((row["case_id"], "missing family/rationale"))
    if interaction_case_ids != expected_interaction_case_ids or invalid_interaction_rows:
        raise SystemExit(
            "high-risk interaction coverage failure: "
            f"missing={sorted(expected_interaction_case_ids - interaction_case_ids)}, "
            f"extra={sorted(interaction_case_ids - expected_interaction_case_ids)}, "
            f"invalid={invalid_interaction_rows}"
        )

    safety_library = load_csv(ROOT / "inventory/mygroundbiz_safety_topic_library.csv")
    safety_library_ids = assert_unique(
        [row["library_item_id"] for row in safety_library], "safety library item"
    )
    safety_library_by_id = {row["library_item_id"]: row for row in safety_library}
    date_ambiguities = load_csv(ROOT / "inventory/date_ambiguities.csv")
    date_ambiguity_keys = assert_unique(
        [f"{row['context_id']}\x1f{row['field_name']}" for row in date_ambiguities],
        "date ambiguity context/field",
    )
    nonstandard_safety_dates: dict[tuple[str, str], str] = {}
    for row in safety_library:
        posted_date = row["posted_date"]
        try:
            parsed_posted_date = datetime.strptime(posted_date, "%m/%d/%Y")
            if parsed_posted_date.strftime("%m/%d/%Y") != posted_date:
                raise ValueError("non-canonical date")
        except ValueError:
            nonstandard_safety_dates[(row["library_item_id"], "posted_date")] = posted_date
    ambiguity_rows = {
        (row["context_id"], row["field_name"]): row for row in date_ambiguities
    }
    invalid_date_ambiguities = sorted(
        (row["context_id"], row["field_name"])
        for row in date_ambiguities
        if row["status"] != "UNRESOLVED_SOURCE_DISPLAY"
        or not row["reason"]
        or nonstandard_safety_dates.get((row["context_id"], row["field_name"]))
        != row["raw_value"]
    )
    expected_date_ambiguity_keys = set(nonstandard_safety_dates)
    actual_date_ambiguity_keys = {
        (row["context_id"], row["field_name"]) for row in date_ambiguities
    }
    if (
        actual_date_ambiguity_keys != expected_date_ambiguity_keys
        or invalid_date_ambiguities
    ):
        raise SystemExit(
            "date ambiguity ledger failure: "
            f"missing={sorted(expected_date_ambiguity_keys - actual_date_ambiguity_keys)}, "
            f"extra={sorted(actual_date_ambiguity_keys - expected_date_ambiguity_keys)}, "
            f"invalid={invalid_date_ambiguities}"
        )
    invalid_library_duplicates = sorted(
        (row["library_item_id"], row["duplicate_of"])
        for row in safety_library
        if row["duplicate_of"]
        and (
            row["duplicate_of"] not in safety_library_ids
            or safety_library_by_id[row["duplicate_of"]]["url"].rstrip("/")
            != row["url"].rstrip("/")
        )
    )
    library_source_status_mismatches = sorted(
        (
            row["library_item_id"],
            row["review_status"],
            source["review_status"],
            row["relevance_status"],
            source["relevance_status"],
        )
        for row in safety_library
        if (source := inventory_by_url.get(row["url"].rstrip("/")))
        and (
            row["review_status"] != source["review_status"]
            or row["relevance_status"] != source["relevance_status"]
        )
    )

    safety_backlog = load_csv(ROOT / "inventory/mygroundbiz_safety_topic_backlog.csv")
    safety_backlog_ids = assert_unique(
        [row["canonical_library_item_id"] for row in safety_backlog],
        "Safety Topic backlog canonical_library_item_id",
    )
    library_rows_by_url: dict[str, list[dict[str, str]]] = {}
    for row in safety_library:
        library_rows_by_url.setdefault(row["url"].rstrip("/"), []).append(row)
    unmatched_library_urls = {
        url for url in library_rows_by_url if url not in inventory_by_url
    }
    expected_safety_backlog_ids = {
        next(
            (row["library_item_id"] for row in rows if not row["duplicate_of"]),
            rows[0]["library_item_id"],
        )
        for url, rows in library_rows_by_url.items()
        if url in unmatched_library_urls
    }
    invalid_safety_backlog_rows: list[str] = []
    for row in safety_backlog:
        canonical_id = row["canonical_library_item_id"]
        if canonical_id not in safety_library_ids:
            invalid_safety_backlog_rows.append(canonical_id)
            continue
        canonical = safety_library_by_id[canonical_id]
        group_ids = {
            item["library_item_id"]
            for item in library_rows_by_url[canonical["url"].rstrip("/")]
        }
        listed_aliases = set(filter(None, row["also_listed_as"].split(";")))
        if (
            canonical["url"].rstrip("/") in inventory_by_url
            or listed_aliases != group_ids - {canonical_id}
            or row["backlog_status"] != "OPEN"
            or row["source_inventory_status"] != "NOT_CREATED"
            or not row["next_action"]
        ):
            invalid_safety_backlog_rows.append(canonical_id)
    nonpending_unmatched_library = sorted(
        row["library_item_id"]
        for row in safety_library
        if row["url"].rstrip("/") in unmatched_library_urls
        and (
            row["review_status"] != "NOT_YET_REVIEWED"
            or row["relevance_status"] != "PENDING_ASSESSMENT"
        )
    )
    if (
        invalid_library_duplicates
        or library_source_status_mismatches
        or safety_backlog_ids != expected_safety_backlog_ids
        or invalid_safety_backlog_rows
        or nonpending_unmatched_library
    ):
        raise SystemExit(
            "Safety Topic Library coverage failure: "
            f"duplicates={invalid_library_duplicates}, "
            f"status_mismatches={library_source_status_mismatches}, "
            f"backlog_missing={sorted(expected_safety_backlog_ids - safety_backlog_ids)}, "
            f"backlog_extra={sorted(safety_backlog_ids - expected_safety_backlog_ids)}, "
            f"invalid_backlog={sorted(invalid_safety_backlog_rows)}, "
            f"nonpending_unmatched={nonpending_unmatched_library}"
        )

    news_archive_backlog = load_csv(
        ROOT / "inventory/mygroundbiz_news_archive_backlog.csv"
    )
    expected_news_archive_backlog = build_mygb_news_archive_rows()
    news_archive_ids = assert_unique(
        [row["archive_id"] for row in news_archive_backlog],
        "MyGroundBiz news archive_id",
    )
    assert_unique(
        [row["year_month"] for row in news_archive_backlog],
        "MyGroundBiz news archive year_month",
    )
    assert_unique(
        [row["url"] for row in news_archive_backlog],
        "MyGroundBiz news archive URL",
    )
    invalid_news_archive_rows = sorted(
        row["archive_id"]
        for row in news_archive_backlog
        if row["parent_source_id"] != "SRC-MGB-PAGE-0023"
        or not re.fullmatch(r"\d{4}-\d{2}", row["year_month"])
        or f"archive={row['year_month']}" not in row["url"]
        or row["access_status"] != "AUTHENTICATED_LINK_DISCOVERED"
        or row["review_status"] != "NOT_YET_REVIEWED"
        or row["relevance_status"] != "POTENTIALLY_RELEVANT"
        or row["acquisition_status"] != "NOT_ACQUIRED"
        or not row["discovery_locator"]
        or not row["required_action"]
    )
    if (
        news_archive_backlog != expected_news_archive_backlog
        or len(news_archive_ids) != 100
        or invalid_news_archive_rows
    ):
        raise SystemExit(
            "MyGroundBiz news-archive backlog failure: "
            f"stale={news_archive_backlog != expected_news_archive_backlog}, "
            f"count={len(news_archive_ids)}/100, "
            f"invalid={invalid_news_archive_rows}"
        )

    acquisition_queue = load_csv(
        ROOT / "inventory/mygroundbiz_authenticated_acquisition_queue.csv"
    )
    expected_acquisition_queue = build_mygb_acquisition_rows()
    acquisition_queue_ids = assert_unique(
        [f"{row['resource_type']}:{row['resource_id']}" for row in acquisition_queue],
        "MyGroundBiz acquisition queue resource",
    )
    acquisition_resource_ids = {row["resource_id"] for row in acquisition_queue}
    expected_acquisition_queue_ids = {
        *(f"DESTINATION_PAGE:{row['nav_id']}" for row in destination_backlog),
        *(f"SAFETY_DOCUMENT:{row['canonical_library_item_id']}" for row in safety_backlog),
        *(f"NEWS_ARCHIVE_PAGE:{row['archive_id']}" for row in news_archive_backlog),
        *(
            f"{'PARTIAL_SOURCE_DOCUMENT' if row['source_type'] == 'PDF' else 'PARTIAL_SOURCE_PAGE'}:{row['source_id']}"
            for row in inventory
            if row["source_system"] == "MyGroundBiz"
            and row["review_status"] == "PARTIALLY_REVIEWED"
        ),
        *(
            f"{('UNREVIEWED_PRIMARY_DOCUMENT' if row['source_type'] in {'PDF', 'downloadable document'} else ('UNREVIEWED_PRIMARY_VIDEO' if row['source_type'] == 'embedded video' else 'UNREVIEWED_PRIMARY_PAGE'))}:{row['source_id']}"
            for row in inventory
            if row["source_system"] == "MyGroundBiz"
            and row["review_status"] == "NOT_YET_REVIEWED"
            and row["access_status"] == "ACCESSIBLE"
        ),
        *(
            f"{'DURABLE_RECAPTURE_DOCUMENT' if row['source_type'] == 'PDF' else 'DURABLE_RECAPTURE_PAGE'}:{row['source_id']}"
            for row in inventory
            if row["source_system"] == "MyGroundBiz"
            and row["review_status"] == "FULLY_REVIEWED"
            and not row["local_archive_path"]
        ),
    }
    allowed_capture_waves = {
        "WAVE_0_PARTIAL_SOURCE_COMPLETION",
        "WAVE_0_UNREVIEWED_PRIMARY_ACQUISITION",
        "WAVE_0_DURABLE_RECAPTURE",
        "WAVE_1_DIRECT_DOCUMENT_ACQUISITION",
        "WAVE_2_NEWS_ARCHIVE_DISCOVERY",
        "WAVE_2_GAP_LINKED_DESTINATIONS",
        "WAVE_3_OPERATIONAL_FAMILY_DESTINATIONS",
        "WAVE_4_REMAINING_DESTINATIONS",
        "WAVE_5_DEFERRED_HISTORICAL_VIDEO_REVIEW",
        "WAVE_5_DEFERRED_NONCURRENT_REFERENCE",
    }
    allowed_resource_types = {
        "PARTIAL_SOURCE_DOCUMENT",
        "PARTIAL_SOURCE_PAGE",
        "UNREVIEWED_PRIMARY_DOCUMENT",
        "UNREVIEWED_PRIMARY_PAGE",
        "UNREVIEWED_PRIMARY_VIDEO",
        "DURABLE_RECAPTURE_DOCUMENT",
        "DURABLE_RECAPTURE_PAGE",
        "SAFETY_DOCUMENT",
        "NEWS_ARCHIVE_PAGE",
        "DESTINATION_PAGE",
    }
    allowed_acquisition_work_states = {
        "PARTIAL_REVIEW_OPEN",
        "UNREVIEWED_PRIMARY_OPEN",
        "UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN",
        "REVIEWED_DURABLE_CAPTURE_OPEN",
        "UNACQUIRED_OPEN",
    }
    evidence_impacts_by_source: dict[str, set[str]] = {
        resource_id: set() for resource_id in acquisition_resource_ids
    }
    for record in records:
        for evidence in record["evidence"]:
            if evidence["source_id"] in evidence_impacts_by_source:
                evidence_impacts_by_source[evidence["source_id"]].add(
                    record["knowledge_id"]
                )
    invalid_acquisition_rows: list[tuple[str, str]] = []
    for expected_order, row in enumerate(acquisition_queue, 1):
        key = f"{row['resource_type']}:{row['resource_id']}"
        linked_gaps = set(filter(None, row["related_gap_ids"].split(";")))
        candidate_comparison_ids = set(
            filter(None, row["candidate_comparison_source_ids"].split(";"))
        )
        nonverified_impacts = set(
            filter(None, row["affected_nonverified_knowledge_ids"].split(";"))
        )
        current_evidence_impacts = set(
            filter(
                None,
                row["affected_current_evidence_knowledge_ids"].split(";"),
            )
        )
        taxonomy_impacts = set(
            filter(None, row["affected_taxonomy_ids"].split(";"))
        )
        expected_current_evidence_impacts = evidence_impacts_by_source[
            row["resource_id"]
        ]
        expected_taxonomy_impacts = {
            taxonomy_id
            for knowledge_id in nonverified_impacts | current_evidence_impacts
            if knowledge_id in records_by_id
            for path in records_by_id[knowledge_id]["taxonomy_paths"]
            for taxonomy_id in path.split("/")
        }
        if row["queue_order"] != str(expected_order):
            invalid_acquisition_rows.append((key, "non-contiguous queue order"))
        if row["capture_wave"] not in allowed_capture_waves:
            invalid_acquisition_rows.append((key, "invalid capture wave"))
        if row["resource_type"] not in allowed_resource_types:
            invalid_acquisition_rows.append((key, "invalid resource type"))
        if not row["title"] or not row["url"] or not row["priority_basis"]:
            invalid_acquisition_rows.append((key, "missing identity or priority basis"))
        if not row["capture_action"] or not row["completion_gate"]:
            invalid_acquisition_rows.append((key, "missing capture action/completion gate"))
        if row["work_state"] not in allowed_acquisition_work_states:
            invalid_acquisition_rows.append((key, "invalid work state"))
        if not row["state_basis"]:
            invalid_acquisition_rows.append((key, "missing state basis"))
        if not linked_gaps.issubset(referenced_backlog_ids):
            invalid_acquisition_rows.append((key, "unknown related gap"))
        if not candidate_comparison_ids.issubset(source_ids) or any(
            not inventory_by_id[candidate_id]["source_system"].startswith(
                "Google Drive"
            )
            for candidate_id in candidate_comparison_ids
            if candidate_id in inventory_by_id
        ):
            invalid_acquisition_rows.append((key, "invalid candidate comparison source"))
        if not nonverified_impacts.issubset(knowledge_ids):
            invalid_acquisition_rows.append((key, "unknown non-verified record"))
        if not current_evidence_impacts.issubset(knowledge_ids):
            invalid_acquisition_rows.append((key, "unknown current-evidence record"))
        if current_evidence_impacts != expected_current_evidence_impacts:
            invalid_acquisition_rows.append(
                (key, "current-evidence impact differs from record evidence")
            )
        if not taxonomy_impacts.issubset(taxonomy_ids):
            invalid_acquisition_rows.append((key, "unknown affected taxonomy"))
        if taxonomy_impacts != expected_taxonomy_impacts:
            invalid_acquisition_rows.append(
                (key, "taxonomy impact differs from exact affected records")
            )
        if row["resource_type"] == "SAFETY_DOCUMENT" and row["capture_wave"] != "WAVE_1_DIRECT_DOCUMENT_ACQUISITION":
            invalid_acquisition_rows.append((key, "direct safety document not in wave 1"))
        if row["resource_type"].startswith("PARTIAL_SOURCE_"):
            expected_partial_wave = (
                "WAVE_5_DEFERRED_NONCURRENT_REFERENCE"
                if row["resource_id"] == "SRC-MGB-DOC-0015"
                else "WAVE_0_PARTIAL_SOURCE_COMPLETION"
            )
            if row["capture_wave"] != expected_partial_wave:
                invalid_acquisition_rows.append(
                    (key, "partial primary source has incorrect priority wave")
                )
        if row["resource_type"].startswith("PARTIAL_SOURCE_") and (
            row["work_state"] != "PARTIAL_REVIEW_OPEN"
            or row["state_basis"]
            != "SOURCE_INVENTORY_REVIEW_STATUS=PARTIALLY_REVIEWED"
        ):
            invalid_acquisition_rows.append((key, "partial-source state/basis mismatch"))
        if row["resource_type"].startswith("UNREVIEWED_PRIMARY_"):
            source = inventory_by_id.get(row["resource_id"])
            source_is_captured = bool(source and source["local_archive_path"])
            expected_capture_wave = (
                "WAVE_5_DEFERRED_HISTORICAL_VIDEO_REVIEW"
                if row["resource_type"] == "UNREVIEWED_PRIMARY_VIDEO"
                else "WAVE_0_UNREVIEWED_PRIMARY_ACQUISITION"
            )
            expected_work_state = (
                "UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN"
                if source_is_captured
                else "UNREVIEWED_PRIMARY_OPEN"
            )
            expected_state_basis = (
                "SOURCE_INVENTORY_REVIEW_STATUS=NOT_YET_REVIEWED;ACCESS_STATUS=ACCESSIBLE;LOCAL_ARCHIVE_PATH=PRESENT"
                if source_is_captured
                else "SOURCE_INVENTORY_REVIEW_STATUS=NOT_YET_REVIEWED;ACCESS_STATUS=ACCESSIBLE;LOCAL_ARCHIVE_PATH=EMPTY"
            )
            expected_candidates = {
                candidate_id
                for candidate_id in filter(
                    None,
                    source["cross_references"].split(";") if source else [],
                )
                if candidate_id.startswith("SRC-GDRIVE-")
            }
            if (
                row["capture_wave"] != expected_capture_wave
                or row["work_state"] != expected_work_state
                or row["state_basis"] != expected_state_basis
                or not source
                or source["source_system"] != "MyGroundBiz"
                or source["review_status"] != "NOT_YET_REVIEWED"
                or source["access_status"] != "ACCESSIBLE"
                or candidate_comparison_ids != expected_candidates
                or (
                    row["resource_type"] == "UNREVIEWED_PRIMARY_VIDEO"
                    and source["source_type"] != "embedded video"
                )
                or (
                    source["source_type"] == "embedded video"
                    and row["resource_type"] != "UNREVIEWED_PRIMARY_VIDEO"
                )
            ):
                invalid_acquisition_rows.append(
                    (key, "unreviewed-primary state/basis/candidate mismatch")
                )
        elif candidate_comparison_ids:
            invalid_acquisition_rows.append(
                (key, "candidate comparison outside unreviewed primary source")
            )
        if row["resource_type"].startswith("DURABLE_RECAPTURE_") and (
            row["capture_wave"] != "WAVE_0_DURABLE_RECAPTURE"
            or row["work_state"] != "REVIEWED_DURABLE_CAPTURE_OPEN"
            or row["state_basis"]
            != "SOURCE_INVENTORY_REVIEW_STATUS=FULLY_REVIEWED;LOCAL_ARCHIVE_PATH=EMPTY"
        ):
            invalid_acquisition_rows.append((key, "durable-recapture state/basis mismatch"))
        if row["resource_type"] == "SAFETY_DOCUMENT" and (
            row["work_state"] != "UNACQUIRED_OPEN"
            or row["state_basis"]
            != "SAFETY_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED"
        ):
            invalid_acquisition_rows.append((key, "safety backlog state/basis mismatch"))
        if row["resource_type"] == "DESTINATION_PAGE" and (
            row["work_state"] != "UNACQUIRED_OPEN"
            or row["state_basis"]
            != "DESTINATION_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED"
        ):
            invalid_acquisition_rows.append((key, "destination backlog state/basis mismatch"))
        if row["resource_type"] == "NEWS_ARCHIVE_PAGE" and (
            row["capture_wave"] != "WAVE_2_NEWS_ARCHIVE_DISCOVERY"
            or row["work_state"] != "UNACQUIRED_OPEN"
            or row["state_basis"]
            != "NEWS_ARCHIVE_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED"
            or row["resource_id"] not in news_archive_ids
        ):
            invalid_acquisition_rows.append((key, "news-archive backlog state/basis mismatch"))
    if (
        acquisition_queue != expected_acquisition_queue
        or acquisition_queue_ids != expected_acquisition_queue_ids
        or invalid_acquisition_rows
    ):
        raise SystemExit(
            "MyGroundBiz acquisition queue failure: "
            f"stale={acquisition_queue != expected_acquisition_queue}, "
            f"missing={sorted(expected_acquisition_queue_ids - acquisition_queue_ids)}, "
            f"extra={sorted(acquisition_queue_ids - expected_acquisition_queue_ids)}, "
            f"invalid={invalid_acquisition_rows}"
        )

    evidence_capture_risk_coverage = load_csv(
        ROOT / "knowledge/evidence_capture_risk_coverage.csv"
    )
    evidence_capture_knowledge_ids = assert_unique(
        [row["knowledge_id"] for row in evidence_capture_risk_coverage],
        "evidence-capture risk knowledge_id",
    )
    expected_evidence_capture_risk_coverage = build_evidence_capture_risk_rows()
    allowed_evidence_capture_classes = {
        "ALL_EVIDENCE_DURABLE",
        "ALL_EVIDENCE_RENDERED_CAPTURE",
        "MIXED_DURABLE_AND_TRANSIENT_EVIDENCE",
        "TRANSIENT_ONLY_FULL_REVIEW_EVIDENCE",
        "EVIDENCE_WITH_PARTIAL_SOURCE",
    }
    invalid_evidence_capture_rows = [
        (row["knowledge_id"], "invalid capture coverage")
        for row in evidence_capture_risk_coverage
        if row["evidence_capture_class"] not in allowed_evidence_capture_classes
        or not row["production_capture_gate"]
        or not row["required_follow_up"]
        or not row["evidence_source_ids"]
    ]
    if (
        evidence_capture_risk_coverage
        != expected_evidence_capture_risk_coverage
        or evidence_capture_knowledge_ids != knowledge_ids
        or invalid_evidence_capture_rows
    ):
        raise SystemExit(
            "evidence-capture risk coverage failure: "
            f"stale={evidence_capture_risk_coverage != expected_evidence_capture_risk_coverage}, "
            f"missing={sorted(knowledge_ids - evidence_capture_knowledge_ids)}, "
            f"extra={sorted(evidence_capture_knowledge_ids - knowledge_ids)}, "
            f"invalid={invalid_evidence_capture_rows}"
        )

    taxonomy_readiness_coverage = load_csv(
        ROOT / "knowledge/taxonomy_readiness_coverage.csv"
    )
    taxonomy_readiness_ids = assert_unique(
        [row["taxonomy_id"] for row in taxonomy_readiness_coverage],
        "taxonomy-readiness taxonomy_id",
    )
    expected_taxonomy_readiness_coverage = build_taxonomy_readiness_rows()
    allowed_taxonomy_readiness_classes = {
        "ALL_RECORDS_VERIFIED_CAPTURE_OPEN",
        "ALL_RECORDS_VERIFIED_DURABLE",
        "MIXED_VERIFIED_AND_NONVERIFIED",
        "NO_VERIFIED_RECORDS",
        "SOURCE_GAP_NO_OPERATIONAL_RECORD",
    }
    invalid_taxonomy_readiness_rows: list[tuple[str, str]] = []
    for row in taxonomy_readiness_coverage:
        if row["readiness_class"] not in allowed_taxonomy_readiness_classes:
            invalid_taxonomy_readiness_rows.append(
                (row["taxonomy_id"], "invalid readiness class")
            )
        if not row["coverage_basis"] or not row["required_follow_up"]:
            invalid_taxonomy_readiness_rows.append(
                (row["taxonomy_id"], "missing basis or follow-up")
            )
        if (
            row["readiness_class"] == "SOURCE_GAP_NO_OPERATIONAL_RECORD"
            and (row["mapped_record_count"] != "0" or not row["referenced_source_gap_ids"])
        ):
            invalid_taxonomy_readiness_rows.append(
                (row["taxonomy_id"], "source-gap class lacks zero-record gap evidence")
            )
        if (
            row["readiness_class"] == "NO_VERIFIED_RECORDS"
            and row["verified_count"] != "0"
        ):
            invalid_taxonomy_readiness_rows.append(
                (row["taxonomy_id"], "no-verified class has verified records")
            )
    if (
        taxonomy_readiness_coverage != expected_taxonomy_readiness_coverage
        or taxonomy_readiness_ids != taxonomy_ids
        or invalid_taxonomy_readiness_rows
    ):
        raise SystemExit(
            "taxonomy-readiness coverage failure: "
            f"stale={taxonomy_readiness_coverage != expected_taxonomy_readiness_coverage}, "
            f"missing={sorted(taxonomy_ids - taxonomy_readiness_ids)}, "
            f"extra={sorted(taxonomy_readiness_ids - taxonomy_ids)}, "
            f"invalid={invalid_taxonomy_readiness_rows}"
        )

    nonverified_resolution_coverage = load_csv(
        ROOT / "knowledge/nonverified_resolution_coverage.csv"
    )
    resolution_knowledge_ids = assert_unique(
        [row["knowledge_id"] for row in nonverified_resolution_coverage],
        "nonverified resolution knowledge_id",
    )
    expected_resolution_knowledge_ids = {
        record["knowledge_id"]
        for record in records
        if record["knowledge_status"] != "VERIFIED"
    }
    allowed_resolution_types = {
        "CONTROLLING_SOURCE_ACQUISITION",
        "CURRENT_PROCEDURE_AND_AUTHORITY",
        "CURRENT_VERSION_CONFIRMATION",
        "EFFECTIVE_DATE_RECHECK",
        "FORM_ARTIFACT_ACQUISITION",
        "LEGAL_COMPLIANCE_REVIEW",
        "POLICY_AUTHORITY_CONFIRMATION",
        "SOURCE_CONFLICT_ADJUDICATION",
    }
    queue_impacts_by_resource = {
        row["resource_id"]: set(
            filter(None, row["affected_nonverified_knowledge_ids"].split(";"))
        )
        for row in acquisition_queue
    }
    backlog_targets_by_id = {
        row["backlog_id"]: set(filter(None, row["affected_targets"].split(";")))
        for row in referenced_source_backlog
    }
    resolution_backlogs_by_knowledge: dict[str, set[str]] = {}
    invalid_resolution_rows: list[tuple[str, str]] = []
    for row in nonverified_resolution_coverage:
        knowledge_id = row["knowledge_id"]
        record = records_by_id.get(knowledge_id)
        linked_backlogs = set(filter(None, row["backlog_ids"].split(";")))
        linked_queue_resources = set(
            filter(None, row["acquisition_queue_resource_ids"].split(";"))
        )
        resolution_backlogs_by_knowledge[knowledge_id] = linked_backlogs
        if not record or record["knowledge_status"] == "VERIFIED":
            invalid_resolution_rows.append((knowledge_id, "not a current non-verified record"))
            continue
        if row["knowledge_status"] != record["knowledge_status"]:
            invalid_resolution_rows.append((knowledge_id, "stale knowledge status"))
        if row["resolution_type"] not in allowed_resolution_types:
            invalid_resolution_rows.append((knowledge_id, "invalid resolution type"))
        if not linked_backlogs.issubset(referenced_backlog_ids):
            invalid_resolution_rows.append((knowledge_id, "unknown backlog ID"))
        elif any(
            knowledge_id not in backlog_targets_by_id[backlog_id]
            for backlog_id in linked_backlogs
        ):
            invalid_resolution_rows.append((knowledge_id, "backlog does not name record as affected"))
        if not linked_queue_resources.issubset(acquisition_resource_ids):
            invalid_resolution_rows.append((knowledge_id, "unknown acquisition resource"))
        if not row["required_evidence_or_decision"] or not row["human_owner_class"]:
            invalid_resolution_rows.append((knowledge_id, "missing resolution requirement/owner"))
        expected_gate = (
            "QUALIFY_UNTIL_CURRENT_VERSION_CONFIRMED"
            if record["knowledge_status"] == "POTENTIALLY_OUTDATED"
            else "WITHHOLD_UNTIL_RESOLVED"
        )
        if row["publication_gate"] != expected_gate:
            invalid_resolution_rows.append((knowledge_id, "status-inconsistent publication gate"))
        if record["knowledge_status"] == "CONFLICT" and row["resolution_type"] != "SOURCE_CONFLICT_ADJUDICATION":
            invalid_resolution_rows.append((knowledge_id, "conflict lacks adjudication resolution"))
        if not linked_backlogs and not linked_queue_resources and row["resolution_type"] != "EFFECTIVE_DATE_RECHECK":
            invalid_resolution_rows.append((knowledge_id, "no source/queue resolution dependency"))
    missing_resolution_backlinks = sorted(
        (backlog_id, target)
        for backlog_id, targets in backlog_targets_by_id.items()
        for target in targets & expected_resolution_knowledge_ids
        if backlog_id not in resolution_backlogs_by_knowledge.get(target, set())
    )
    if missing_resolution_backlinks:
        invalid_resolution_rows.extend(
            (target, f"missing resolution backlink to {backlog_id}")
            for backlog_id, target in missing_resolution_backlinks
        )
    expected_queue_impacts: dict[str, set[str]] = {
        resource_id: set() for resource_id in acquisition_resource_ids
    }
    for row in nonverified_resolution_coverage:
        for resource_id in filter(
            None, row["acquisition_queue_resource_ids"].split(";")
        ):
            expected_queue_impacts[resource_id].add(row["knowledge_id"])
    queue_impact_mismatches = sorted(
        resource_id
        for resource_id in acquisition_resource_ids
        if queue_impacts_by_resource[resource_id]
        != expected_queue_impacts[resource_id]
    )
    if queue_impact_mismatches:
        invalid_resolution_rows.extend(
            (resource_id, "queue affected-record set differs from resolution dependencies")
            for resource_id in queue_impact_mismatches
        )
    if resolution_knowledge_ids != expected_resolution_knowledge_ids or invalid_resolution_rows:
        raise SystemExit(
            "nonverified resolution coverage failure: "
            f"missing={sorted(expected_resolution_knowledge_ids - resolution_knowledge_ids)}, "
            f"extra={sorted(resolution_knowledge_ids - expected_resolution_knowledge_ids)}, "
            f"invalid={invalid_resolution_rows}"
        )

    referenced_source_acquisition_coverage = load_csv(
        ROOT / "inventory/referenced_source_acquisition_coverage.csv"
    )
    referenced_acquisition_ids = assert_unique(
        [row["backlog_id"] for row in referenced_source_acquisition_coverage],
        "referenced-source acquisition backlog_id",
    )
    expected_referenced_source_acquisition_coverage = (
        build_referenced_source_acquisition_rows()
    )
    allowed_queue_link_classes = {
        "DIRECT_GAP_AND_CONTEXTUAL_RESOLUTION_LINKS",
        "DIRECT_GAP_LINK_ONLY",
        "CONTEXTUAL_RESOLUTION_LINK_ONLY",
        "NO_CURRENT_AUTHENTICATED_QUEUE_LINK",
    }
    invalid_referenced_acquisition_rows: list[tuple[str, str]] = []
    for row in referenced_source_acquisition_coverage:
        direct_ids = set(
            filter(None, row["direct_gap_queue_resource_ids"].split(";"))
        )
        contextual_ids = set(
            filter(
                None,
                row["contextual_resolution_queue_resource_ids"].split(";"),
            )
        )
        all_ids = set(
            filter(None, row["all_linked_queue_resource_ids"].split(";"))
        )
        affected_ids = set(
            filter(None, row["affected_knowledge_ids"].split(";"))
        )
        affected_taxonomy_ids = set(
            filter(None, row["affected_taxonomy_ids"].split(";"))
        )
        if row["queue_link_class"] not in allowed_queue_link_classes:
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "invalid queue-link class")
            )
        if not (direct_ids | contextual_ids).issubset(acquisition_resource_ids):
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "unknown acquisition resource")
            )
        if all_ids != direct_ids | contextual_ids:
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "all-linked set differs from direct/context union")
            )
        if not affected_ids.issubset(knowledge_ids):
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "unknown affected knowledge record")
            )
        if not affected_taxonomy_ids.issubset(taxonomy_ids):
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "unknown affected taxonomy")
            )
        if not row["coverage_basis"] or not row["required_follow_up"]:
            invalid_referenced_acquisition_rows.append(
                (row["backlog_id"], "missing basis or follow-up")
            )
    if (
        referenced_source_acquisition_coverage
        != expected_referenced_source_acquisition_coverage
        or referenced_acquisition_ids != referenced_backlog_ids
        or invalid_referenced_acquisition_rows
    ):
        raise SystemExit(
            "referenced-source acquisition coverage failure: "
            f"stale={referenced_source_acquisition_coverage != expected_referenced_source_acquisition_coverage}, "
            f"missing={sorted(referenced_backlog_ids - referenced_acquisition_ids)}, "
            f"extra={sorted(referenced_acquisition_ids - referenced_backlog_ids)}, "
            f"invalid={invalid_referenced_acquisition_rows}"
        )

    workbook_scenario_coverage = load_csv(
        ROOT / "validation/workbook_scenario_coverage.csv"
    )
    expected_workbook_scenario_coverage = build_workbook_scenario_rows()
    workbook_scenario_ids = assert_unique(
        [row["scenario_id"] for row in workbook_scenario_coverage],
        "workbook scenario_id",
    )
    status_code_ids = {
        f"DELIVERY_STATUS:{row['code']}"
        for row in load_jsonl(ROOT / "knowledge/status_codes.jsonl")
    }
    allowed_workbook_coverage_classes = {
        "DIRECTLY_COVERED",
        "CONDITIONALLY_OR_PARTIALLY_COVERED",
        "HUMAN_REVIEW_REQUIRED",
        "NO_AUTHORITATIVE_EVIDENCE",
        "POTENTIALLY_OUTDATED",
        "WORKBOOK_ANSWER_CONTRADICTED",
    }
    invalid_workbook_scenario_rows: list[tuple[str, str]] = []
    for row in workbook_scenario_coverage:
        targets = set(filter(None, row["authoritative_targets"].split(";")))
        backlog_ids = set(filter(None, row["backlog_ids"].split(";")))
        invalid_targets = {
            target
            for target in targets
            if target not in knowledge_ids
            and target not in taxonomy_ids
            and target not in status_code_ids
            and not (ROOT / target).exists()
        }
        if row["coverage_class"] not in allowed_workbook_coverage_classes:
            invalid_workbook_scenario_rows.append(
                (row["scenario_id"], "invalid coverage class")
            )
        if invalid_targets:
            invalid_workbook_scenario_rows.append(
                (row["scenario_id"], f"invalid targets {sorted(invalid_targets)}")
            )
        if not backlog_ids.issubset(referenced_backlog_ids):
            invalid_workbook_scenario_rows.append(
                (row["scenario_id"], "unknown backlog ID")
            )
        if not targets and not backlog_ids:
            invalid_workbook_scenario_rows.append(
                (row["scenario_id"], "no authoritative target or source gap")
            )
        if not row["required_follow_up"] or not re.fullmatch(
            r"[0-9a-f]{64}", row["source_row_sha256"]
        ):
            invalid_workbook_scenario_rows.append(
                (row["scenario_id"], "missing follow-up or invalid source hash")
            )
    if (
        workbook_scenario_coverage != expected_workbook_scenario_coverage
        or workbook_scenario_ids != {str(index) for index in range(1, 79)}
        or invalid_workbook_scenario_rows
    ):
        raise SystemExit(
            "workbook scenario coverage failure: "
            f"stale={workbook_scenario_coverage != expected_workbook_scenario_coverage}, "
            f"missing={sorted({str(index) for index in range(1, 79)} - workbook_scenario_ids)}, "
            f"extra={sorted(workbook_scenario_ids - {str(index) for index in range(1, 79)})}, "
            f"invalid={invalid_workbook_scenario_rows}"
        )

    source_link_fields = ("parent_source_id", "duplicate_of", "supersedes", "superseded_by")
    bad_source_links = sorted(
        (row["source_id"], field, linked_id)
        for row in inventory
        for field in source_link_fields
        for linked_id in filter(None, (value.strip() for value in row[field].split(";")))
        if linked_id not in source_ids
    )
    allowed_cross_references = source_ids | navigation_ids | safety_library_ids
    bad_cross_references = sorted(
        (row["source_id"], linked_id)
        for row in inventory
        for linked_id in filter(
            None, (value.strip() for value in row["cross_references"].split(";"))
        )
        if linked_id not in allowed_cross_references
    )
    if bad_source_links or bad_cross_references:
        raise SystemExit(
            "invalid source inventory relationships: "
            f"source_links={bad_source_links}, cross_references={bad_cross_references}"
        )

    status_counts = Counter(record["knowledge_status"] for record in records)
    sufficiency_counts = Counter(case["information_sufficiency"] for case in cases)
    print(
        "validated corpus integrity: "
        f"{len(inventory)} primary sources, {len(navigation)} MyGroundBiz destinations, "
        f"{len(google_drive_zip_members)} Google Drive ZIP member rows, "
        f"{len(brightcove_video_captures)} Brightcove video capture rows, "
        f"{len(safety_library)} safety-library items, "
        f"{len(news_archive_backlog)} news-archive backlog rows, "
        f"{len(acquisition_queue)} MyGroundBiz acquisition-queue rows, "
        f"{len(customer_alert_rows)} customer-alert review rows, "
        f"{len(customer_alert_operational_rows)} customer-alert operational records, "
        f"{len(customer_alert_mapping_rows)} customer-alert source mappings, "
        f"{len(nonverified_resolution_coverage)} nonverified-resolution rows, "
        f"{len(referenced_source_backlog)} referenced-source gaps, "
        f"{len(referenced_source_occurrences)} referenced-source occurrences, "
        f"{len(referenced_source_acquisition_coverage)} referenced-source acquisition rows, "
        f"{len(workbook_scenario_coverage)} workbook-scenario coverage rows, "
        f"{len(form_artifacts)} form/artifact coverage rows, "
        f"{len(op117_page_coverage)} OP-117 page-coverage rows, "
        f"{len(forge_page_coverage)} FORGE page-coverage rows, "
        f"{len(drive_pdf_page_coverage)} Drive-PDF page-coverage rows, "
        f"{len(legacy_page_crosswalk)} legacy-page crosswalk rows, "
        f"{len(discovered_artifact_identifiers)} discovered form/publication identifiers, "
        f"{len(records)} knowledge records, {len(mappings)} mappings, "
        f"{len(evidence_capture_risk_coverage)} evidence-capture risk rows, "
        f"{len(taxonomy_readiness_coverage)} taxonomy-readiness rows, "
        f"{len(source_capture_coverage)} source-capture rows, "
        f"{len(source_knowledge_coverage)} source-coverage rows, "
        f"{len(claim_provenance)} claim-provenance rows, "
        f"{len(claim_evidence_allocation_coverage)} claim-evidence allocation rows, "
        f"{len(taxonomy_ids)} taxonomy nodes, {len(variant_entries)} question variants, "
        f"{len(driver_variant_index)} variant-index rows, "
        f"{len(cases)} driver-language cases, "
        f"{len(record_language_surface_coverage)} record-language surface rows, "
        f"{len(clarification_strategy_index)} clarification-strategy rows, "
        f"{len(interaction_coverage)} multi-record interaction cases"
    )
    print("knowledge statuses:", dict(sorted(status_counts.items())))
    print("driver-language sufficiency:", dict(sorted(sufficiency_counts.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
