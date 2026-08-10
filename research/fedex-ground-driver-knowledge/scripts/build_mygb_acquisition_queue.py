#!/usr/bin/env python3
"""Build the authenticated MyGroundBiz acquisition queue from open backlogs."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DESTINATION_BACKLOG = ROOT / "inventory/mygroundbiz_destination_backlog.csv"
SAFETY_BACKLOG = ROOT / "inventory/mygroundbiz_safety_topic_backlog.csv"
NEWS_ARCHIVE_BACKLOG = ROOT / "inventory/mygroundbiz_news_archive_backlog.csv"
SOURCE_INVENTORY = ROOT / "inventory/source_inventory.csv"
RESOLUTION_COVERAGE = ROOT / "knowledge/nonverified_resolution_coverage.csv"
KNOWLEDGE_RECORDS = ROOT / "knowledge/records.jsonl"
OUTPUT = ROOT / "inventory/mygroundbiz_authenticated_acquisition_queue.csv"


GAP_LINKED_DESTINATIONS = {
    "MGB-NAV-0018": "REFSRC-024;REFSRC-025;REFSRC-029",
    "MGB-NAV-0022": "REFSRC-022",
    "MGB-NAV-0029": "REFSRC-028",
    "MGB-NAV-0030": "REFSRC-028",
    "MGB-NAV-0033": "REFSRC-028",
    "MGB-NAV-0047": "REFSRC-009",
    "MGB-NAV-0070": "REFSRC-028",
}

GAP_LINKED_SOURCES = {
    "SRC-MGB-PAGE-0023": "REFSRC-030",
}

TITLE_SIGNAL_DESTINATIONS = {
    "MGB-NAV-0005",
    "MGB-NAV-0044",
    "MGB-NAV-0068",
    "MGB-NAV-0075",
    "MGB-NAV-0084",
}

OPERATIONAL_FAMILY_SECTIONS = {"safety", "operations", "vehicles-fuel", "agreement"}

PARTIAL_SOURCE_ORDER = {
    "SRC-MGB-DOC-0008": 1,  # Current accident report form OP-135.
    "SRC-MGB-DOC-0015": 99,  # Rejected as non-current; pursue current OP-321 instead of further review.
    "SRC-MGB-DOC-0010": 3,  # Current equipment terms.
    "SRC-MGB-DOC-0009": 4,  # Current sample agreement; sample limits remain.
    "SRC-MGB-ROOT-0001": 6,  # Dynamic home/news/search/global areas.
}

FIELDS = [
    "queue_order",
    "resource_type",
    "resource_id",
    "title",
    "url",
    "capture_wave",
    "priority_basis",
    "related_gap_ids",
    "candidate_comparison_source_ids",
    "affected_nonverified_knowledge_ids",
    "affected_current_evidence_knowledge_ids",
    "affected_taxonomy_ids",
    "work_state",
    "state_basis",
    "capture_action",
    "completion_gate",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def build_rows() -> list[dict[str, str]]:
    records = [
        json.loads(line)
        for line in KNOWLEDGE_RECORDS.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    records_by_id = {record["knowledge_id"]: record for record in records}
    evidence_affected_by_source: dict[str, set[str]] = defaultdict(set)
    for record in records:
        for evidence in record["evidence"]:
            evidence_affected_by_source[evidence["source_id"]].add(
                record["knowledge_id"]
            )

    affected_by_resource: dict[str, set[str]] = defaultdict(set)
    for row in load_csv(RESOLUTION_COVERAGE):
        for resource_id in filter(
            None, row["acquisition_queue_resource_ids"].split(";")
        ):
            affected_by_resource[resource_id].add(row["knowledge_id"])

    def impact_fields(resource_id: str) -> dict[str, str]:
        evidence_ids = evidence_affected_by_source[resource_id]
        affected_ids = affected_by_resource[resource_id] | evidence_ids
        taxonomy_ids = {
            taxonomy_id
            for knowledge_id in affected_ids
            for path in records_by_id[knowledge_id]["taxonomy_paths"]
            for taxonomy_id in path.split("/")
        }
        return {
            "affected_current_evidence_knowledge_ids": ";".join(
                sorted(evidence_ids)
            ),
            "affected_taxonomy_ids": ";".join(sorted(taxonomy_ids)),
        }

    staged: list[tuple[int, str, dict[str, str]]] = []

    partial_sources = [
        row
        for row in load_csv(SOURCE_INVENTORY)
        if row["source_system"] == "MyGroundBiz"
        and row["review_status"] == "PARTIALLY_REVIEWED"
    ]
    partial_source_ids = {row["source_id"] for row in partial_sources}
    if partial_source_ids != set(PARTIAL_SOURCE_ORDER):
        raise ValueError(
            "Update PARTIAL_SOURCE_ORDER for the current MyGroundBiz partial-source set: "
            f"missing={sorted(partial_source_ids - set(PARTIAL_SOURCE_ORDER))}, "
            f"stale={sorted(set(PARTIAL_SOURCE_ORDER) - partial_source_ids)}"
        )
    for row in partial_sources:
        is_document = row["source_type"] == "PDF"
        source_id = row["source_id"]
        is_rejected_noncurrent = source_id == "SRC-MGB-DOC-0015"
        staged.append(
            (
                8 if is_rejected_noncurrent else 0,
                f"{PARTIAL_SOURCE_ORDER[source_id]:02d}-{source_id}",
                {
                    "resource_type": (
                        "PARTIAL_SOURCE_DOCUMENT"
                        if is_document
                        else "PARTIAL_SOURCE_PAGE"
                    ),
                    "resource_id": source_id,
                    "title": row["title"],
                    "url": row["url_or_path"],
                    "capture_wave": (
                        "WAVE_5_DEFERRED_NONCURRENT_REFERENCE"
                        if is_rejected_noncurrent
                        else "WAVE_0_PARTIAL_SOURCE_COMPLETION"
                    ),
                    "priority_basis": (
                        "REJECTED_VERSION_AMBIGUOUS_SOURCE; no active knowledge retained; acquire current OP-321 instead and do not continue review unless current authority is established"
                        if is_rejected_noncurrent
                        else "PRIMARY_SOURCE_REVIEW_ALREADY_STARTED; complete the unseen scope before lower-completion resources; existing review limits remain controlling and unseen content is not inferred"
                    ),
                    "related_gap_ids": GAP_LINKED_SOURCES.get(source_id, ""),
                    "candidate_comparison_source_ids": "",
                    "affected_nonverified_knowledge_ids": ";".join(
                        sorted(affected_by_resource[source_id])
                    ),
                    **impact_fields(source_id),
                    "work_state": "PARTIAL_REVIEW_OPEN",
                    "state_basis": "SOURCE_INVENTORY_REVIEW_STATUS=PARTIALLY_REVIEWED",
                    "capture_action": (
                        "NO_FURTHER_REVIEW_UNLESS_CURRENT_AUTHORITY_ESTABLISHED_ACQUIRE_CURRENT_OP321"
                        if is_rejected_noncurrent
                        else
                        "DOWNLOAD_ARCHIVE_HASH_RECORD_PAGE_COUNT_AND_COMPLETE_UNREVIEWED_PAGES"
                        if is_document
                        else "AUTHENTICATED_DURABLE_RECAPTURE_COMPLETE_PAGE_AND_INVENTORY_ALL_LINKED_RESOURCES"
                    ),
                    "completion_gate": (
                        "CURRENT_OP321_ACQUIRED_OR_AUTHORITATIVE_CURRENT_VERSION_ESTABLISHED"
                        if is_rejected_noncurrent
                        else
                        "LOCAL_ARCHIVE_CHECKSUM_ALL_PAGES_REVIEWED_SOURCE_STATUS_FULLY_REVIEWED_AND_NEW_REFERENCES_INVENTORIED"
                        if is_document
                        else "DURABLE_PAGE_CAPTURE_LINK_INVENTORY_SOURCE_STATUS_RECONCILED_AND_REVIEW_COMPLETE"
                    ),
                },
            )
        )

    unreviewed_primary_sources = [
        row
        for row in load_csv(SOURCE_INVENTORY)
        if row["source_system"] == "MyGroundBiz"
        and row["review_status"] == "NOT_YET_REVIEWED"
        and row["access_status"] == "ACCESSIBLE"
    ]
    for row in unreviewed_primary_sources:
        source_id = row["source_id"]
        is_document = row["source_type"] in {"PDF", "downloadable document"}
        is_video = row["source_type"] == "embedded video"
        is_captured = bool(row["local_archive_path"])
        candidate_source_ids = {
            candidate_id
            for candidate_id in filter(None, row["cross_references"].split(";"))
            if candidate_id.startswith("SRC-GDRIVE-")
        }
        staged.append(
            (
                7 if is_video else 1,
                source_id,
                {
                    "resource_type": (
                        "UNREVIEWED_PRIMARY_DOCUMENT"
                        if is_document
                        else (
                            "UNREVIEWED_PRIMARY_VIDEO"
                            if is_video
                            else "UNREVIEWED_PRIMARY_PAGE"
                        )
                    ),
                    "resource_id": source_id,
                    "title": row["title"],
                    "url": row["url_or_path"],
                    "capture_wave": (
                        "WAVE_5_DEFERRED_HISTORICAL_VIDEO_REVIEW"
                        if is_video
                        else "WAVE_0_UNREVIEWED_PRIMARY_ACQUISITION"
                    ),
                    "priority_basis": (
                        "2017_FCC_SYSTEM_TRAINING_VIDEO_DEFERRED_BEHIND_CURRENT_DRIVER_OPERATIONAL_SOURCES; durable bytes remain inventoried and no title or partial visual observation may support driver guidance"
                        if is_captured and is_video
                        else "DURABLE_PRIMARY_SOURCE_BYTES_ARE_HASHED_BUT_CONTENT_IS_NOT_REVIEWED; complete review before knowledge use"
                        if is_captured
                        else "ACCESSIBLE_PRIMARY_SOURCE_IS_INVENTORIED_BUT_NOT_REVIEWED; acquire and completely review it before backlog-only documents; candidate cross-references are comparison targets and do not establish byte identity"
                    ),
                    "related_gap_ids": "",
                    "candidate_comparison_source_ids": ";".join(
                        sorted(candidate_source_ids)
                    ),
                    "affected_nonverified_knowledge_ids": ";".join(
                        sorted(affected_by_resource[source_id])
                    ),
                    **impact_fields(source_id),
                    "work_state": (
                        "UNREVIEWED_PRIMARY_CAPTURED_REVIEW_OPEN"
                        if is_captured
                        else "UNREVIEWED_PRIMARY_OPEN"
                    ),
                    "state_basis": (
                        "SOURCE_INVENTORY_REVIEW_STATUS=NOT_YET_REVIEWED;ACCESS_STATUS=ACCESSIBLE;LOCAL_ARCHIVE_PATH=PRESENT"
                        if is_captured
                        else "SOURCE_INVENTORY_REVIEW_STATUS=NOT_YET_REVIEWED;ACCESS_STATUS=ACCESSIBLE;LOCAL_ARCHIVE_PATH=EMPTY"
                    ),
                    "capture_action": (
                        "TRANSCRIBE_REVIEW_AUDIO_AND_VISUAL_CONTENT_INVENTORY_REFERENCES_AND_CREATE_MAPPINGS"
                        if is_captured and is_video
                        else (
                            "REVIEW_EXISTING_LOCAL_ARCHIVE_AND_RECONCILE_SOURCE_STATUS"
                            if is_captured
                            else (
                                "DOWNLOAD_ARCHIVE_HASH_RECORD_PAGE_COUNT_COMPLETE_REVIEW_AND_COMPARE_CANDIDATE_BYTES"
                                if is_document
                                else "AUTHENTICATED_DURABLE_CAPTURE_COMPLETE_PAGE_AND_COMPLETE_REVIEW"
                            )
                        )
                    ),
                    "completion_gate": (
                        "COMPLETE_AUDIO_VISUAL_REVIEW_SOURCE_STATUS_RECONCILED_AND_NEW_REFERENCES_INVENTORIED"
                        if is_captured and is_video
                        else (
                            "LOCAL_ARCHIVE_CHECKSUM_COMPLETE_REVIEW_REFERENCES_INVENTORIED_AND_SOURCE_STATUS_RECONCILED"
                            if is_captured
                            else (
                                "LOCAL_ARCHIVE_CHECKSUM_ALL_PAGES_REVIEWED_REFERENCES_INVENTORIED_AND_CANDIDATE_IDENTITY_RECONCILED"
                                if is_document
                                else "DURABLE_PAGE_CAPTURE_LINK_INVENTORY_AND_SOURCE_STATUS_RECONCILED"
                            )
                        )
                    ),
                },
            )
        )

    durable_recapture_sources = [
        row
        for row in load_csv(SOURCE_INVENTORY)
        if row["source_system"] == "MyGroundBiz"
        and row["review_status"] == "FULLY_REVIEWED"
        and not row["local_archive_path"]
    ]
    for row in durable_recapture_sources:
        is_document = row["source_type"] == "PDF"
        source_id = row["source_id"]
        staged.append(
            (
                2,
                f"{'00' if is_document else '01'}-{source_id}",
                {
                    "resource_type": (
                        "DURABLE_RECAPTURE_DOCUMENT"
                        if is_document
                        else "DURABLE_RECAPTURE_PAGE"
                    ),
                    "resource_id": source_id,
                    "title": row["title"],
                    "url": row["url_or_path"],
                    "capture_wave": "WAVE_0_DURABLE_RECAPTURE",
                    "priority_basis": "SOURCE_IS_FULLY_REVIEWED_BUT_HAS_NO_DURABLE_LOCAL_CAPTURE; preserve underlying evidence before lower-priority acquisition; existing authority status and mappings remain unchanged until reconciliation",
                    "related_gap_ids": "",
                    "candidate_comparison_source_ids": "",
                    "affected_nonverified_knowledge_ids": ";".join(
                        sorted(affected_by_resource[source_id])
                    ),
                    **impact_fields(source_id),
                    "work_state": "REVIEWED_DURABLE_CAPTURE_OPEN",
                    "state_basis": "SOURCE_INVENTORY_REVIEW_STATUS=FULLY_REVIEWED;LOCAL_ARCHIVE_PATH=EMPTY",
                    "capture_action": (
                        "DOWNLOAD_ARCHIVE_HASH_AND_RECONCILE_REVIEW_ARTIFACT"
                        if is_document
                        else "AUTHENTICATED_DURABLE_CAPTURE_COMPLETE_PAGE_AND_RECONCILE_REVIEW_ARTIFACT"
                    ),
                    "completion_gate": (
                        "LOCAL_ARCHIVE_CHECKSUM_EXISTING_REVIEW_LOCATORS_RECONCILED_AND_SOURCE_STATUS_RECONFIRMED"
                        if is_document
                        else "DURABLE_PAGE_CAPTURE_EXISTING_REVIEW_LOCATORS_RECONCILED_AND_SOURCE_STATUS_RECONFIRMED"
                    ),
                },
            )
        )

    for row in load_csv(SAFETY_BACKLOG):
        staged.append(
            (
                3,
                row["canonical_library_item_id"],
                {
                    "resource_type": "SAFETY_DOCUMENT",
                    "resource_id": row["canonical_library_item_id"],
                    "title": row["title"],
                    "url": row["url"],
                    "capture_wave": "WAVE_1_DIRECT_DOCUMENT_ACQUISITION",
                    "priority_basis": "DIRECT_DOCUMENT_URL_CAPTURED_FROM_EXPANDED_LIBRARY; acquire while authentication is live; title is discovery metadata only",
                    "related_gap_ids": "",
                    "candidate_comparison_source_ids": "",
                    "affected_nonverified_knowledge_ids": ";".join(
                        sorted(affected_by_resource[row["canonical_library_item_id"]])
                    ),
                    **impact_fields(row["canonical_library_item_id"]),
                    "work_state": "UNACQUIRED_OPEN",
                    "state_basis": "SAFETY_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED",
                    "capture_action": "DOWNLOAD_ARCHIVE_HASH_AND_RECORD_PAGE_COUNT",
                    "completion_gate": "PRIMARY_SOURCE_ROW_CHECKSUM_COMPLETE_PAGE_REVIEW_AND_REFERENCE_INVENTORY",
                },
            )
        )

    for row in load_csv(NEWS_ARCHIVE_BACKLOG):
        archive_id = row["archive_id"]
        staged.append(
            (
                4,
                archive_id,
                {
                    "resource_type": "NEWS_ARCHIVE_PAGE",
                    "resource_id": archive_id,
                    "title": row["archive_label"],
                    "url": row["url"],
                    "capture_wave": "WAVE_2_NEWS_ARCHIVE_DISCOVERY",
                    "priority_basis": "EXACT_MONTHLY_ARCHIVE_LINK_CAPTURED_FROM_FULLY_REVIEWED_CUSTOMER_ALERT_PAGE; archive content and child-article relevance remain unassessed; titles are discovery metadata only",
                    "related_gap_ids": "",
                    "candidate_comparison_source_ids": "",
                    "affected_nonverified_knowledge_ids": "",
                    "affected_current_evidence_knowledge_ids": "",
                    "affected_taxonomy_ids": "",
                    "work_state": "UNACQUIRED_OPEN",
                    "state_basis": "NEWS_ARCHIVE_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED",
                    "capture_action": "OPEN_AUTHENTICATED_CAPTURE_COMPLETE_ARCHIVE_PAGE_INVENTORY_ALL_ARTICLES_AND_PAGINATION",
                    "completion_gate": "DURABLE_ARCHIVE_CAPTURE_ALL_ARTICLE_LINKS_INVENTORIED_PAGINATION_EXHAUSTED_AND_REVIEW_STATUS_RECONCILED",
                },
            )
        )

    for row in load_csv(DESTINATION_BACKLOG):
        nav_id = row["nav_id"]
        if nav_id in GAP_LINKED_DESTINATIONS:
            wave = 4
            capture_wave = "WAVE_2_GAP_LINKED_DESTINATIONS"
            basis = "NAVIGATION_TITLE_OR_PATH_INTERSECTS_AN_EXISTING_SOURCE_GAP; content and relevance remain unassessed until review"
            gaps = GAP_LINKED_DESTINATIONS[nav_id]
        elif nav_id in TITLE_SIGNAL_DESTINATIONS:
            wave = 4
            capture_wave = "WAVE_2_GAP_LINKED_DESTINATIONS"
            basis = "NAVIGATION_TITLE_SIGNALS_A_CURRENT_SAFETY_COMPLIANCE_OR_MAINTENANCE_SOURCE; content and relevance remain unassessed until review"
            gaps = ""
        elif row["site_section"] in OPERATIONAL_FAMILY_SECTIONS:
            wave = 5
            capture_wave = "WAVE_3_OPERATIONAL_FAMILY_DESTINATIONS"
            basis = "PORTAL_SECTION_IS_WITHIN_THE_BROAD_OPERATIONAL_INCLUSION_STANDARD; title is not operational evidence"
            gaps = ""
        else:
            wave = 6
            capture_wave = "WAVE_4_REMAINING_DESTINATIONS"
            basis = "PRESERVED_FOR_EXHAUSTIVE_REVIEW_AFTER_HIGHER_SESSION_EFFICIENCY_WAVES; no exclusion or relevance judgment has been made"
            gaps = ""
        staged.append(
            (
                wave,
                nav_id,
                {
                    "resource_type": "DESTINATION_PAGE",
                    "resource_id": nav_id,
                    "title": row["title"],
                    "url": row["url"],
                    "capture_wave": capture_wave,
                    "priority_basis": basis,
                    "related_gap_ids": gaps,
                    "candidate_comparison_source_ids": "",
                    "affected_nonverified_knowledge_ids": ";".join(
                        sorted(affected_by_resource[nav_id])
                    ),
                    **impact_fields(nav_id),
                    "work_state": "UNACQUIRED_OPEN",
                    "state_basis": "DESTINATION_BACKLOG_STATUS=OPEN;SOURCE_INVENTORY_STATUS=NOT_CREATED",
                    "capture_action": "OPEN_AUTHENTICATED_CAPTURE_COMPLETE_PAGE_AND_INVENTORY_ALL_LINKED_RESOURCES",
                    "completion_gate": "DURABLE_PAGE_CAPTURE_PRIMARY_SOURCE_ROW_LINK_INVENTORY_AND_REVIEW_STATUS_RECONCILIATION",
                },
            )
        )

    staged.sort(key=lambda item: (item[0], item[1]))
    rows: list[dict[str, str]] = []
    for order, (_, _, row) in enumerate(staged, 1):
        rows.append({"queue_order": str(order), **row})
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} MyGroundBiz acquisition queue rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
