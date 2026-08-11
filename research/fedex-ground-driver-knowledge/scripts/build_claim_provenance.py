#!/usr/bin/env python3
"""Build the deterministic claim-to-evidence traceability index."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RECORDS_PATH = ROOT / "knowledge/records.jsonl"
MAPPINGS_PATH = ROOT / "knowledge/source_to_knowledge.csv"
OUTPUT_PATH = ROOT / "knowledge/claim_provenance.jsonl"

SCALAR_FIELDS = (
    "authoritative_rule",
    "concise_ready_route_answer",
    "more_info_answer",
)

LIST_FIELDS = (
    "applicability",
    "conditions",
    "exceptions",
    "required_documentation",
    "prohibited_actions",
    "escalation_requirements",
    "clarification_requirements",
)


def load_records() -> list[dict]:
    return [
        json.loads(line)
        for line in RECORDS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def load_supported_scopes() -> dict[tuple[str, str, str], list[str]]:
    scopes: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    with MAPPINGS_PATH.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = (row["knowledge_id"], row["source_id"], row["locator"])
            scopes[key].append(row["supported_scope"])
    return {key: sorted(values) for key, values in scopes.items()}


def support_mode(field: str, knowledge_status: str) -> str:
    if field in {"concise_ready_route_answer", "more_info_answer"}:
        return (
            "SOURCE_GROUNDED_PRESENTATION"
            if knowledge_status == "VERIFIED"
            else "SOURCE_GROUNDED_PRESENTATION_WITH_STATUS_LIMIT"
        )
    if field == "clarification_requirements":
        return "SOURCE_GROUNDED_DECISION_LOGIC"
    return (
        "SOURCE_EVIDENCE_SET"
        if knowledge_status == "VERIFIED"
        else "SOURCE_EVIDENCE_AND_STATUS_LIMITATION"
    )


def traceability_control(refs: list[dict]) -> tuple[str, str, str]:
    source_count = len({ref["source_id"] for ref in refs})
    if len(refs) == 1:
        return (
            "SINGLE_EVIDENCE_FRAGMENT",
            "SINGLE_FRAGMENT_UNAMBIGUOUS",
            "TRACEABLE_TO_SINGLE_EXACT_RECORD_FRAGMENT",
        )
    if source_count == 1:
        return (
            "MULTI_FRAGMENT_SINGLE_SOURCE",
            "CLAIM_TO_FRAGMENT_ALLOCATION_REQUIRED",
            "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED",
        )
    return (
        "MULTI_SOURCE_EVIDENCE_SET",
        "CLAIM_TO_FRAGMENT_ALLOCATION_REQUIRED",
        "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED",
    )


def evidence_refs(
    record: dict,
    supported_scopes: dict[tuple[str, str, str], list[str]],
) -> list[dict]:
    refs: list[dict] = []
    for evidence in record["evidence"]:
        key = (
            record["knowledge_id"],
            evidence["source_id"],
            evidence["locator"],
        )
        refs.append(
            {
                "source_id": evidence["source_id"],
                "locator": evidence["locator"],
                "supported_scopes": supported_scopes[key],
                "reviewed_at": evidence["reviewed_at"],
            }
        )
    return refs


def claim_row(
    record: dict,
    field: str,
    item_index: int,
    claim_text: str,
    refs: list[dict],
) -> dict:
    traceability_class, allocation_status, trace_gate = traceability_control(refs)
    return {
        "claim_id": f"{record['knowledge_id']}::{field}::{item_index:03d}",
        "knowledge_id": record["knowledge_id"],
        "field": field,
        "item_index": item_index,
        "claim_text": claim_text,
        "support_mode": support_mode(field, record["knowledge_status"]),
        "knowledge_status": record["knowledge_status"],
        "traceability_class": traceability_class,
        "claim_evidence_allocation_status": allocation_status,
        "production_trace_gate": trace_gate,
        "evidence_refs": refs,
    }


def build_rows(records: list[dict]) -> list[dict]:
    supported_scopes = load_supported_scopes()
    rows: list[dict] = []
    for record in records:
        refs = evidence_refs(record, supported_scopes)
        for field in SCALAR_FIELDS:
            rows.append(claim_row(record, field, 0, record[field], refs))
        for field in LIST_FIELDS:
            for item_index, claim_text in enumerate(record[field], 1):
                rows.append(claim_row(record, field, item_index, claim_text, refs))
        for item_index, step in enumerate(record["required_procedure"], 1):
            if step["step"] != item_index:
                raise SystemExit(
                    f"{record['knowledge_id']}: nonsequential required_procedure"
                )
            rows.append(
                claim_row(
                    record,
                    "required_procedure",
                    item_index,
                    step["action"],
                    refs,
                )
            )
    return rows


def main() -> int:
    rows = build_rows(load_records())
    rendered = "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in rows
    )
    temporary_path = OUTPUT_PATH.with_suffix(".jsonl.tmp")
    temporary_path.write_text(rendered, encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"wrote {len(rows)} claim-provenance rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
