#!/usr/bin/env python3
"""Build exact source-locator coverage for every referenced-source obligation."""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKLOG_PATH = ROOT / "inventory/referenced_source_backlog.csv"
SOURCE_INVENTORY_PATH = ROOT / "inventory/source_inventory.csv"
OUTPUT_PATH = ROOT / "inventory/referenced_source_occurrences.csv"


LOCATOR_BY_PAIR = {
    ("REFSRC-001", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 1 and 6",
    ("REFSRC-001", "SRC-MGB-PAGE-0009"): "Complete visible ISP Agreement page — sample-version links and executed-agreement limitation",
    ("REFSRC-002", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 39",
    ("REFSRC-003", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 51",
    ("REFSRC-004", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 44 and 47",
    ("REFSRC-005", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 44",
    ("REFSRC-006", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 72, 78, and 81",
    ("REFSRC-006", "SRC-MGB-PAGE-0002"): "Hazmat acceptance, loading, paperwork, and reference-material sections",
    ("REFSRC-007", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 71, 77, and 81",
    ("REFSRC-007", "SRC-MGB-PAGE-0002"): "Hazmat reference-material and Safety Information Guide sections",
    ("REFSRC-007", "SRC-MGB-PAGE-0003"): "Complete visible Safety Information Guide landing page",
    ("REFSRC-008", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 77 and 81",
    ("REFSRC-009", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 84",
    ("REFSRC-009", "SRC-MGB-PAGE-0007"): "Vehicle and package security sections and linked-resource identities",
    ("REFSRC-009", "SRC-MGB-PAGE-0016"): "Complete visible Equipment Terms landing page and current document identities",
    ("REFSRC-010", "SRC-MGB-PAGE-0002"): "Hazmat linked/reference-material section naming SF-034",
    ("REFSRC-011", "SRC-MGB-PAGE-0002"): "Hazmat training, CDL-manual, and regulatory-reference sections",
    ("REFSRC-011", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 73 and 81",
    ("REFSRC-012", "SRC-MGB-PAGE-0002"): "OP-900 tag, shipping-paper/ERG, and loading sections",
    ("REFSRC-012", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 72-73 and 77-80",
    ("REFSRC-013", "SRC-MGB-PAGE-0002"): "P&D manifest, outage-envelope, and facility check-in sections",
    ("REFSRC-013", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 76 and 80",
    ("REFSRC-014", "SRC-MGB-PAGE-0002"): "Pickup acceptance and dangerous-goods certification sections",
    ("REFSRC-015", "SRC-MGB-PAGE-0002"): "Hazardous-material pickup acceptance table and exception references",
    ("REFSRC-016", "SRC-GDRIVE-FILE-0001"): "MGB-119 page 1",
    ("REFSRC-016", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 19, 41, and 46",
    ("REFSRC-017", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 26-27, 35-37, and 42",
    ("REFSRC-017", "SRC-MGB-PAGE-0010"): "Complete OP-201 request-initiation and verification page",
    ("REFSRC-017", "SRC-MGB-PAGE-0011"): "Complete Nov. 17 OP-201 and special-shipper release page",
    ("REFSRC-018", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 23 and 47",
    ("REFSRC-019", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 45",
    ("REFSRC-020", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 80",
    ("REFSRC-021", "SRC-MGB-PAGE-0017"): "Trailer and Dolly Coupling page — manufacturer-specific linked PDFs/videos",
    ("REFSRC-022", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 1-5 and version-sensitive UI sections",
    ("REFSRC-022", "SRC-GDRIVE-FILE-0009"): "FORGE Quick Start Guide pages 1-8 (FORGE 1.0.0)",
    ("REFSRC-022", "SRC-GDRIVE-FILE-0010"): "FORGE Settings guide pages 1-6 (FORGE 2.0.0)",
    ("REFSRC-023", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 202-223 — embedded drop-box guide links and configuration paths",
    ("REFSRC-023", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 56-64",
    ("REFSRC-024", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 40",
    ("REFSRC-025", "SRC-GDRIVE-FILE-0003"): "Driver Scenarios workbook row 41",
    ("REFSRC-026", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 86-91",
    ("REFSRC-027", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 97-101",
    ("REFSRC-028", "SRC-GDRIVE-FILE-0016"): "Personnel Qualification Verification Flow, full page — First Advantage Documentation & Resources reference",
    ("REFSRC-028", "SRC-MGB-PAGE-0004"): "Complete visible P&D qualification-certification page and linked-resource context",
    ("REFSRC-028", "SRC-MGB-PAGE-0005"): "Complete visible Qualification Certification page — linked FAQ and forms",
    ("REFSRC-028", "SRC-MGB-PAGE-0039"): "Complete visible P&D road-test page — linked Qualification Conditions and Qualified Provider-supplied Record of Road Test",
    ("REFSRC-029", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 40 — Status Code 006 definition",
    ("REFSRC-030", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 39-43 — delivery-status table and definition-only entries",
    ("REFSRC-031", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 73 and 81",
    ("REFSRC-031", "SRC-MGB-PAGE-0002"): "Shipping-paper/ERG placement and leaking-package response sections",
    ("REFSRC-032", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 80",
    ("REFSRC-033", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide page 26",
    ("REFSRC-034", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 186-188",
    ("REFSRC-035", "SRC-GDRIVE-FILE-0002"): "OP-119 page 5",
    ("REFSRC-036", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 page 14",
    ("REFSRC-036", "SRC-GDRIVE-FILE-0002"): "OP-119 page 13",
    ("REFSRC-037", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 47-48 and 68-69",
    ("REFSRC-037", "SRC-GDRIVE-FILE-0002"): "OP-119 pages 4-5",
    ("REFSRC-038", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 104-106",
    ("REFSRC-039", "SRC-GDRIVE-FILE-0008"): "FORGE 2.8.0 Application Guide pages 107-109",
    ("REFSRC-040", "SRC-MGB-PAGE-0034"): "Complete visible page — See more information about this option: Technical guides on MBA",
    ("REFSRC-041", "SRC-GDRIVE-FILE-0003"): "Driver Scenarios workbook rows 24-32 — cited pages 54, 57-58, 79, 121-122, and 163-167",
    ("REFSRC-042", "SRC-GDRIVE-FILE-0003"): "Driver Scenarios workbook rows 33-37 and 41 — cited Company Safety and Operation Handbook sections",
    ("REFSRC-043", "SRC-GDRIVE-FILE-0014"): "OP-117 v2 pages 19, 36, and 40 — code 004, door-tag handling, and package-notation fields; crossing and SID-removal authority remains unresolved",
}


FIELDS = [
    "occurrence_id",
    "backlog_id",
    "reference_identity",
    "origin_source_id",
    "origin_source_title",
    "exact_locator",
    "reference_basis",
    "acquisition_status",
    "review_status",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build_rows() -> list[dict[str, str]]:
    backlog = load_csv(BACKLOG_PATH)
    sources = {row["source_id"]: row for row in load_csv(SOURCE_INVENTORY_PATH)}
    rows: list[dict[str, str]] = []
    expected_pairs: set[tuple[str, str]] = set()

    for backlog_row in backlog:
        reference_identity = (
            backlog_row["source_identifier"] or backlog_row["title_or_description"]
        )
        for source_id in backlog_row["origin_source_ids"].split(";"):
            pair = (backlog_row["backlog_id"], source_id)
            expected_pairs.add(pair)
            if pair not in LOCATOR_BY_PAIR:
                raise ValueError(f"missing exact locator for {pair}")
            if source_id not in sources:
                raise ValueError(f"unknown origin source {source_id} for {pair}")
            if sources[source_id]["review_status"] not in {
                "FULLY_REVIEWED",
                "PARTIALLY_REVIEWED",
            }:
                raise ValueError(
                    f"origin source is not reviewed for {pair}: "
                    f"{sources[source_id]['review_status']}"
                )
            rows.append(
                {
                    "occurrence_id": f"REFSRC-OCC-{len(rows) + 1:04d}",
                    "backlog_id": backlog_row["backlog_id"],
                    "reference_identity": reference_identity,
                    "origin_source_id": source_id,
                    "origin_source_title": sources[source_id]["title"],
                    "exact_locator": LOCATOR_BY_PAIR[pair],
                    "reference_basis": backlog_row["reason_required"],
                    "acquisition_status": backlog_row["acquisition_status"],
                    "review_status": backlog_row["review_status"],
                }
            )

    extra_pairs = set(LOCATOR_BY_PAIR) - expected_pairs
    if extra_pairs:
        raise ValueError(f"stale exact locators: {sorted(extra_pairs)}")
    return rows


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} referenced-source occurrence rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
