#!/usr/bin/env python3
"""Build exact page-level coverage for the 89-page OP-117 v2 source."""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ID = "SRC-GDRIVE-FILE-0014"
PAGE_COUNT = 89
OUTPUT = ROOT / "knowledge/op117_page_coverage.csv"

FIELDS = [
    "page", "section_or_subject", "coverage_disposition", "knowledge_ids",
    "reference_record_count", "artifact_ids", "coverage_basis", "required_follow_up",
]

SUBJECT_RANGES = [
    (1, 1, "Authority, confidentiality, and controlling-agreement notice"),
    (2, 5, "Table of contents"),
    (6, 7, "Ethics, accidents, injuries, preservation, DOT, and vehicle safety"),
    (8, 10, "Hours of service, short-haul, and operating exceptions"),
    (11, 11, "FORGE user types, support, and scan deletion"),
    (12, 16, "Signature services, restricted commodities, premium services, and tracking devices"),
    (17, 18, "Residential and commercial classification"),
    (19, 25, "Door tags, indirect delivery, OP-206, SRA, and electronic signatures"),
    (26, 28, "Business, residential, and shipper-authorized release"),
    (29, 35, "Lockers, secure placement, PPOD, ASR contingency, and no-safe-place handling"),
    (36, 39, "Delivery status-code reference"),
    (40, 41, "Package notation, delivery disputes, and customer expectations"),
    (42, 45, "HAL and SenseAware delivery"),
    (46, 47, "Barcode, address, retry, damage-comment, and signature-device exceptions"),
    (48, 55, "Pickup listing, reconciliation, reason codes, call tags, and SenseAware pickup"),
    (56, 64, "Drop-box pickup, connection fallbacks, settings, holiday, and early pickup"),
    (65, 71, "CXPC, pickup exceptions, combo stops, capacity, and geographic restrictions"),
    (72, 73, "Hazmat acceptance and transport"),
    (74, 74, "Hazardous-materials section divider"),
    (75, 80, "Hazmat certification, custody, manifest, delivery, and emergency response"),
    (81, 87, "Relay, badges, vehicles, security, threats, theft, and incident reporting"),
    (88, 88, "Common package-label visual reference"),
    (89, 89, "Common package-label visual reference and blank local-contact table"),
]


def subject_for(page: int) -> str:
    for start, end, subject in SUBJECT_RANGES:
        if start <= page <= end:
            return subject
    raise ValueError(f"missing subject for page {page}")


def pages_from_locator(locator: str) -> set[int]:
    """Extract OP-117 page numbers/ranges without treating a version as a page."""
    match = re.search(r"\bpages?\s+(.+)$", locator, flags=re.IGNORECASE)
    if not match:
        return set()
    page_spec = match.group(1).replace(" and ", ", ")
    pages: set[int] = set()
    for start_text, end_text in re.findall(r"\b(\d{1,2})(?:\s*-\s*(\d{1,2}))?\b", page_spec):
        start = int(start_text)
        end = int(end_text) if end_text else start
        if 1 <= start <= end <= PAGE_COUNT:
            pages.update(range(start, end + 1))
    return pages


def build_rows() -> list[dict[str, str]]:
    knowledge_by_page: dict[int, set[str]] = defaultdict(set)
    with (ROOT / "knowledge/source_to_knowledge.csv").open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["source_id"] == SOURCE_ID:
                for page in pages_from_locator(row["locator"]):
                    knowledge_by_page[page].add(row["knowledge_id"])

    references_by_page: dict[int, int] = defaultdict(int)
    for raw in (ROOT / "knowledge/status_codes.jsonl").read_text(encoding="utf-8").splitlines():
        if raw.strip():
            row = json.loads(raw)
            if row.get("source_id") == SOURCE_ID:
                for page in pages_from_locator(row.get("locator", "")):
                    references_by_page[page] += 1

    rows: list[dict[str, str]] = []
    for page in range(1, PAGE_COUNT + 1):
        knowledge_ids = sorted(knowledge_by_page[page])
        reference_count = references_by_page[page]
        artifact_ids: list[str] = []
        follow_up = ""
        if page == 1:
            disposition = "GOVERNING_FRONT_MATTER"
            basis = "Source authority, confidentiality, and controlling-agreement context; not a standalone driver procedure."
        elif 2 <= page <= 5:
            disposition = "TABLE_OF_CONTENTS"
            basis = "Navigation/front matter only; substantive sections are audited on their content pages."
        elif page == 74:
            disposition = "SECTION_DIVIDER"
            basis = "Hazardous-materials title/divider page with no independent operational instruction."
        elif page == 88:
            disposition = "VISUAL_REFERENCE_ONLY"
            basis = "Image-heavy examples of common label formats; no explicit operational instruction is stated."
        elif page == 89:
            disposition = "LOCAL_CONTACT_TEMPLATE_TRACKED"
            artifact_ids = ["ART-DOC-003"]
            basis = "Label examples plus a blank local-contact template are tracked as a configurable artifact, not populated approved guidance."
            follow_up = "Authorized local owners must populate and maintain current contacts outside the shared authoritative corpus."
        elif knowledge_ids and reference_count:
            disposition = "KNOWLEDGE_AND_REFERENCE_MAPPED"
            basis = "Mapped to operational knowledge and normalized status-code reference rows."
        elif knowledge_ids:
            disposition = "KNOWLEDGE_MAPPED"
            basis = "Mapped to one or more authoritative operational knowledge records."
        elif reference_count:
            disposition = "REFERENCE_DATA_MODELED"
            basis = "Normalized in the status-code reference dataset; not every code independently establishes a complete procedure."
        else:
            disposition = "UNRECONCILED"
            basis = "No page-level knowledge, reference-data, artifact, or non-operational disposition was found."
            follow_up = "Review the rendered page and source text; map or explicitly classify it."
        rows.append({
            "page": str(page), "section_or_subject": subject_for(page),
            "coverage_disposition": disposition, "knowledge_ids": ";".join(knowledge_ids),
            "reference_record_count": str(reference_count), "artifact_ids": ";".join(artifact_ids),
            "coverage_basis": basis, "required_follow_up": follow_up,
        })
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} OP-117 page-coverage rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
