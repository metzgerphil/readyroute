#!/usr/bin/env python3
"""Build the one-row-per-source knowledge-coverage reconciliation ledger."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "inventory/source_knowledge_coverage.csv"

FIELDS = [
    "source_id",
    "title",
    "review_status",
    "relevance_status",
    "mapping_rows",
    "mapped_knowledge_count",
    "mapped_knowledge_ids",
    "coverage_disposition",
    "coverage_basis",
    "required_follow_up",
]


ZERO_COVERAGE_OVERRIDES = {
    "SRC-GDRIVE-ROOT-0001": (
        "INACCESSIBLE",
        "The connected Drive account returns zero children for the exact folder URL and no folder result for a Chat Bot search; the browser-acquired ZIP/direct-file snapshot is inventoried separately.",
        "Retry connector/API identity verification if access changes; do not infer missing folder contents.",
    ),
    "SRC-GDRIVE-BROWSER-ROOT-0001": (
        "REVIEWED_CONTAINER_CHILDREN_CARRY_EVIDENCE",
        "This is the reviewed folder container; its 17 direct child files carry substantive evidence and mappings.",
        "Reconcile any future visible child against the inventory and archive before extraction.",
    ),
    "SRC-GDRIVE-FILE-0003": (
        "SECONDARY_REFERENCE_NO_AUTHORITY",
        "The 78-row workbook is fully reviewed but remains a secondary scenario/reference source; unsupported proposed answers are excluded from authoritative evidence.",
        "Use its scenarios only for adversarial gap discovery until each claim has an authoritative primary source.",
    ),
    "SRC-MGB-ROOT-0001": (
        "PARTIAL_CONTAINER_REVIEW",
        "The authenticated home/navigation container was mapped, but destination, search, news, video, and linked-resource review remains incomplete.",
        "Resume authenticated destination and child-resource acquisition.",
    ),
    "SRC-MGB-PAGE-0001": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The complete landing page and all visible links are durably captured and reviewed; the exact five portal-download copies remain unreviewed and are not byte-reconciled to Drive files.",
        "Acquire and hash the five current portal downloads before declaring identity or supersession.",
    ),
    "SRC-MGB-PAGE-0003": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The landing page is fully reviewed, but the current Safety Information Guide is hosted in MyBizAccount and remains unacquired.",
        "Acquire and fully review current SF-920P.",
    ),
    "SRC-MGB-PAGE-0008": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The complete page and all visible resources are durably captured and reviewed; it functions as a pickup-resource index and does not itself establish the linked procedures.",
        "Acquire and review the eleven linked documents and six embedded videos before using their procedures or status-code guidance.",
    ),
    "SRC-MGB-PAGE-0009": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The ISP Agreement landing/version page is reviewed; the sample child is partial and cannot substitute for the executed negotiated agreement.",
        "Fully review the sample for context and acquire the executed ISP Agreement and schedules for controlling obligations.",
    ),
    "SRC-MGB-DOC-0009": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "Only the first page/identity of the official 89-page sample 2026 ISP Agreement is reviewed.",
        "Acquire or navigate and review all 89 pages; preserve that a sample does not establish negotiated terms.",
    ),
    "SRC-MGB-PAGE-0012": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The Safety and Compliance Program Resources landing page is reviewed, but its substantive linked PDFs remain separate unacquired sources.",
        "Inventory, acquire, and review every reasonably driver-relevant child resource.",
    ),
    "SRC-MGB-PAGE-0013": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The Safety Topic Library index and all 77 displayed listings are inventoried; 73 unique child documents remain unacquired and Dog Bite Prevention is fully reviewed from seven hashed rendered pages.",
        "Acquire and review every unique child document, preserving duplicate URL relationships and dates.",
    ),
    "SRC-MGB-PAGE-0015": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The complete 2021 Unsafe Driving page is durably captured and reviewed; it supplies high-level violation examples but no distinct operational procedure beyond the broader 2025 CSA/DOT parent page.",
        "Retain as contextual evidence and reassess only if the source is updated or a more specific current procedure is acquired.",
    ),
    "SRC-MGB-PAGE-0016": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The Equipment Terms landing page is reviewed; current linked equipment documents remain separate acquisition/review targets.",
        "Acquire and review every applicable equipment term/specification source before operational use.",
    ),
    "SRC-MGB-DOC-0010": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "Only page 1 of the five-page Independent Service Provider Agreement Equipment Terms document is reviewed.",
        "Acquire or navigate and review pages 2-5; do not infer unseen equipment requirements.",
    ),
    "SRC-MGB-DOC-0011": (
        "REVIEWED_OPERATIONAL_MAPPING_EXPECTED",
        "All seven Dog Bite Prevention pages are reviewed from hashed renders and should retain their exact operational mapping.",
        "Preserve the mapping and acquire original PDF bytes for byte identity.",
    ),
    "SRC-MGB-DOC-0015": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "The source was rejected for current operational extraction because the viewer title identifies 2017 while the portal path suggests 2023; no code or procedure is retained in the active reference layer.",
        "Acquire current OP-321. Do not spend further review time on this source unless an authoritative current version is established.",
    ),
    "SRC-MGB-PAGE-0023": (
        "REVIEWED_CUSTOMER_ALERT_LAYER_CARRIES_EVIDENCE",
        "All 138 alert segments in the durable page capture are reviewed and represented in the separate customer-alert operational and source-mapping layers; general-record mappings remain intentionally separate.",
        "Revalidate the page when it changes and complete the independently inventoried linked child-source acquisitions.",
    ),
    "SRC-MGB-PAGE-0024": (
        "REVIEWED_REDIRECT_TARGET_CARRIES_EVIDENCE",
        "The authenticated Customer Alerts navigation URL redirects to SRC-MGB-PAGE-0023 and exposes no separate operational content.",
        "Revalidate SRC-MGB-PAGE-0023 when its page version changes and continue linked child-source acquisition.",
    ),
    "SRC-MGB-PAGE-0033": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The complete SRS/SRI page defines business-level rolling safety indicators but does not establish an individual driver action or response procedure.",
        "Acquire and review the linked FAQs for completeness; retain the landing page as contextual safety-performance evidence unless a distinct procedure is established.",
    ),
    "SRC-MGB-PAGE-0040": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The complete Linehaul driving-standards page provides program and qualified-school context but delegates substantive checklist, FAQ, form, school-qualification, and current-school details to five linked documents.",
        "Acquire and review all five linked resources before modeling ELDP or school-selection procedures.",
    ),
    "SRC-MGB-PAGE-0041": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The complete Alternative Vehicle Insurance FAQ provides contractor liability, insurance, workers-compensation, indemnification, and training-program context but does not establish a source-complete driver action procedure and explicitly disclaims personalized coverage advice.",
        "Retain as legal/insurance context; obtain current legal/compliance review before any product presentation beyond source-traceable contractor context.",
    ),
}


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def build_rows() -> list[dict[str, str]]:
    inventory = load_csv(ROOT / "inventory/source_inventory.csv")
    mappings = load_csv(ROOT / "knowledge/source_to_knowledge.csv")
    mapping_knowledge: dict[str, list[str]] = defaultdict(list)
    for row in mappings:
        mapping_knowledge[row["source_id"]].append(row["knowledge_id"])

    result: list[dict[str, str]] = []
    for source in inventory:
        source_id = source["source_id"]
        mapped_ids = sorted(set(mapping_knowledge[source_id]))
        mapping_rows = len(mapping_knowledge[source_id])
        if mapping_rows:
            if source["review_status"] == "PARTIALLY_REVIEWED":
                disposition = "MAPPED_PARTIAL_SOURCE_SCOPE"
                basis = (
                    f"{mapping_rows} exact mapping row(s) support {len(mapped_ids)} knowledge record(s), "
                    "limited to the reviewed portion identified in the evidence locator."
                )
                follow_up = "Complete the remaining source review before using any unseen section or claiming full-source extraction."
            else:
                disposition = "MAPPED_OPERATIONAL_EVIDENCE"
                basis = (
                    f"{mapping_rows} exact mapping row(s) support {len(mapped_ids)} knowledge record(s) "
                    "from reviewed source content."
                )
                follow_up = "Reconcile open referenced-source obligations and reassess when a newer source version is acquired."
        elif source_id in ZERO_COVERAGE_OVERRIDES:
            disposition, basis, follow_up = ZERO_COVERAGE_OVERRIDES[source_id]
        elif source["review_status"] == "NOT_YET_REVIEWED":
            disposition = "NOT_YET_REVIEWED"
            basis = "No operational evidence mapping is permitted because this source has not been reviewed."
            follow_up = "Acquire/review the exact source and create evidence mappings only for source-established knowledge."
        elif source["review_status"] == "INACCESSIBLE":
            disposition = "INACCESSIBLE"
            basis = (
                source["interpretation_limits"]
                or "The source is inaccessible and cannot support an operational evidence mapping."
            )
            follow_up = (
                source["review_notes"]
                or "Obtain an accessible authoritative replacement before extracting knowledge."
            )
        else:
            raise ValueError(
                f"{source_id} has zero mappings and no explicit coverage disposition"
            )

        result.append(
            {
                "source_id": source_id,
                "title": source["title"],
                "review_status": source["review_status"],
                "relevance_status": source["relevance_status"],
                "mapping_rows": str(mapping_rows),
                "mapped_knowledge_count": str(len(mapped_ids)),
                "mapped_knowledge_ids": ";".join(mapped_ids),
                "coverage_disposition": disposition,
                "coverage_basis": basis,
                "required_follow_up": follow_up,
            }
        )
    return result


def main() -> int:
    rows = build_rows()
    with OUTPUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} source-knowledge coverage rows to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
