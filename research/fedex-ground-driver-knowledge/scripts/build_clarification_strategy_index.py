#!/usr/bin/env python3
"""Build the deterministic minimal-clarification strategy index."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = ROOT / "validation/driver_language_cases.jsonl"
OUTPUT_PATH = ROOT / "validation/clarification_strategy_index.jsonl"


STRATEGY_BY_RESPONSE_MODE = {
    "DIRECT_SOURCE_GROUNDED_ANSWER": (
        "ANSWER_WITHOUT_CLARIFICATION",
        "STOP_WITHOUT_QUESTION",
    ),
    "ASK_MINIMUM_CLARIFICATION": (
        "ASK_LISTED_DISCRIMINATORS_IN_ORDER",
        "STOP_WHEN_APPROVED_BRANCH_IS_IDENTIFIED",
    ),
    "IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY": (
        "STATE_IMMEDIATE_SAFETY_ACTION_THEN_ASK_LISTED_DISCRIMINATORS",
        "STOP_WHEN_IMMEDIATE_SAFETY_IS_ADDRESSED_AND_APPROVED_BRANCH_IS_IDENTIFIED",
    ),
    "WITHHOLD_DISPUTED_STEP_AND_ESCALATE": (
        "DISCLOSE_CONFLICT_THEN_GATHER_ONLY_ESCALATION_CONTEXT",
        "STOP_WHEN_CONFLICT_SCOPE_AND_ESCALATION_TARGET_ARE_IDENTIFIED",
    ),
    "STATE_SOURCE_LIMIT_AND_ESCALATE": (
        "STATE_SOURCE_LIMIT_THEN_GATHER_ONLY_REVIEW_CONTEXT",
        "STOP_WHEN_SUPPORTED_SUBSET_AND_REVIEW_OWNER_ARE_IDENTIFIED",
    ),
    "QUALIFY_AND_REQUIRE_CURRENT_VERSION_CHECK": (
        "STATE_VERSION_LIMIT_THEN_GATHER_ONLY_CONFIRMATION_CONTEXT",
        "STOP_WHEN_CURRENT_VERSION_OR_CONTROLLING_SOURCE_IS_CONFIRMED",
    ),
}


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def load_cases() -> list[dict]:
    return [
        json.loads(line)
        for line in CASES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def build_rows(cases: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for case in cases:
        response_mode = case["response_mode"]
        if response_mode not in STRATEGY_BY_RESPONSE_MODE:
            raise ValueError(f"unknown response mode for {case['case_id']}: {response_mode}")
        clarifications = case["must_clarify"]
        normalized = [normalize(value) for value in clarifications]
        if len(normalized) != len(set(normalized)):
            raise ValueError(f"duplicate clarification in {case['case_id']}")
        if response_mode == "DIRECT_SOURCE_GROUNDED_ANSWER" and clarifications:
            raise ValueError(f"direct-answer case asks a clarification: {case['case_id']}")
        if response_mode != "DIRECT_SOURCE_GROUNDED_ANSWER" and not clarifications:
            raise ValueError(f"non-direct case has no clarification context: {case['case_id']}")
        strategy, stop_rule = STRATEGY_BY_RESPONSE_MODE[response_mode]
        rows.append(
            {
                "case_id": case["case_id"],
                "utterance": case["utterance"],
                "expected_knowledge_ids": case["expected_knowledge_ids"],
                "information_sufficiency": case["information_sufficiency"],
                "response_mode": response_mode,
                "clarification_strategy": strategy,
                "clarification_count": len(clarifications),
                "ordered_clarifications": clarifications,
                "stop_rule": stop_rule,
            }
        )
    return rows


def main() -> int:
    rows = build_rows(load_cases())
    rendered = "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in rows
    )
    temporary_path = OUTPUT_PATH.with_suffix(".jsonl.tmp")
    temporary_path.write_text(rendered, encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"wrote {len(rows)} clarification-strategy rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
