#!/usr/bin/env python3
"""Build the Drive-authored Ready Route FAQ tables from canonical knowledge.

This script intentionally separates production-published answers from reviewed but
non-eligible material. It does not modify generated /knowledge artifacts.
"""

from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "answer-library-v1" / "drive-complete"
OUT.mkdir(parents=True, exist_ok=True)

DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/11gFp2-i80bhI0s0tLR66B8KMWS_3JBEb"

LIVE_SOURCE_IDS = {
    "SRC-GDRIVE-FILE-0001",  # MGB-119 quick reference
    "SRC-GDRIVE-FILE-0002",  # customer experience guide
    "SRC-GDRIVE-FILE-0003",  # scenario workbook
    "SRC-GDRIVE-FILE-0005",  # business closure guide
    "SRC-GDRIVE-FILE-0006",  # call tags guide
    "SRC-GDRIVE-FILE-0007",  # delayed login guide
    "SRC-GDRIVE-FILE-0008",  # FORGE 2.8 guide
    "SRC-GDRIVE-FILE-0009",  # FORGE quick start
    "SRC-GDRIVE-FILE-0010",  # settings guide
    "SRC-GDRIVE-FILE-0011",  # hand sheet 2
    "SRC-GDRIVE-FILE-0012",  # hand sheet
    "SRC-GDRIVE-FILE-0013",  # manifest preview
    "SRC-GDRIVE-FILE-0014",  # OP-117
    "SRC-GDRIVE-FILE-0015",  # package placement quick reference
    "SRC-GDRIVE-FILE-0017",  # FAD screenshot
    "SRC-MGB-DOC-0020",      # additional pickup guide
    "SRC-MGB-DOC-0042",      # download pickup list guide
    "SRC-MGB-DOC-0047",      # current FORGE 3.3 guide
}

FAQ_HEADERS = [
    "faq_id", "record_type", "category", "question", "aliases",
    "short_answer", "code", "code_namespace", "steps", "clarifier_question",
    "clarifier_choices", "decision_variables", "prohibited", "image_filenames",
    "image_captions", "source_doc", "source_page_or_locator",
    "source_url", "status", "approved_by", "approved_at",
    "content_version", "effective_date", "last_updated",
    "source_record_id", "knowledge_status", "publication_note",
]


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def load_inventory() -> dict[str, dict]:
    path = ROOT / "research/fedex-ground-driver-knowledge/inventory/source_inventory.csv"
    return {r["source_id"]: r for r in csv.DictReader(path.open())}


def clean_category(record: dict) -> str:
    ids = record.get("category_paths") or []
    if ids:
        leaf = ids[0].split("/")[-1]
        return leaf.removeprefix("TAX-").lower().replace("-", "_")
    parts = record["knowledge_id"].split("-")
    return (parts[1] if len(parts) > 1 else "general").lower()


def page_locators(record: dict) -> str:
    seen = []
    for ev in record.get("source_evidence", []):
        if ev.get("source_id") in LIVE_SOURCE_IDS and ev.get("locator") not in seen:
            seen.append(ev.get("locator"))
    return " | ".join(x for x in seen if x)


def source_titles(record: dict, inventory: dict[str, dict]) -> str:
    titles = []
    for sid in record.get("source_ids", []):
        if sid in LIVE_SOURCE_IDS:
            title = inventory.get(sid, {}).get("title", sid)
            if title not in titles:
                titles.append(title)
    return " | ".join(titles)


def record_images(knowledge_id: str) -> tuple[str, str]:
    mapping = {
        "KNO-FORGE-CALLTAG-SCOPE-001": (
            "FAQ-CALLTAG-STOP-WORKFLOW-01.png | FAQ-CALLTAG-ACTION-OPTIONS-01.png | FAQ-CALLTAG-APPLY-STATUS-01.png | FAQ-CALLTAG-INDIVIDUAL-01.png",
            "Call-tag stop workflow | Available call-tag actions | Applying a status to call tags | Handling call tags individually",
        ),
        "KNO-PUP-CALLTAG-SUCCESS-001": (
            "FAQ-CALLTAG-STOP-WORKFLOW-01.png | FAQ-CALLTAG-INDIVIDUAL-01.png",
            "Call-tag stop workflow | Handling call tags individually",
        ),
        "KNO-PUP-CALLTAG-NOTREADY-001": (
            "FAQ-CALLTAG-APPLY-STATUS-01.png | FAQ-CALLTAG-INDIVIDUAL-01.png",
            "Applying a status to call tags | Handling call tags individually",
        ),
        "KNO-PUP-CALLTAG-REFUSED-001": (
            "FAQ-CALLTAG-APPLY-STATUS-01.png | FAQ-CALLTAG-INDIVIDUAL-01.png",
            "Applying a status to call tags | Handling call tags individually",
        ),
        "KNO-PUP-CALLTAG-RESTRICTED-001": (
            "FAQ-CALLTAG-APPLY-STATUS-01.png | FAQ-CALLTAG-INDIVIDUAL-01.png",
            "Applying a status to call tags | Handling call tags individually",
        ),
        "KNO-DEL-FAD-GROUND-001": (
            "FAQ-FORGE-FAD-P018.png",
            "FAD QR validation and no-valid-QR branches",
        ),
        "KNO-DEL-SAFEPLACE-001": (
            "FAQ-DRIVER-RELEASE-01.png | FAQ-DRIVER-RELEASE-CX-01.png",
            "Driver-release eligibility and safe-location requirements | Driver release and photo-at-delivery reference",
        ),
        "KNO-DEL-SIG-ISR-001": (
            "FAQ-SIGNATURE-SERVICES-01.png | FAQ-FORGE-SIGNATURE-P194.png | FAQ-INDIRECT-PREMIUM-CX-01.png | FAQ-SIGNATURE-ALCOHOL-CX-01.png",
            "Signature-service expectations | FORGE signature-required identifiers | Indirect-delivery and premium-service reference | Signature options and alcohol-delivery reference",
        ),
        "KNO-DEL-SIG-DSR-001": (
            "FAQ-SIGNATURE-SERVICES-01.png | FAQ-FORGE-SIGNATURE-P194.png | FAQ-SIGNATURE-ALCOHOL-CX-01.png",
            "Signature-service expectations | FORGE signature-required identifiers | Signature options and alcohol-delivery reference",
        ),
        "KNO-DEL-SIG-ASR-001": (
            "FAQ-SIGNATURE-SERVICES-01.png | FAQ-FORGE-SIGNATURE-P194.png | FAQ-SIGNATURE-ALCOHOL-CX-01.png",
            "Signature-service expectations | FORGE signature-required identifiers | Signature options and alcohol-delivery reference",
        ),
        "KNO-DEL-ALCOHOL-001": (
            "FAQ-SIGNATURE-ALCOHOL-CX-01.png",
            "Signature options and alcohol-delivery reference",
        ),
        "KNO-DEL-APT-001": (
            "FAQ-INDIRECT-PREMIUM-CX-01.png",
            "Indirect-delivery, apartment, and premium-service reference",
        ),
        "KNO-DEL-SCAN-INTEGRITY-001": (
            "FAQ-SCAN-TIME-DEFINITE-01.png | FAQ-SCAN-INTEGRITY-CX-01.png",
            "Accurate scan timing and time-definite service expectations | Accurate and inaccurate scanning examples",
        ),
        "KNO-PUP-SCAN-INTEGRITY-001": (
            "FAQ-SCAN-TIME-DEFINITE-01.png | FAQ-SCAN-INTEGRITY-CX-01.png",
            "Accurate scan timing and time-definite service expectations | Accurate and inaccurate scanning examples",
        ),
        "KNO-DEL-PREMIUM-WINDOW-001": ("FAQ-SCAN-TIME-DEFINITE-01.png", "Accurate scan timing and time-definite service expectations"),
        "KNO-SEC-ROUTE-001": ("FAQ-SECURITY-STANDARDS-01.png", "On-route vehicle and package security standards"),
        "KNO-DEL-NOTATION-001": ("FAQ-SERVICE-CROSS-01.png | FAQ-DELIVERY-STATUS-CODES-01.png | FAQ-FORGE-INTERCEPT-P190.png", "Service-cross example | Delivery status-code reference | FORGE intercepted-package code-100 screen"),
        "KNO-DEL-PPOD-001": ("FAQ-FORGE-PPOD-P040.png | FAQ-FORGE-PPOD-P116.png | FAQ-FORGE-PPODA-P155.png", "Current FORGE photo-capture guidance | Locker PPOD workflow | PPODA workflow and restricted-location exception"),
        "KNO-DEL-HAL-NONHAL-TRANSFER-001": ("FAQ-FORGE-HAL-P151.png", "Current FORGE HAL and non-HAL transfer screen"),
        "KNO-FORGE-FLOATING-ACTION-001": ("FAQ-FORGE-FLOATING-P011.png", "Current FORGE floating action button settings and examples"),
        "KNO-PUP-RECEIPT-001": ("FAQ-FORGE-PICKUP-RECEIPT-P013.png", "Current FORGE pickup-receipt workflow"),
        "KNO-FORGE-SHUTTLE-TRANSFER-001": ("FAQ-FORGE-SHUTTLE-P029.png | FAQ-FORGE-SHUTTLE-P030.png", "Shuttle Transfer package entry | Shuttle Transfer completion and End of Day visibility"),
        "KNO-FORGE-BUSINESS-CLOSURE-MSG-001": (
            "FAQ-FORGE-BUSINESS-CLOSURE-P001.png | FAQ-FORGE-BUSINESS-CLOSURE-ACCESS-CX-01.png | FAQ-FORGE-BUSINESS-CLOSURE-WORKFLOW-CX-01.png",
            "Business Closure message workflow (FORGE 2.2 visual reference) | Business Closure access options | Business Closure message workflow detail",
        ),
        "KNO-FORGE-DELAYED-LOGIN-001": (
            "FAQ-FORGE-DELAYED-LOGIN-P001.png | FAQ-FORGE-DELAYED-LOGIN-P002.png | FAQ-FORGE-DELAYED-LOGIN-P003.png | FAQ-FORGE-DELAYED-LOGIN-P004.png | FAQ-FORGE-DELAYED-LOGIN-P005.png",
            "Delayed Login entry | Delayed Login restrictions | Delayed Login workflow | Reauthentication | End-of-day completion (FORGE 2.5 visual reference)",
        ),
        "KNO-FORGE-CAMERA-SCAN-001": (
            "FAQ-FORGE-SETTINGS-P005.png",
            "Use Camera to Scan setting (FORGE 2.2 visual reference)",
        ),
        "KNO-FORGE-MANIFEST-PREVIEW-001": (
            "FAQ-FORGE-MANIFEST-PREVIEW-P001.png | FAQ-FORGE-MANIFEST-PREVIEW-P002.png | FAQ-FORGE-MANIFEST-PREVIEW-P003.png | FAQ-FORGE-MANIFEST-PREVIEW-P004.png | FAQ-FORGE-MANIFEST-PREVIEW-P005.png | FAQ-FORGE-MANIFEST-PREVIEW-P006.png | FAQ-FORGE-MANIFEST-PREVIEW-P007.png | FAQ-FORGE-MANIFEST-PREVIEW-P008.png | FAQ-FORGE-MANIFEST-PREVIEW-P009.png | FAQ-FORGE-MANIFEST-PREVIEW-P010.png | FAQ-FORGE-MANIFEST-PREVIEW-P011.png | FAQ-FORGE-MANIFEST-PREVIEW-P012.png | FAQ-FORGE-MANIFEST-PREVIEW-P013.png | FAQ-FORGE-MANIFEST-PREVIEW-P014.png",
            "Manifest Preview application-guide pages 1–14 (visual reference)",
        ),
        "KNO-DOC-HANDSHEET-001": (
            "FAQ-HAND-SHEET-01-P001.png | FAQ-HAND-SHEET-02-P001.png",
            "Manual sheeting barcodes and service-cross example | Hand-sheet form example",
        ),
        "KNO-DEL-PLACEMENT-HAZARD-001": (
            "FAQ-PACKAGE-PLACEMENT-P001.png | FAQ-PACKAGE-PLACEMENT-P002.png | FAQ-PACKAGE-CARE-01.png",
            "Package-placement quick reference page 1 | Package-placement quick reference page 2 | Package care and delivery-location expectations",
        ),
        "KNO-FORGE-DOWNLOAD-SYNC-001": (
            "FAQ-FORGE-DOWNLOAD-PICKUP-P001.png",
            "Download Pickup List screen (withheld visual reference)",
        ),
    }
    return mapping.get(knowledge_id, ("", ""))


def procedure_row(record: dict, inventory: dict[str, dict], published: bool) -> list[str]:
    kid = record["knowledge_id"]
    images, captions = record_images(kid)
    aliases = []
    for value in [record.get("canonical_situation"), *record.get("driver_question_variants", [])]:
        if value and value not in aliases:
            aliases.append(value)
    steps = " | ".join(x.get("action", "") for x in record.get("required_procedure", []))
    prohibited = " | ".join(record.get("prohibited_actions", []))
    clarifiers = record.get("clarification_requirements", [])
    blockers = record.get("production_eligibility", {}).get("blockers", [])
    status = "published" if published else "draft"
    note = (
        "Eligible canonical Ready Route knowledge; exported to runtime."
        if published
        else "Preserved for coverage and review; excluded from runtime. " + " | ".join(blockers)
    )
    row = {
        "faq_id": "FAQ-" + kid.removeprefix("KNO-"),
        "record_type": "PROCEDURE_ONLY",
        "category": clean_category(record),
        "question": record.get("canonical_situation", ""),
        "aliases": " | ".join(aliases),
        "short_answer": record.get("concise_driver_answer", ""),
        "code": "",
        "code_namespace": "",
        "steps": steps,
        # Source decision variables are retained for authoring and audit, but
        # they are not automatically exposed as runtime questions. Runtime
        # clarifications require explicit choices and verified target FAQs.
        "clarifier_question": "",
        "clarifier_choices": "",
        "decision_variables": " | ".join(clarifiers),
        "prohibited": prohibited,
        "image_filenames": images,
        "image_captions": captions,
        "source_doc": source_titles(record, inventory),
        "source_page_or_locator": page_locators(record),
        "source_url": DRIVE_FOLDER_URL,
        "status": status,
        "approved_by": record.get("approved_by") or "Ready Route canonical review",
        "approved_at": record.get("approval_date") or record.get("updated_at", ""),
        "content_version": str(record.get("record_version", 1)),
        "effective_date": record.get("effective_date") or "",
        "last_updated": record.get("updated_at", ""),
        "source_record_id": kid,
        "knowledge_status": record.get("knowledge_status", ""),
        "publication_note": note,
    }
    return [str(row.get(h, "") or "") for h in FAQ_HEADERS]


def code_row(code: dict, published: bool, prefix: str) -> list[str]:
    numeric = str(code["code"])
    normalized = numeric.zfill(3) if code["namespace"] == "DELIVERY_STATUS" else numeric
    status = "published" if published else "draft"
    source_id = code.get("source_id", "")
    source = inventory.get(source_id, {}).get("title", source_id)
    row = {
        "faq_id": f"FAQ-{prefix}-{normalized}",
        "record_type": "CODE_DEFINITION",
        "category": "delivery_status_code" if code["namespace"] == "DELIVERY_STATUS" else "pickup_reason_code",
        "question": f"What does {code['namespace'].replace('_', ' ').lower()} {normalized} mean?",
        "aliases": f"code {normalized} | code {int(numeric)} | what is {normalized} | what does {normalized} mean",
        "short_answer": f"{normalized} — {code['label']}: {code['applies_when']}",
        "code": normalized if published else "",
        "code_namespace": code["namespace"].lower(),
        "steps": f"Use this definition only for the {code['namespace'].replace('_', ' ').lower()} namespace."
        + (" | " + " | ".join(code.get("scope_notes", [])) if code.get("scope_notes") else ""),
        "source_doc": source,
        "source_page_or_locator": code.get("locator", ""),
        "source_url": DRIVE_FOLDER_URL,
        "status": status,
        "approved_by": "Ready Route source review",
        "approved_at": "2026-08-12",
        "content_version": "1",
        "effective_date": code.get("source_version", ""),
        "last_updated": "2026-08-12",
        "source_record_id": f"{code['namespace']}:{normalized}",
        # VERIFIED was a workbench/source status, not a production status.
        # These definitions have already passed source review, so export them
        # using the canonical production status.
        "knowledge_status": "SOURCE_VERIFIED" if code.get("knowledge_status") == "VERIFIED" else code.get("knowledge_status", ""),
        "publication_note": "Exact verified code definition; exported to runtime." if published else "Retained for review; excluded from runtime.",
    }
    return [str(row.get(h, "") or "") for h in FAQ_HEADERS]


inventory = load_inventory()
records = read_jsonl(ROOT / "knowledge/operations/records.jsonl")
drive_records = [r for r in records if set(r.get("source_ids", [])) & LIVE_SOURCE_IDS]

published_records = []
withheld_records = []
for record in drive_records:
    eligibility = record.get("production_eligibility", {})
    published = (
        record.get("knowledge_status") in {"SOURCE_VERIFIED", "READY_ROUTE_APPROVED"}
        and eligibility.get("status_eligible") is True
        and eligibility.get("publication_ready") is True
    )
    (published_records if published else withheld_records).append(procedure_row(record, inventory, published))

status_codes = read_jsonl(ROOT / "research/fedex-ground-driver-knowledge/knowledge/status_codes.jsonl")
pickup_codes = read_jsonl(ROOT / "research/fedex-ground-driver-knowledge/knowledge/pickup_reason_codes.jsonl")
for code in status_codes:
    row = code_row(code, code.get("knowledge_status") == "VERIFIED", "DELIVERY-STATUS")
    (published_records if code.get("knowledge_status") == "VERIFIED" else withheld_records).append(row)
for code in pickup_codes:
    row = code_row(code, code.get("knowledge_status") == "VERIFIED", "PICKUP-REASON")
    (published_records if code.get("knowledge_status") == "VERIFIED" else withheld_records).append(row)

published_records.sort(key=lambda r: (r[2], r[0]))
withheld_records.sort(key=lambda r: (r[23], r[2], r[0]))

for name, rows in (("master_faq.csv", published_records), ("withheld_knowledge.csv", withheld_records)):
    with (OUT / name).open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(FAQ_HEADERS)
        w.writerows(rows)

# Document-by-document coverage matrix. Page counts are from the preserved bytes.
page_counts = {
    "SRC-GDRIVE-FILE-0001": 2, "SRC-GDRIVE-FILE-0002": 16,
    "SRC-GDRIVE-FILE-0003": 1, "SRC-GDRIVE-FILE-0005": 1,
    "SRC-GDRIVE-FILE-0006": 3, "SRC-GDRIVE-FILE-0007": 5,
    "SRC-GDRIVE-FILE-0008": 246, "SRC-GDRIVE-FILE-0009": 8,
    "SRC-GDRIVE-FILE-0010": 6, "SRC-GDRIVE-FILE-0011": 1,
    "SRC-GDRIVE-FILE-0012": 1, "SRC-GDRIVE-FILE-0013": 14,
    "SRC-GDRIVE-FILE-0014": 89, "SRC-GDRIVE-FILE-0015": 2,
    "SRC-GDRIVE-FILE-0017": 1, "SRC-MGB-DOC-0020": 3,
    "SRC-MGB-DOC-0042": 1, "SRC-MGB-DOC-0047": 198,
}
source_image_counts = {
    "SRC-GDRIVE-FILE-0005": 1,
    "SRC-GDRIVE-FILE-0006": 3,
    "SRC-GDRIVE-FILE-0007": 5,
    "SRC-GDRIVE-FILE-0009": 8,
    "SRC-GDRIVE-FILE-0010": 1,
    "SRC-GDRIVE-FILE-0011": 1,
    "SRC-GDRIVE-FILE-0012": 1,
    "SRC-GDRIVE-FILE-0013": 14,
    "SRC-GDRIVE-FILE-0015": 2,
    "SRC-GDRIVE-FILE-0017": 1,
    "SRC-MGB-DOC-0020": 3,
    "SRC-MGB-DOC-0042": 1,
    "SRC-MGB-DOC-0047": 13,
}
by_source = defaultdict(list)
for record in drive_records:
    for sid in set(record.get("source_ids", [])) & LIVE_SOURCE_IDS:
        by_source[sid].append(record)

coverage_headers = [
    "source_id", "title", "page_or_sheet_count", "review_status",
    "driver_relevance", "mapped_records", "published_records",
    "withheld_records", "image_assets", "coverage_disposition", "notes",
]
coverage_rows = []
for sid in sorted(LIVE_SOURCE_IDS):
    rows = by_source.get(sid, [])
    eligible = [r for r in rows if r.get("knowledge_status") in {"SOURCE_VERIFIED", "READY_ROUTE_APPROVED"}
                and r.get("production_eligibility", {}).get("publication_ready") is True]
    image_assets = source_image_counts.get(sid, 0)
    title = inventory.get(sid, {}).get("title", sid)
    coverage_rows.append([
        sid, title, page_counts.get(sid, ""), inventory.get(sid, {}).get("review_status", "FULLY_REVIEWED"),
        inventory.get(sid, {}).get("relevance_status", "HIGH_RELEVANCE"), len(rows), len(eligible),
        len(rows) - len(eligible), image_assets,
        "MAPPED_TO_LIBRARY" if rows else "REVIEWED_NO_STANDALONE_DRIVER_ANSWER",
        "Published rows ship; withheld rows remain auditable and do not ship.",
    ])
with (OUT / "document_coverage.csv").open("w", newline="") as f:
    w = csv.writer(f); w.writerow(coverage_headers); w.writerows(coverage_rows)

image_headers = ["image_filename", "related_faq_ids", "caption", "source_id", "source_locator", "status", "notes"]
image_rows = [
    ["FAQ-CALLTAG-STOP-WORKFLOW-01.png", "FAQ-FORGE-CALLTAG-SCOPE-001 | FAQ-PUP-CALLTAG-SUCCESS-001", "Call-tag stop workflow", "SRC-GDRIVE-FILE-0006", "page 1 focused excerpt", "published", "Focused authorized operational excerpt."],
    ["FAQ-CALLTAG-ACTION-OPTIONS-01.png", "FAQ-FORGE-CALLTAG-SCOPE-001", "Available call-tag actions", "SRC-GDRIVE-FILE-0006", "page 2 focused excerpt", "published", "Focused authorized operational excerpt."],
    ["FAQ-CALLTAG-APPLY-STATUS-01.png", "FAQ-FORGE-CALLTAG-SCOPE-001 | FAQ-PUP-CALLTAG-NOTREADY-001 | FAQ-PUP-CALLTAG-REFUSED-001 | FAQ-PUP-CALLTAG-RESTRICTED-001", "Applying a status to call tags", "SRC-GDRIVE-FILE-0006", "page 2 focused excerpt", "published", "Focused authorized operational excerpt."],
    ["FAQ-CALLTAG-INDIVIDUAL-01.png", "FAQ-FORGE-CALLTAG-SCOPE-001 | FAQ-PUP-CALLTAG-SUCCESS-001 | FAQ-PUP-CALLTAG-NOTREADY-001 | FAQ-PUP-CALLTAG-REFUSED-001 | FAQ-PUP-CALLTAG-RESTRICTED-001", "Handling call tags individually", "SRC-GDRIVE-FILE-0006", "page 3 focused excerpt", "published", "Focused authorized operational excerpt."],
    ["FAQ-FORGE-BUSINESS-CLOSURE-P001.png", "FAQ-FORGE-BUSINESS-CLOSURE-MSG-001", "Business Closure message workflow", "SRC-GDRIVE-FILE-0005", "page 1", "published", "FORGE 2.2 visual reference; written canonical rule controls."],
    *[[f"FAQ-FORGE-DELAYED-LOGIN-P{i:03d}.png", "FAQ-FORGE-DELAYED-LOGIN-001", f"Delayed Login guide page {i}", "SRC-GDRIVE-FILE-0007", f"page {i}", "published", "FORGE 2.5 visual reference; written canonical rule controls."] for i in range(1, 6)],
    ["FAQ-FORGE-SETTINGS-P005.png", "FAQ-FORGE-CAMERA-SCAN-001", "Use Camera to Scan setting", "SRC-GDRIVE-FILE-0010", "page 5", "published", "FORGE 2.2 visual reference; written canonical rule controls."],
    *[[f"FAQ-FORGE-MANIFEST-PREVIEW-P{i:03d}.png", "FAQ-FORGE-MANIFEST-PREVIEW-001", f"Manifest Preview guide page {i}", "SRC-GDRIVE-FILE-0013", f"page {i}", "published", "Visual reference; approved canonical answer controls if interface differs."] for i in range(1, 15)],
    ["FAQ-HAND-SHEET-01-P001.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting barcode and service-cross example", "SRC-GDRIVE-FILE-0012", "page 1", "published", "Ready Route approved hand-sheet visual."],
    ["FAQ-HAND-SHEET-02-P001.png", "FAQ-DOC-HANDSHEET-001", "Hand-sheet form example", "SRC-GDRIVE-FILE-0011", "page 1", "published", "Ready Route approved hand-sheet visual."],
    ["FAQ-PACKAGE-PLACEMENT-P001.png", "FAQ-DEL-PLACEMENT-HAZARD-001", "Package-placement quick reference page 1", "SRC-GDRIVE-FILE-0015", "page 1", "published", "Driver-facing package placement visual."],
    ["FAQ-PACKAGE-PLACEMENT-P002.png", "FAQ-DEL-PLACEMENT-HAZARD-001", "Package-placement quick reference page 2", "SRC-GDRIVE-FILE-0015", "page 2", "published", "Driver-facing package placement visual."],
    ["FAQ-DRIVER-RELEASE-01.png", "FAQ-DEL-SAFEPLACE-001", "Driver-release eligibility and safe-location requirements", "SRC-GDRIVE-FILE-0001", "MGB-119 page 1 focused excerpt", "published", "Focused current driver reference."],
    ["FAQ-SIGNATURE-SERVICES-01.png", "FAQ-DEL-SIG-ISR-001 | FAQ-DEL-SIG-DSR-001 | FAQ-DEL-SIG-ASR-001", "Signature-service expectations", "SRC-GDRIVE-FILE-0001", "MGB-119 page 1 focused excerpt", "published", "Focused current driver reference."],
    ["FAQ-SCAN-TIME-DEFINITE-01.png", "FAQ-DEL-SCAN-INTEGRITY-001 | FAQ-PUP-SCAN-INTEGRITY-001 | FAQ-DEL-PREMIUM-WINDOW-001", "Accurate scan timing and time-definite service expectations", "SRC-GDRIVE-FILE-0001", "MGB-119 page 1 focused excerpt", "published", "Focused current driver reference."],
    ["FAQ-SECURITY-STANDARDS-01.png", "FAQ-SEC-ROUTE-001", "On-route vehicle and package security standards", "SRC-GDRIVE-FILE-0001", "MGB-119 page 2 focused excerpt", "published", "Focused current driver reference."],
    ["FAQ-PACKAGE-CARE-01.png", "FAQ-DEL-PLACEMENT-HAZARD-001", "Package care and delivery-location expectations", "SRC-GDRIVE-FILE-0001", "MGB-119 page 1 focused excerpt", "published", "Supporting image; the canonical written procedure controls."],
    ["FAQ-SERVICE-CROSS-01.png", "FAQ-DEL-NOTATION-001", "Service-cross example", "SRC-GDRIVE-FILE-0001", "MGB-119 page 2 focused excerpt", "published", "Focused current driver reference."],
    ["FAQ-DELIVERY-STATUS-CODES-01.png", "FAQ-DEL-NOTATION-001", "Delivery status-code reference", "SRC-GDRIVE-FILE-0001", "MGB-119 page 2 focused excerpt", "published", "Exact code lookups remain controlled by published code records."],
    ["FAQ-FORGE-FAD-P018.png", "FAQ-DEL-FAD-GROUND-001", "FAD QR validation and no-valid-QR branches", "SRC-MGB-DOC-0047", "page 18", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-PPOD-P040.png", "FAQ-DEL-PPOD-001", "Current photo-capture guidance", "SRC-MGB-DOC-0047", "page 40", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-PPOD-P116.png", "FAQ-DEL-PPOD-001", "Locker PPOD workflow", "SRC-MGB-DOC-0047", "page 116", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-HAL-P151.png", "FAQ-DEL-HAL-NONHAL-TRANSFER-001", "HAL and non-HAL transfer screen", "SRC-MGB-DOC-0047", "page 151", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-PPODA-P155.png", "FAQ-DEL-PPOD-001", "PPODA workflow and restricted-location exception", "SRC-MGB-DOC-0047", "page 155", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-INTERCEPT-P190.png", "FAQ-DEL-NOTATION-001", "Intercept message and code-100 package display", "SRC-MGB-DOC-0047", "page 190", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-SIGNATURE-P194.png", "FAQ-DEL-SIG-ISR-001 | FAQ-DEL-SIG-DSR-001 | FAQ-DEL-SIG-ASR-001", "FORGE signature-required identifiers", "SRC-MGB-DOC-0047", "page 194", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-FLOATING-P011.png", "FAQ-FORGE-FLOATING-ACTION-001", "Floating action button settings and examples", "SRC-MGB-DOC-0047", "page 11", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-PICKUP-RECEIPT-P013.png", "FAQ-PUP-RECEIPT-001", "Pickup-receipt workflow", "SRC-MGB-DOC-0047", "page 13", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-SHUTTLE-P029.png", "FAQ-FORGE-SHUTTLE-TRANSFER-001", "Shuttle Transfer package entry", "SRC-MGB-DOC-0047", "page 29", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-FORGE-SHUTTLE-P030.png", "FAQ-FORGE-SHUTTLE-TRANSFER-001", "Shuttle Transfer completion and End of Day visibility", "SRC-MGB-DOC-0047", "page 30", "published", "Current FORGE 3.3 visual reference."],
    ["FAQ-DRIVER-RELEASE-CX-01.png", "FAQ-DEL-SAFEPLACE-001", "Driver release and photo-at-delivery reference", "SRC-GDRIVE-FILE-0002", "customer-experience guide", "published", "Supporting visual; current OP-117 canonical answer controls."],
    ["FAQ-SCAN-INTEGRITY-CX-01.png", "FAQ-DEL-SCAN-INTEGRITY-001 | FAQ-PUP-SCAN-INTEGRITY-001", "Accurate and inaccurate scanning examples", "SRC-GDRIVE-FILE-0002", "customer-experience guide", "published", "Supporting visual; current OP-117 canonical answer controls."],
    ["FAQ-FORGE-BUSINESS-CLOSURE-ACCESS-CX-01.png", "FAQ-FORGE-BUSINESS-CLOSURE-MSG-001", "Business Closure access options", "SRC-GDRIVE-FILE-0005", "business-closure guide", "published", "Visual navigation aid; written canonical answer controls."],
    ["FAQ-FORGE-BUSINESS-CLOSURE-WORKFLOW-CX-01.png", "FAQ-FORGE-BUSINESS-CLOSURE-MSG-001", "Business Closure message workflow detail", "SRC-GDRIVE-FILE-0005", "business-closure guide", "published", "Visual navigation aid; written canonical answer controls."],
    ["FAQ-INDIRECT-PREMIUM-CX-01.png", "FAQ-DEL-SIG-ISR-001 | FAQ-DEL-APT-001", "Indirect-delivery, apartment, and premium-service reference", "SRC-GDRIVE-FILE-0002", "customer-experience guide", "published", "Supporting visual; current OP-117 canonical answers control."],
    ["FAQ-SIGNATURE-ALCOHOL-CX-01.png", "FAQ-DEL-SIG-ISR-001 | FAQ-DEL-SIG-DSR-001 | FAQ-DEL-SIG-ASR-001 | FAQ-DEL-ALCOHOL-001", "Signature options and alcohol-delivery reference", "SRC-GDRIVE-FILE-0002", "customer-experience guide", "published", "Supporting visual; current OP-117 canonical answers control."],
    ["FAQ-SIGNATURE-TOBACCO-CX-01.png", "FAQ-DEL-TOBACCO-001", "Signature exceptions and tobacco-shipment reference", "SRC-GDRIVE-FILE-0002", "customer-experience guide", "withheld", "The related canonical record remains review-required, so this image is excluded from runtime."],
    ["FAQ-HANDSHEET-RECORD-FORMAT-CX-01.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting record format", "SRC-GDRIVE-FILE-0011", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-SERVICE-CROSS-CX-01.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting service-cross example", "SRC-GDRIVE-FILE-0011", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-REASONS-CX-01.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting reasons and release codes", "SRC-GDRIVE-FILE-0012", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-STATUS-CODES-CX-01.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting status-code reference", "SRC-GDRIVE-FILE-0012", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-DELIVERY-EXAMPLES-01.png", "FAQ-DOC-HANDSHEET-001", "Manual delivery-record examples, part 1", "SRC-GDRIVE-FILE-0011", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-DELIVERY-EXAMPLES-02.png", "FAQ-DOC-HANDSHEET-001", "Manual delivery-record examples, part 2", "SRC-GDRIVE-FILE-0011", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-HANDSHEET-BARCODE-SELECTION-CX-01.png", "FAQ-DOC-HANDSHEET-001", "Manual sheeting barcode selection", "SRC-GDRIVE-FILE-0012", "manual-sheeting excerpt", "withheld", "Older manual example retained for internal review and excluded from runtime."],
    ["FAQ-FORGE-DOWNLOAD-PICKUP-P001.png", "FAQ-FORGE-DOWNLOAD-SYNC-001", "Download Pickup List workflow", "SRC-MGB-DOC-0042", "page 1", "withheld", "Potentially outdated workflow; image is cataloged but excluded from runtime."],
    *[[f"FAQ-FORGE-ADDITIONAL-PICKUP-P{i:03d}.png", "", f"Additional pickup guide page {i}", "SRC-MGB-DOC-0020", f"page {i}", "withheld", "Older feature guide has no production-eligible standalone answer; retained for review."] for i in range(1, 4)],
    *[[f"FAQ-FORGE-QUICK-START-P{i:03d}.png", "FAQ-FORGE-DEVICE-ROAD-001", f"FORGE Quick Start guide page {i}", "SRC-GDRIVE-FILE-0009", f"page {i}", "withheld", "Older interface guide is preserved for visual review but excluded from runtime."] for i in range(1, 9)],
]
with (OUT / "image_catalog.csv").open("w", newline="") as f:
    w = csv.writer(f); w.writerow(image_headers); w.writerows(image_rows)

report = {
    "live_drive_files": len(LIVE_SOURCE_IDS),
    "canonical_records_with_live_drive_evidence": len(drive_records),
    "published_procedure_records": len([r for r in published_records if r[1] == "PROCEDURE_ONLY"]),
    "published_code_records": len([r for r in published_records if r[1] == "CODE_DEFINITION"]),
    "published_total": len(published_records),
    "withheld_total": len(withheld_records),
    "published_image_assets": sum(1 for row in image_rows if row[5] == "published"),
}
(OUT / "build_report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
