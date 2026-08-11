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
    **{
        source_id: (
            "REVIEWED_HISTORICAL_CONTEXT_NEWER_SOURCE_CONTROLS",
            "The complete checksum-preserved 2017 FCC video was reviewed through its full audio track and time-addressed visual sequence. It demonstrates a historical business-management interface and does not establish a distinct current driver-facing procedure.",
            "Retain the transcript, visual aids, and original MP4 for audit history; use newer applicable OP-117/FORGE material and preserve unresolved current authority or workflow gaps.",
        )
        for source_id in (
            "SRC-MGB-VIDEO-0001",
            "SRC-MGB-VIDEO-0002",
            "SRC-MGB-VIDEO-0003",
            "SRC-MGB-VIDEO-0004",
            "SRC-MGB-VIDEO-0005",
            "SRC-MGB-VIDEO-0006",
        )
    },
    "SRC-GDRIVE-ROOT-0001": (
        "REVIEWED_CONTAINER_CHILDREN_CARRY_EVIDENCE",
        "The restored connector resolves the exact Chat Bot folder and 37 direct files. Complete raw-byte hashing yields 33 unique byte objects, all present in the registered archive; substantive evidence remains mapped on the reviewed child source records.",
        "Repeat provider metadata and raw-byte reconciliation when the folder modified time changes or new uploads are expected.",
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
    "SRC-GDRIVE-FILE-0017": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The preserved August 2026 FAD announcement screenshot described Ground availability as future; the later fully reviewed FORGE 3.3 guide now controls the active conditional Ground workflow.",
        "Retain for version history and reassess only if a new authoritative source materially conflicts with the current guide.",
    ),
    "SRC-MGB-ROOT-0001": (
        "PARTIAL_CONTAINER_REVIEW",
        "The authenticated home/navigation container was mapped, but destination, search, news, video, and linked-resource review remains incomplete.",
        "Resume authenticated destination and child-resource acquisition.",
    ),
    "SRC-MGB-PAGE-0001": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The complete landing page and all visible links are durably captured and reviewed; all five portal-download copies are now archived and fully reviewed or byte-reconciled to the supplied Drive copies.",
        "Revalidate the landing page and child versions when MyGroundBiz publishes a newer applicable edition.",
    ),
    "SRC-MGB-PAGE-0003": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The landing page is fully reviewed, but the current Safety Information Guide is hosted in MyBizAccount and remains unacquired.",
        "Acquire and fully review current SF-920P.",
    ),
    "SRC-MGB-PAGE-0008": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The complete page and all visible resources are durably captured and reviewed; it functions as a pickup-resource index and does not itself establish the linked procedures. The newly supplied mainstream pickup references are fully reviewed, while other linked resources remain queued.",
        "Continue acquisition of remaining current linked sources; use newer OP-117/FORGE content over older CPC/STAR-era material.",
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
        "The Safety Topic Library index and all 77 displayed listings are inventoried; Dog Bite Prevention is fully reviewed from its original seven-page PDF and the other unique child documents remain separate acquisition targets.",
        "Acquire and review the remaining unique child documents by mainstream driver and safety priority, preserving duplicate URL relationships and dates.",
    ),
    "SRC-MGB-PAGE-0015": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The complete 2021 Unsafe Driving page is durably captured and reviewed; it supplies high-level violation examples but no distinct operational procedure beyond the broader 2025 CSA/DOT parent page.",
        "Retain as contextual evidence and reassess only if the source is updated or a more specific current procedure is acquired.",
    ),
    "SRC-MGB-PAGE-0016": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The Equipment Terms landing page is reviewed; the current November 2025 equipment terms and January 2026 appearance FAQ are fully reviewed original PDFs, while other linked specifications remain separate targets.",
        "Acquire and review remaining applicable equipment specifications before operational use; preserve contractor-control versus driver-procedure boundaries.",
    ),
    "SRC-MGB-PAGE-0018": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The reviewed August 2026 FAD announcement is historical launch context; the later fully reviewed FORGE 3.3 guide now supplies the active conditional Ground procedure.",
        "Retain the announcement and its captures for audit history; use current authoritative application guidance for active procedure.",
    ),
    "SRC-MGB-DOC-0010": (
        "REVIEWED_CONTEXT_NO_DISTINCT_DRIVER_PROCEDURE",
        "All five pages of the original November 2025 equipment terms are archived and fully reviewed; they establish contractor vehicle-configuration, safety, appearance, security, and documentation controls rather than a complete driver-at-stop procedure.",
        "Retain as current equipment/compliance context and use only source-specific requirements within their applicability; do not infer state-specific or in-route procedures.",
    ),
    "SRC-MGB-DOC-0011": (
        "REVIEWED_OPERATIONAL_MAPPING_EXPECTED",
        "All seven Dog Bite Prevention pages are reviewed from the archived original PDF and retain their exact operational mapping.",
        "Preserve the mapping and revalidate if a newer applicable safety topic is published.",
    ),
    "SRC-MGB-DOC-0015": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "The source was rejected for current operational extraction because the viewer title identifies 2017 while the portal path suggests 2023; no code or procedure is retained in the active reference layer.",
        "Acquire current OP-321. Do not spend further review time on this source unless an authoritative current version is established.",
    ),
    "SRC-MGB-DOC-0024": (
        "REVIEWED_CONTEXT_NO_DISTINCT_DRIVER_PROCEDURE",
        "All eight pages of the original SRS/SRI FAQ are archived and fully reviewed; they establish business-level safety-result metrics rather than an individual driver procedure. The April 2026 portal filename and August 2025 PDF footer discrepancy is preserved.",
        "Retain as management and safety-performance context; do not use it independently for a driver accident, inspection, maintenance, or response instruction.",
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
    "SRC-MGB-PAGE-0044": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The current On Road landing page establishes portal identities and version context but delegates operational content to linked guides and references.",
        "Preserve the current link identities and review each linked source independently; do not treat the index as procedural evidence.",
    ),
    "SRC-MGB-PAGE-0045": (
        "REVIEWED_LANDING_CHILDREN_PENDING",
        "The current maintenance article identifies three forms/guides and their MyBizAccount location but does not expose their substantive contents.",
        "Acquire MGBA-355, MGBA-357, and MGBA-356 through authorized MyBizAccount access before extracting requirements.",
    ),
    "SRC-MGB-PAGE-0046": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The current Iowa ELP article states qualification categories, carrier penalties, and a management assessment recommendation but no in-route driver procedure.",
        "Retain as qualification and safety context; acquire controlling legal/regulatory material if a definitive compliance workflow is required.",
    ),
    "SRC-MGB-PAGE-0047": (
        "REVIEWED_CONTEXT_NO_DISTINCT_PROCEDURE",
        "The current Micron alert is customer-specific and time-sensitive; its general statements do not replace controlling canonical signature, release, tracking, or status-code procedures.",
        "Retain for source completeness and reassess only within the customer-alert layer or when controlling material changes.",
    ),
    "SRC-MGB-DOC-0040": (
        "REVIEWED_CONTEXT_NO_DISTINCT_DRIVER_PROCEDURE",
        "Both pages of the original January 2026 Vehicle Appearance and Brand Promotion FAQ are archived and fully reviewed; the FAQ establishes contractor branding, decal, and business-name responsibilities rather than a driver-at-stop procedure.",
        "Retain as vehicle-administration context and revalidate if a newer applicable FAQ is published.",
    ),
    "SRC-MGB-DOC-0001": (
        "REVIEWED_RENDER_IDENTICAL_MAPPING_ON_SUPPLIED_SOURCE",
        "All 89 pages of the authenticated portal OP-117 render identically to fully reviewed and mapped SRC-GDRIVE-FILE-0014, although the PDF bytes differ.",
        "Preserve both originals and keep operational mappings on the supplied source unless the source model is deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0002": (
        "REVIEWED_EXACT_DUPLICATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated portal download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0002.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0003": (
        "REVIEWED_EXACT_DUPLICATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated portal download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0001.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0004": (
        "REVIEWED_EXACT_DUPLICATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated portal download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0004.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless the source model is deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0005": (
        "REVIEWED_EXACT_DUPLICATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated portal download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0015.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless the source model is deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0013": (
        "REVIEWED_HISTORICAL_CONTEXT_NEWER_SOURCE_CONTROLS",
        "All 40 pages of the October 2021 pickup familiarization notes are archived and fully reviewed; the STAR-era interface and workflows predate current OP-117 and FORGE guidance.",
        "Retain as historical/corroborative context only; do not override newer applicable material or treat unresolved pickup-offer decline criteria as resolved.",
    ),
    "SRC-MGB-DOC-0014": (
        "REVIEWED_HISTORICAL_CONTEXT_NEWER_SOURCE_CONTROLS",
        "The complete October 2020 pickup-service-obligations quick reference is archived and reviewed; it predates current OP-117 and FORGE guidance.",
        "Retain as historical corroboration of pickup listing/window and reason-code accuracy; use newer applicable material for current procedures.",
    ),
    "SRC-MGB-DOC-0016": (
        "REVIEWED_CORROBORATIVE_CONTEXT_NEWER_SOURCE_CONTROLS",
        "All three pages of the 2023 FCC/CPC facts document are archived and reviewed; it predates current OP-117/FORGE guidance and does not define every current authority limit.",
        "Retain as corroborative coordination context; use newer applicable material for definitive current procedures.",
    ),
    "SRC-MGB-DOC-0020": (
        "REVIEWED_VERSION_SENSITIVE_PENDING_CURRENT_CONFIRMATION",
        "All three pages and both branches of the 2023 same-pickup-ID FORGE workflow are archived and reviewed, but current FORGE 3.3 confirmation is not yet complete.",
        "Preserve as review evidence and confirm the feature against the current 3.3 guide before definitive publication.",
    ),
    "SRC-MGB-PAGE-0048": (
        "REVIEWED_INDEX_CHILDREN_PENDING",
        "The current FORGE hub establishes child-document identities and dates but does not itself establish the linked procedures.",
        "Complete the current 3.3 combined guide and mainstream quick-reference reviews; treat older 3.2 content as comparison evidence only where 3.3 applies.",
    ),
    "SRC-MGB-DOC-0041": (
        "REVIEWED_DUPLICATE_CANDIDATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0007.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless the source model is deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0043": (
        "REVIEWED_DUPLICATE_CANDIDATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0006.",
        "Retain duplicate identity and current portal location; keep operational mappings on the supplied source unless the source model is deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0044": (
        "REVIEWED_DUPLICATE_CANDIDATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0010; the filename/portal label versus PDF-body version discrepancy remains explicit.",
        "Retain duplicate identity and current portal location; preserve the version gate and keep operational mappings on the supplied source unless deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0045": (
        "REVIEWED_DUPLICATE_CANDIDATE_MAPPING_ON_SUPPLIED_SOURCE",
        "The authenticated download is byte-identical to fully reviewed and mapped SRC-GDRIVE-FILE-0005; the filename/portal label versus PDF-body version discrepancy remains explicit.",
        "Retain duplicate identity and current portal location; preserve the version gate and keep operational mappings on the supplied source unless deliberately consolidated.",
    ),
    "SRC-MGB-DOC-0046": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "Only the upper visible regions of all 16 pages of the FORGE 3.2 guide are checksum-preserved and reviewed; the newer 3.3 combined guide is the current comparison target.",
        "Use 3.2 only for section-level comparison after completing 3.3; do not let older content override newer applicable instructions.",
    ),
    "SRC-MGB-DOC-0047": (
        "PARTIAL_DOCUMENT_REVIEW_REQUIRED",
        "Pages 1-4 and 11-13 upper regions of the 198-page current FORGE 3.3 combined guide are checksum-preserved; the table of contents identifies additional feature sections but does not establish their procedures.",
        "Highest priority: acquire original bytes or complete page captures and review the current 3.3 feature and mainstream driver-workflow sections before changing canonical behavior.",
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
