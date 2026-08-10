#!/usr/bin/env python3
"""Build a deterministic retrieval-oracle index for embedded and supplemental variants."""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
RECORDS_PATH = ROOT / "knowledge/records.jsonl"
SUPPLEMENTAL_PATH = ROOT / "validation/supplemental_driver_variants.jsonl"
OUTPUT_PATH = ROOT / "validation/driver_variant_index.jsonl"
NEAR_COLLISION_THRESHOLD = 0.78


def normalize_driver_text(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def load_records() -> list[dict]:
    return [
        json.loads(line)
        for line in RECORDS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def load_supplemental_variants() -> list[dict]:
    return [
        json.loads(line)
        for line in SUPPLEMENTAL_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def surface_length(token_count: int) -> str:
    if token_count <= 3:
        return "VERY_SHORT"
    if token_count <= 5:
        return "SHORT"
    return "EXTENDED"


def build_rows(
    records: list[dict], supplemental_variants: list[dict] | None = None
) -> list[dict]:
    if supplemental_variants is None:
        supplemental_variants = load_supplemental_variants()
    supplemental_by_knowledge: dict[str, list[dict]] = {}
    for item in supplemental_variants:
        supplemental_by_knowledge.setdefault(item["knowledge_id"], []).append(item)

    entries: list[dict] = []
    for record in records:
        for variant_index, utterance in enumerate(record["driver_question_variants"], 1):
            normalized = normalize_driver_text(utterance)
            token_count = len(normalized.split())
            entries.append(
                {
                    "variant_id": f"{record['knowledge_id']}::VAR::{variant_index:03d}",
                    "knowledge_id": record["knowledge_id"],
                    "variant_index": variant_index,
                    "utterance": utterance,
                    "normalized_utterance": normalized,
                    "token_count": token_count,
                    "surface_length": surface_length(token_count),
                    "contains_digit": any(character.isdigit() for character in utterance),
                    "knowledge_status": record["knowledge_status"],
                    "variant_source": "EMBEDDED_RECORD",
                    "variant_type": "",
                    "near_collision_knowledge_ids": [],
                }
            )
        for supplemental_index, item in enumerate(
            supplemental_by_knowledge.get(record["knowledge_id"], []), 1
        ):
            variant_index = len(record["driver_question_variants"]) + supplemental_index
            utterance = item["utterance"]
            normalized = normalize_driver_text(utterance)
            token_count = len(normalized.split())
            entries.append(
                {
                    "variant_id": f"{record['knowledge_id']}::VAR::{variant_index:03d}",
                    "knowledge_id": record["knowledge_id"],
                    "variant_index": variant_index,
                    "utterance": utterance,
                    "normalized_utterance": normalized,
                    "token_count": token_count,
                    "surface_length": surface_length(token_count),
                    "contains_digit": any(
                        character.isdigit() for character in utterance
                    ),
                    "knowledge_status": record["knowledge_status"],
                    "variant_source": item["supplemental_variant_id"],
                    "variant_type": item["variant_type"],
                    "near_collision_knowledge_ids": [],
                }
            )

    unknown_supplemental_records = sorted(
        set(supplemental_by_knowledge)
        - {record["knowledge_id"] for record in records}
    )
    if unknown_supplemental_records:
        raise ValueError(
            f"supplemental variants reference unknown records: "
            f"{unknown_supplemental_records}"
        )

    for index, left in enumerate(entries):
        collisions: set[str] = set()
        for right in entries:
            if left["knowledge_id"] == right["knowledge_id"]:
                continue
            if (
                SequenceMatcher(
                    None,
                    left["normalized_utterance"],
                    right["normalized_utterance"],
                ).ratio()
                >= NEAR_COLLISION_THRESHOLD
            ):
                collisions.add(right["knowledge_id"])
        left["near_collision_knowledge_ids"] = sorted(collisions)
    return entries


def main() -> int:
    rows = build_rows(load_records(), load_supplemental_variants())
    normalized = [row["normalized_utterance"] for row in rows]
    if len(normalized) != len(set(normalized)):
        raise SystemExit("normalized driver variants are not unique")
    rendered = "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in rows
    )
    temporary_path = OUTPUT_PATH.with_suffix(".jsonl.tmp")
    temporary_path.write_text(rendered, encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"wrote {len(rows)} driver-variant rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
