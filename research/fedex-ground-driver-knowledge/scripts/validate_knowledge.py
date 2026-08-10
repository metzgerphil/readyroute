#!/usr/bin/env python3
"""Validate the structural invariants of the Ready Route JSONL knowledge layer."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED = {
    "knowledge_id",
    "canonical_situation",
    "normalized_description",
    "authoritative_rule",
    "applicability",
    "conditions",
    "exceptions",
    "required_procedure",
    "required_documentation",
    "prohibited_actions",
    "escalation_requirements",
    "clarification_requirements",
    "related_knowledge_ids",
    "taxonomy_paths",
    "driver_question_variants",
    "concise_ready_route_answer",
    "more_info_answer",
    "evidence",
    "source_date_or_version",
    "knowledge_status",
    "review_notes",
    "created_at",
    "updated_at",
}
STATUSES = {"VERIFIED", "UNRESOLVED", "CONFLICT", "POTENTIALLY_OUTDATED", "HUMAN_REVIEW_REQUIRED"}


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("knowledge/records.jsonl")
    seen: set[str] = set()
    count = 0
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        count += 1
        try:
            record = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {exc}")
        missing = REQUIRED - record.keys()
        if missing:
            raise SystemExit(f"{path}:{line_number}: missing fields: {sorted(missing)}")
        knowledge_id = record["knowledge_id"]
        if knowledge_id in seen:
            raise SystemExit(f"{path}:{line_number}: duplicate knowledge_id: {knowledge_id}")
        seen.add(knowledge_id)
        if record["knowledge_status"] not in STATUSES:
            raise SystemExit(f"{path}:{line_number}: invalid knowledge_status")
        if not record["evidence"]:
            raise SystemExit(f"{path}:{line_number}: evidence is required")
        for item in record["evidence"]:
            for field in ("source_id", "locator", "evidence_summary", "reviewed_at"):
                if not item.get(field):
                    raise SystemExit(f"{path}:{line_number}: evidence missing {field}")
        for expected_step, step in enumerate(record["required_procedure"], 1):
            if step.get("step") != expected_step or not step.get("action"):
                raise SystemExit(f"{path}:{line_number}: procedure steps must be ordered from 1")
    print(f"validated {count} knowledge records from {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
