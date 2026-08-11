#!/usr/bin/env python3
"""Build claim-to-evidence-fragment allocation coverage and production gates."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLAIMS_PATH = ROOT / "knowledge/claim_provenance.jsonl"
OVERRIDES_PATH = ROOT / "validation/claim_evidence_allocation_overrides.jsonl"
OUTPUT_PATH = ROOT / "knowledge/claim_evidence_allocation_coverage.jsonl"


def load_jsonl(path: Path) -> list[dict]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def ref_key(ref: dict) -> tuple[str, str]:
    return ref["source_id"], ref["locator"]


def build_rows() -> list[dict]:
    claims = load_jsonl(CLAIMS_PATH)
    overrides = load_jsonl(OVERRIDES_PATH)
    override_by_claim: dict[str, dict] = {}
    for override in overrides:
        claim_id = override["claim_id"]
        if claim_id in override_by_claim:
            raise ValueError(f"duplicate allocation override: {claim_id}")
        override_by_claim[claim_id] = override

    claim_ids = {claim["claim_id"] for claim in claims}
    stale_overrides = set(override_by_claim) - claim_ids
    if stale_overrides:
        raise ValueError(f"allocation overrides reference unknown claims: {sorted(stale_overrides)}")

    rows: list[dict] = []
    for claim in claims:
        record_refs = claim["evidence_refs"]
        record_ref_keys = {ref_key(ref) for ref in record_refs}
        override = override_by_claim.get(claim["claim_id"])
        if len(record_refs) == 1:
            if override:
                raise ValueError(
                    f"single-fragment claim must not have an override: {claim['claim_id']}"
                )
            allocated_refs = [
                {
                    "source_id": record_refs[0]["source_id"],
                    "locator": record_refs[0]["locator"],
                }
            ]
            allocation_status = "AUTO_ALLOCATED_SINGLE_FRAGMENT"
            allocation_basis = (
                "The record has one exact evidence fragment, so no competing fragment "
                "allocation exists."
            )
            reviewed_at = record_refs[0]["reviewed_at"]
            production_trace_gate = "CLAIM_FRAGMENT_TRACE_READY"
        elif override:
            allocated_refs = override["allocated_evidence_refs"]
            allocated_keys = {ref_key(ref) for ref in allocated_refs}
            if (
                not allocated_refs
                or len(allocated_keys) != len(allocated_refs)
                or not allocated_keys.issubset(record_ref_keys)
                or not override["allocation_basis"]
                or not override["reviewed_at"]
            ):
                raise ValueError(
                    f"invalid allocation override for {claim['claim_id']}"
                )
            allocation_status = "HUMAN_ALLOCATED_MULTI_FRAGMENT"
            allocation_basis = override["allocation_basis"]
            reviewed_at = override["reviewed_at"]
            production_trace_gate = "CLAIM_FRAGMENT_TRACE_READY"
        else:
            allocated_refs = []
            allocation_status = "PENDING_MULTI_FRAGMENT_REVIEW"
            allocation_basis = (
                "The exact record evidence set contains multiple fragments; no claim-level "
                "fragment allocation has been reviewed."
            )
            reviewed_at = ""
            production_trace_gate = (
                "WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED"
            )

        rows.append(
            {
                "claim_id": claim["claim_id"],
                "knowledge_id": claim["knowledge_id"],
                "field": claim["field"],
                "item_index": claim["item_index"],
                "claim_text": claim["claim_text"],
                "knowledge_status": claim["knowledge_status"],
                "record_evidence_fragment_count": len(record_refs),
                "record_evidence_source_count": len(
                    {ref["source_id"] for ref in record_refs}
                ),
                "allocation_status": allocation_status,
                "allocated_evidence_refs": allocated_refs,
                "allocation_basis": allocation_basis,
                "reviewed_at": reviewed_at,
                "production_trace_gate": production_trace_gate,
            }
        )

    return rows


def main() -> int:
    rows = build_rows()
    rendered = "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in rows
    )
    temporary_path = OUTPUT_PATH.with_suffix(".jsonl.tmp")
    temporary_path.write_text(rendered, encoding="utf-8")
    temporary_path.replace(OUTPUT_PATH)
    print(f"wrote {len(rows)} claim-evidence allocation rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
