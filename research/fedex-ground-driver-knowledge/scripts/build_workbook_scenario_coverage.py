#!/usr/bin/env python3
"""Build exact row-level coverage for the secondary driver-scenario workbook."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parent.parent
SOURCE_INVENTORY_PATH = ROOT / "inventory/source_inventory.csv"
OUTPUT_PATH = ROOT / "validation/workbook_scenario_coverage.csv"
SOURCE_ID = "SRC-GDRIVE-FILE-0003"

FIELDS = [
    "scenario_id",
    "workbook_row",
    "category",
    "situation",
    "workbook_source_note",
    "source_row_sha256",
    "coverage_class",
    "authoritative_targets",
    "backlog_ids",
    "answer_safety_disposition",
    "required_follow_up",
]


def audit(
    coverage_class: str,
    targets: str,
    backlog_ids: str,
    disposition: str,
    follow_up: str,
) -> dict[str, str]:
    return {
        "coverage_class": coverage_class,
        "authoritative_targets": targets,
        "backlog_ids": backlog_ids,
        "answer_safety_disposition": disposition,
        "required_follow_up": follow_up,
    }


DIRECT = "DIRECTLY_COVERED"
PARTIAL = "CONDITIONALLY_OR_PARTIALLY_COVERED"
HUMAN = "HUMAN_REVIEW_REQUIRED"
MISSING = "NO_AUTHORITATIVE_EVIDENCE"
OUTDATED = "POTENTIALLY_OUTDATED"
CONTRADICTED = "WORKBOOK_ANSWER_CONTRADICTED"

USE_SOURCE = "USE_AUTHORITATIVE_TARGET_ONLY"
ASK = "ASK_REQUIRED_CLARIFICATION_AND_USE_AUTHORITATIVE_TARGETS"
WITHHOLD_HUMAN = "WITHHOLD_APPROVED_ANSWER_PENDING_HUMAN_REVIEW"
WITHHOLD_SOURCE = "WITHHOLD_APPROVED_ANSWER_PENDING_SOURCE"
WITHHOLD_VERSION = "WITHHOLD_PENDING_VERSION_CONFIRMATION"
REJECT = "REJECT_WORKBOOK_ANSWER_USE_CURRENT_SOURCE"


AUDIT_BY_ID: dict[int, dict[str, str]] = {
    1: audit(PARTIAL, "KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001;KNO-DEL-DOORTAG-001;KNO-DEL-NOTATION-001;KNO-DEL-ATTEMPT-LIMIT-001", "REFSRC-016", ASK, "Identify the signature type and attempt state; do not adopt the workbook's generic code-7 sequence."),
    2: audit(DIRECT, "DELIVERY_STATUS:006;KNO-DEL-REFUSED-001", "REFSRC-029", USE_SOURCE, "The code question is covered; the post-code refusal workflow remains human-review gated."),
    3: audit(DIRECT, "DELIVERY_STATUS:003", "", USE_SOURCE, "Use the current OP-117 definition only."),
    4: audit(DIRECT, "DELIVERY_STATUS:004", "", USE_SOURCE, "Use the current OP-117 definition only."),
    5: audit(CONTRADICTED, "DELIVERY_STATUS:004;DELIVERY_STATUS:007", "", REJECT, "Reject workbook code 007 for a closed non-residential business; current evidence distinguishes code 004 from residential code 007."),
    6: audit(DIRECT, "DELIVERY_STATUS:001;KNO-DEL-SECURITY-NODELIVERY-001", "", USE_SOURCE, "Use the current security-no-delivery branch."),
    7: audit(DIRECT, "DELIVERY_STATUS:002;KNO-FORGE-EDIT-ADDRESS-001", "REFSRC-022", USE_SOURCE, "The code definition is current; do not imply unsupported authority to alter the label or complete the full address-correction workflow."),
    8: audit(DIRECT, "DELIVERY_STATUS:010;KNO-DEL-DAMAGE-INSPECTION-001", "", USE_SOURCE, "Use the current inspection-required branch."),
    9: audit(DIRECT, "DELIVERY_STATUS:013", "", USE_SOURCE, "Use the current status definition."),
    10: audit(DIRECT, "DELIVERY_STATUS:014;KNO-DEL-SAFEPLACE-001", "", USE_SOURCE, "Confirm driver-release eligibility before applying the current status definition."),
    11: audit(DIRECT, "DELIVERY_STATUS:009", "", USE_SOURCE, "Use the current status definition."),
    12: audit(PARTIAL, "DELIVERY_STATUS:021;KNO-DEL-BUS-OP201-001", "REFSRC-001;REFSRC-017", ASK, "Preserve the current business-release conflict and verify controlling authorization before answering."),
    13: audit(DIRECT, "DELIVERY_STATUS:029;KNO-PUP-CALLTAG-SUCCESS-001", "", USE_SOURCE, "Use the current call-tag pickup branch."),
    14: audit(DIRECT, "DELIVERY_STATUS:027", "", USE_SOURCE, "Use the current status definition; do not infer contractor policy beyond it."),
    15: audit(DIRECT, "DELIVERY_STATUS:082", "", USE_SOURCE, "Use the current local-weather status definition."),
    16: audit(DIRECT, "DELIVERY_STATUS:012", "", USE_SOURCE, "Use the current wrong-route status definition."),
    17: audit(DIRECT, "KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001", "REFSRC-016", USE_SOURCE, "Use the current signature-service branches and their exact conditions."),
    18: audit(PARTIAL, "KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001;KNO-DEL-BUS-OP201-001", "REFSRC-001;REFSRC-017", ASK, "Separate signature-service rules from the unresolved business-release authorization branch."),
    19: audit(DIRECT, "KNO-DEL-SAFEPLACE-001;KNO-DEL-PLACEMENT-HAZARD-001", "", USE_SOURCE, "Confirm release eligibility, customer instructions, and a qualifying safe location."),
    20: audit(PARTIAL, "KNO-DEL-SAFEPLACE-001;KNO-DEL-PLACEMENT-HAZARD-001;KNO-DEL-SCAN-INTEGRITY-001", "", ASK, "Answer only the source-backed handling, placement, notification, and scan-integrity components; the prompt is broader than one procedure."),
    21: audit(DIRECT, "KNO-DEL-SCAN-INTEGRITY-001;KNO-PUP-SCAN-INTEGRITY-001;KNO-DEL-PPOD-001", "", USE_SOURCE, "Use the applicable delivery or pickup scan-at-location branch."),
    22: audit(DIRECT, "KNO-SEC-ROUTE-001", "REFSRC-009", USE_SOURCE, "Use current source-backed vehicle/package security actions; detailed standards remain an acquisition target."),
    23: audit(DIRECT, "KNO-DEL-DOORTAG-001;KNO-DEL-NOTATION-001", "REFSRC-016", USE_SOURCE, "Use the current door-tag and package-notation fields, not the workbook example as a universal sequence."),
    24: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-041", WITHHOLD_SOURCE, "Acquire and verify the cited guide pages before creating railroad-approach guidance."),
    25: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-041", WITHHOLD_SOURCE, "Acquire and verify the cited guide pages before creating track-crossing guidance."),
    26: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-041", WITHHOLD_SOURCE, "Acquire and verify the cited guide page before creating containment-space guidance."),
    27: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-041", WITHHOLD_SOURCE, "Acquire and verify the cited guide pages before creating flooded-road guidance."),
    28: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-041", WITHHOLD_SOURCE, "Acquire and verify the cited guide page before creating winter-readiness guidance."),
    29: audit(DIRECT, "KNO-SAF-DOG-ENCOUNTER-001;TAX-ANIMAL-SAFETY", "REFSRC-041", USE_SOURCE, "Use the current 2026 Dog Bite Prevention safety topic; retain REFSRC-041 only to audit the separately cited Driver Safety Guidebook."),
    30: audit(DIRECT, "KNO-SAF-DOG-ENCOUNTER-001;TAX-ANIMAL-SAFETY", "REFSRC-041", USE_SOURCE, "Use the current 2026 Dog Bite Prevention safety topic; retain REFSRC-041 only to audit the separately cited Driver Safety Guidebook."),
    31: audit(DIRECT, "KNO-SAF-DOG-ENCOUNTER-001;TAX-ANIMAL-SAFETY", "REFSRC-041", USE_SOURCE, "Use the current 2026 Dog Bite Prevention safety topic; retain REFSRC-041 only to audit the separately cited Driver Safety Guidebook."),
    32: audit(PARTIAL, "KNO-SAF-DOG-ENCOUNTER-001;TAX-ANIMAL-SAFETY", "REFSRC-041", ASK, "Current guidance says to avoid an unfamiliar dog if possible; acquire the cited Driver Safety Guidebook for any additional pre-exit checklist."),
    33: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-042", WITHHOLD_SOURCE, "Acquire and establish the authority/version of the cited handbook before creating backing guidance."),
    34: audit(MISSING, "TAX-VEHICLE-SAFETY", "REFSRC-042", WITHHOLD_SOURCE, "Acquire and establish the authority/version of the cited handbook before creating overhead-clearance guidance."),
    35: audit(PARTIAL, "KNO-DEL-SAFEPLACE-001;KNO-DEL-PLACEMENT-HAZARD-001;KNO-DEL-PPOD-001", "", REJECT, "Use official PPOD and placement guidance; reject the unsupported personal-phone-photo instruction."),
    36: audit(DIRECT, "KNO-INC-ACCIDENT-REPORT-001;KNO-INC-ACCIDENT-SCENE-001", "", USE_SOURCE, "Use the current accident reporting and scene-response procedures; do not adopt employment-discipline claims from the workbook."),
    37: audit(MISSING, "validation/adversarial_workbook_gap_report.md", "REFSRC-042", WITHHOLD_SOURCE, "Acquire and establish the cited handbook and contractor-policy authority; do not adopt pay or route-help claims."),
    38: audit(HUMAN, "KNO-DEL-TOBACCO-001", "REFSRC-036", WITHHOLD_HUMAN, "Use the current source-limit disclosure and management escalation; do not generalize the workbook's pickup prohibition."),
    39: audit(DIRECT, "KNO-HAZ-AKHI-001", "", USE_SOURCE, "Use the current Alaska/Hawaii hazmat branch."),
    40: audit(HUMAN, "KNO-HAZ-ACCEPTANCE-001", "REFSRC-006;REFSRC-007;REFSRC-014;REFSRC-015", WITHHOLD_HUMAN, "The visible FORGE screen does not establish complete hazmat eligibility or acceptance criteria; obtain controlling materials."),
    41: audit(MISSING, "TAX-DELIVERY", "REFSRC-025", WITHHOLD_SOURCE, "Acquire a current Package Research Case/customer-inquiry workflow before creating guidance."),
    42: audit(DIRECT, "KNO-VEH-PRETRIP-DEFECT-001", "", USE_SOURCE, "Use the current pre-trip defect branch and escalate any unsafe condition."),
    43: audit(DIRECT, "KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001", "REFSRC-016", USE_SOURCE, "Use current signature options and exact service conditions."),
    44: audit(DIRECT, "KNO-DEL-ALCOHOL-001;KNO-DEL-SIG-ASR-001", "", USE_SOURCE, "Use the current alcohol and ASR sequence."),
    45: audit(DIRECT, "KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001;KNO-DEL-DOORTAG-001", "REFSRC-016", USE_SOURCE, "Use the signature-specific unsuccessful-delivery branch."),
    46: audit(DIRECT, "KNO-DEL-APT-001;KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001", "", USE_SOURCE, "Confirm the signature service and central-receiving eligibility before delivery."),
    47: audit(DIRECT, "KNO-DEL-SIG-ASR-001;KNO-DEL-APT-001", "", USE_SOURCE, "Apply the current central-receiving and ASR signer conditions."),
    48: audit(HUMAN, "KNO-DEL-TOBACCO-001", "REFSRC-036", WITHHOLD_HUMAN, "Acquire the controlling tobacco/e-cigarette prohibition and commercial-exception criteria."),
    49: audit(DIRECT, "KNO-DEL-SAFEPLACE-001;KNO-DEL-PLACEMENT-HAZARD-001;KNO-DEL-DOORTAG-001;KNO-DEL-PPOD-001", "", USE_SOURCE, "Use current release, placement, door-tag, and PPOD requirements."),
    50: audit(PARTIAL, "KNO-DEL-ALCOHOL-001;KNO-DEL-HAZMAT-SIGNATURE-001;KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001;KNO-DEL-BUS-OP201-001", "REFSRC-001;REFSRC-017", ASK, "Separate the package/service branch and preserve the unresolved business-release conflict."),
    51: audit(DIRECT, "KNO-DEL-SAFEPLACE-001", "", USE_SOURCE, "Use the current no-safe-place branch."),
    52: audit(DIRECT, "KNO-DEL-PPOD-001", "", USE_SOURCE, "Use the current PPOD framing and privacy restrictions."),
    53: audit(DIRECT, "KNO-DEL-SIG-ISR-001;KNO-DEL-DOORTAG-001", "REFSRC-016", USE_SOURCE, "Use the current indirect-delivery and door-tag sequence."),
    54: audit(PARTIAL, "KNO-DEL-ATTEMPT-LIMIT-001", "", ASK, "Confirm the current attempt count and package/service exception before applying final-attempt guidance."),
    55: audit(DIRECT, "KNO-DEL-SCAN-INTEGRITY-001;KNO-PUP-SCAN-INTEGRITY-001;KNO-DEL-DOORTAG-001;KNO-PUP-WINDOW-RISK-001;KNO-DEL-SIG-ISR-001;KNO-DEL-SIG-DSR-001;KNO-DEL-SIG-ASR-001", "", USE_SOURCE, "Use the applicable scan, window, door-tag, or signature branch."),
    56: audit(PARTIAL, "KNO-DEL-SAFEPLACE-001;KNO-DEL-PLACEMENT-HAZARD-001", "", ASK, "Use source-backed handling and placement requirements; treat the combined prompt as multiple conditions."),
    57: audit(DIRECT, "KNO-CX-APPEARANCE-001", "", USE_SOURCE, "Use the current appearance and identification branch."),
    58: audit(DIRECT, "KNO-SEC-ROUTE-001", "REFSRC-009", USE_SOURCE, "Use current route-security actions; preserve the separate detailed-security source gap."),
    59: audit(HUMAN, "KNO-PUP-PACKAGING-001", "REFSRC-037", WITHHOLD_HUMAN, "The source establishes packaging expectations but not universal acceptance/refusal authority; obtain the controlling workflow."),
    60: audit(PARTIAL, "KNO-PUP-SERVICE-TYPES-001", "REFSRC-035", WITHHOLD_VERSION, "Confirm current pickup-service definitions and selection criteria before relying on the older OP-119 list."),
    61: audit(DIRECT, "KNO-DEL-CLASSIFICATION-001", "", USE_SOURCE, "Use the current residential/commercial classification branch; do not add compensation claims."),
    62: audit(DIRECT, "KNO-DEL-PREMIUM-WINDOW-001", "", USE_SOURCE, "Use the current premium/time-window branch."),
    63: audit(DIRECT, "DELIVERY_STATUS:019", "", USE_SOURCE, "Use the current status definition."),
    64: audit(DIRECT, "DELIVERY_STATUS:015", "", USE_SOURCE, "Use the current status definition."),
    65: audit(DIRECT, "DELIVERY_STATUS:016", "", USE_SOURCE, "Use the current status definition."),
    66: audit(DIRECT, "DELIVERY_STATUS:017;DELIVERY_STATUS:018;KNO-DEL-MISDELIVERY-RECOVERY-001", "", USE_SOURCE, "Use the current recovery and redelivery sequence."),
    67: audit(DIRECT, "DELIVERY_STATUS:025", "", USE_SOURCE, "Use the current status definition."),
    68: audit(DIRECT, "DELIVERY_STATUS:026", "", USE_SOURCE, "Use the current status definition."),
    69: audit(DIRECT, "DELIVERY_STATUS:028;DELIVERY_STATUS:095", "", USE_SOURCE, "Distinguish connecting-line tender from an internal FedEx transfer."),
    70: audit(OUTDATED, "DELIVERY_STATUS:030", "REFSRC-002;REFSRC-030", WITHHOLD_VERSION, "Code 030 appears only in the older OP-119 list and is absent from the reviewed current OP-117 list; obtain current controlling status material."),
    71: audit(DIRECT, "DELIVERY_STATUS:034", "", USE_SOURCE, "Use the current status definition."),
    72: audit(DIRECT, "DELIVERY_STATUS:079", "", USE_SOURCE, "Use the current status definition."),
    73: audit(DIRECT, "DELIVERY_STATUS:081", "", USE_SOURCE, "Use the current status definition; do not infer contractor-refusal approval criteria."),
    74: audit(DIRECT, "DELIVERY_STATUS:083", "", USE_SOURCE, "Use the current status definition."),
    75: audit(DIRECT, "DELIVERY_STATUS:100", "", USE_SOURCE, "Use the current status definition."),
    76: audit(DIRECT, "DELIVERY_STATUS:250", "", USE_SOURCE, "Use the current status definition."),
    77: audit(DIRECT, "DELIVERY_STATUS:251;DELIVERY_STATUS:252;DELIVERY_STATUS:253", "", USE_SOURCE, "Select the exact Canada Post or air-restricted branch from current status definitions."),
    78: audit(DIRECT, "KNO-COMMS-MEDIA-001", "", USE_SOURCE, "Use the current recording/media/public-communication restrictions and escalation."),
}


def load_source_path() -> Path:
    with SOURCE_INVENTORY_PATH.open(newline="", encoding="utf-8") as handle:
        rows = {row["source_id"]: row for row in csv.DictReader(handle)}
    relative = rows[SOURCE_ID]["local_archive_path"]
    path = WORKSPACE_ROOT / relative
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def column_index(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference)
    if not letters:
        raise ValueError(f"invalid cell reference: {cell_reference}")
    value = 0
    for character in letters.group(0):
        value = value * 26 + ord(character) - 64
    return value - 1


def read_first_sheet(path: Path) -> list[list[str]]:
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("a:si", ns):
                shared.append("".join(node.text or "" for node in item.findall(".//a:t", ns)))
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows: list[list[str]] = []
    for row_node in sheet.findall(".//a:sheetData/a:row", ns):
        values = [""] * 5
        for cell in row_node.findall("a:c", ns):
            index = column_index(cell.attrib["r"])
            if index >= len(values):
                continue
            cell_type = cell.attrib.get("t")
            if cell_type == "inlineStr":
                value = "".join(node.text or "" for node in cell.findall(".//a:t", ns))
            else:
                value_node = cell.find("a:v", ns)
                value = value_node.text if value_node is not None and value_node.text else ""
                if cell_type == "s" and value:
                    value = shared[int(value)]
            values[index] = value
        rows.append(values)
    return rows


def build_rows() -> list[dict[str, str]]:
    source_rows = read_first_sheet(load_source_path())
    if source_rows[0] != [
        "ID",
        "Category",
        "Situation (Driver Input)",
        "Bot Response / Steps",
        "Notes / Source",
    ]:
        raise ValueError(f"unexpected workbook header: {source_rows[0]}")
    output: list[dict[str, str]] = []
    seen_ids: set[int] = set()
    for workbook_row, values in enumerate(source_rows[1:], start=2):
        scenario_id = int(float(values[0]))
        seen_ids.add(scenario_id)
        source_payload = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
        row = {
            "scenario_id": str(scenario_id),
            "workbook_row": str(workbook_row),
            "category": values[1],
            "situation": values[2],
            "workbook_source_note": values[4],
            "source_row_sha256": hashlib.sha256(source_payload.encode("utf-8")).hexdigest(),
            **AUDIT_BY_ID[scenario_id],
        }
        output.append(row)
    expected_ids = set(range(1, 79))
    if seen_ids != expected_ids or set(AUDIT_BY_ID) != expected_ids:
        raise ValueError(
            f"scenario coverage mismatch: source={sorted(seen_ids)}, audit={sorted(AUDIT_BY_ID)}"
        )
    return output


def main() -> None:
    rows = build_rows()
    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} workbook-scenario coverage rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
