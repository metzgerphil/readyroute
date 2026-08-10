#!/usr/bin/env python3
"""Build exact page-level coverage for the 246-page FORGE 2.8.0 guide."""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_ID = "SRC-GDRIVE-FILE-0008"
PAGE_COUNT = 246
OUTPUT = ROOT / "knowledge/forge_page_coverage.csv"
FIELDS = ["page", "section_or_subject", "coverage_disposition", "knowledge_ids", "coverage_basis", "required_follow_up"]

SUBJECT_RANGES = [
    (1, 1, "Identity, version, authority, and application-scope notice"),
    (2, 4, "Table of contents"),
    (5, 7, "Multicode barcode, user type, and vehicle type guidance"),
    (8, 22, "First launch, authentication, assignment, vehicle, duty, manifest, and dispatch"),
    (23, 27, "FORGE UI, language, premium-service icons, and general icons"),
    (28, 42, "Listed delivery, listed pickup, and unmanifested delivery"),
    (43, 48, "Unlisted retail pickup"),
    (49, 58, "Stop-level and package-level delivery status scope"),
    (59, 61, "Zero-package pickup"),
    (62, 72, "Misdelivery pickup and same-day redelivery"),
    (73, 85, "Indirect, residential, and business release"),
    (86, 91, "International pickup documents"),
    (92, 96, "Adult Signature Required delivery"),
    (97, 103, "COD and SenseAware delivery"),
    (104, 109, "Pharmacy and critical-healthcare delivery"),
    (110, 116, "HAL transfer and hazmat delivery"),
    (117, 134, "Unlisted hazmat, call-tag, and SenseAware pickup"),
    (135, 142, "Bulk delivery and pickup"),
    (143, 169, "Combine, split, revisit, and merge stop workflows"),
    (170, 177, "Package and stop comments"),
    (178, 188, "Manual barcode, address, scan deletion, and alternate signature"),
    (189, 201, "End of day, listing/manifest download, and refresh"),
    (202, 223, "Drop-box connection and configuration"),
    (224, 232, "Bulk transfer, vehicle change, DVIR, and synchronization"),
    (233, 239, "Camera scan, navigation, reminders, and messages"),
    (240, 246, "Demo fixtures, validation warnings, and device information"),
]


def subject_for(page: int) -> str:
    for start, end, subject in SUBJECT_RANGES:
        if start <= page <= end:
            return subject
    raise ValueError(f"missing subject for page {page}")


def pages_from_locator(locator: str) -> set[int]:
    match = re.search(r"\bpages?\s+(.+)$", locator, flags=re.IGNORECASE)
    if not match:
        return set()
    spec = match.group(1).replace(" and ", ", ")
    pages: set[int] = set()
    for start_text, end_text in re.findall(r"\b(\d{1,3})(?:\s*-\s*(\d{1,3}))?\b", spec):
        start = int(start_text); end = int(end_text) if end_text else start
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

    explicit = {
        1: ("GOVERNING_FRONT_MATTER", "Document identity, version, confidentiality, demo scope, and cross-version warning; not an operational procedure."),
        2: ("TABLE_OF_CONTENTS", "Navigation/front matter only."),
        3: ("TABLE_OF_CONTENTS", "Navigation/front matter only."),
        4: ("TABLE_OF_CONTENTS", "Navigation/front matter only."),
        23: ("UI_SCREEN_REFERENCE", "Annotated Stop List screen reference; no independent procedure."),
        24: ("UI_SCREEN_REFERENCE", "Annotated Stop Details screen reference; no independent procedure."),
        27: ("ICON_GLOSSARY_REFERENCE", "General icon glossary; operational uses are mapped on their workflow pages."),
        79: ("UI_SCREEN_REFERENCE", "Intermediate residential release screen showing the locker-number prompt and SKIP control; it does not independently establish locker eligibility, when omission is authorized, or PPOD content requirements."),
        80: ("UI_SCREEN_REFERENCE", "Intermediate residential release screen showing an optional door-tag scan for non-Other release selections; current door-tag requirements are established by mapped OP-117 procedures."),
        93: ("UI_SCREEN_REFERENCE", "Intermediate ASR time-definite and Stop Details screens; the page adds no independent ASR rule beyond the mapped eligibility and completion pages."),
        235: ("NAVIGATION_REFERENCE", "Shows map-entry buttons and icon meanings; does not establish routing or safe-driving policy."),
        240: ("DEMO_FIXTURE_REFERENCE", "Demonstration-login barcode fixtures only; not production package data or a procedure."),
        241: ("DEMO_FIXTURE_REFERENCE", "Demonstration pickup barcode fixtures only; not production package data or a procedure."),
    }
    rows: list[dict[str, str]] = []
    for page in range(1, PAGE_COUNT + 1):
        ids = sorted(knowledge_by_page[page])
        if page in explicit:
            disposition, basis = explicit[page]
            follow_up = ""
        elif ids:
            disposition = "KNOWLEDGE_MAPPED"
            basis = "Mapped to one or more operational knowledge records with exact source evidence."
            follow_up = ""
        else:
            disposition = "UNRECONCILED"
            basis = "No knowledge mapping or explicit reference/front-matter disposition was found."
            follow_up = "Review the page and map or explicitly classify it."
        rows.append({"page": str(page), "section_or_subject": subject_for(page), "coverage_disposition": disposition, "knowledge_ids": ";".join(ids), "coverage_basis": basis, "required_follow_up": follow_up})
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader(); writer.writerows(rows)
    print(f"wrote {len(rows)} FORGE page-coverage rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
