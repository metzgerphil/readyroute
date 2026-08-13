#!/usr/bin/env python3
"""Validate and publish the authored Ready Route Drive FAQ bundle."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "outputs/answer-library-v1/drive-complete/master_faq.csv"
IMAGE_DIR = ROOT / "outputs/answer-library-v1/drive-complete/images"
OUT = ROOT / "outputs/answer-library-v1/drive-complete"
RUNTIME = OUT / "runtime"
ROUTING = ROOT / "config/answer-library-routing.json"
VERSION = "2026-08-13.1"

rows = list(csv.DictReader(SRC.open()))
errors: list[str] = []
seen_ids: set[str] = set()
codes: dict[str, dict[str, str]] = {}
route_config = json.loads(ROUTING.read_text(encoding="utf-8"))
image_names = {p.name for p in IMAGE_DIR.glob("*.png")}
published_drive_images = {
    "FAQ-CALLTAG-FORGE-01.png", "FAQ-CALLTAG-FORGE-02.png",
    "FAQ-CALLTAG-FORGE-03.png",
}
published_drive_images.update(image_names)

required = {
    "faq_id", "record_type", "category", "question", "aliases",
    "short_answer", "source_doc", "source_page_or_locator", "status",
    "content_version", "last_updated", "source_record_id", "knowledge_status",
}

bundle_records = []
for row_number, row in enumerate(rows, 2):
    if row["status"] != "published":
        continue
    missing = sorted(k for k in required if not row.get(k, "").strip())
    if missing:
        errors.append(f"row {row_number}: missing {', '.join(missing)}")
    faq_id = row["faq_id"].strip()
    if faq_id in seen_ids:
        errors.append(f"row {row_number}: duplicate faq_id {faq_id}")
    seen_ids.add(faq_id)
    if row["knowledge_status"] not in {"SOURCE_VERIFIED", "READY_ROUTE_APPROVED"}:
        errors.append(f"row {row_number}: non-eligible knowledge status {row['knowledge_status']}")
    code = row.get("code", "").strip()
    namespace = row.get("code_namespace", "").strip()
    if code:
        if not namespace:
            errors.append(f"row {row_number}: code has no namespace: {code}")
        if not re.fullmatch(r"\d{1,3}", code):
            errors.append(f"row {row_number}: exact code must be three digits: {code}")
        namespace_codes = codes.setdefault(namespace, {})
        if code in namespace_codes:
            errors.append(f"row {row_number}: duplicate exact code {namespace}:{code}")
        namespace_codes[code] = faq_id
    images = [x.strip() for x in row.get("image_filenames", "").split("|") if x.strip()]
    for image in images:
        if image not in published_drive_images:
            errors.append(f"row {row_number}: image not present in published image set: {image}")
    bundle_records.append({
        "faq_id": faq_id,
        "record_type": row["record_type"],
        "category": row["category"],
        "question": row["question"],
        "aliases": [x.strip() for x in row["aliases"].split("|") if x.strip()],
        "short_answer": row["short_answer"],
        "code": code or None,
        "code_namespace": namespace or None,
        "steps": [x.strip() for x in row.get("steps", "").split("|") if x.strip()],
        "clarification": None,
        "decision_variables": [x.strip() for x in row.get("decision_variables", "").split("|") if x.strip()],
        "prohibited": [x.strip() for x in row.get("prohibited", "").split("|") if x.strip()],
        "images": [
            {"filename": name, "caption": caption}
            for name, caption in zip(
                images,
                [x.strip() for x in row.get("image_captions", "").split("|")]
                + [""] * len(images),
            )
        ],
        "trace": {
            "source_record_id": row["source_record_id"],
            "knowledge_status": row["knowledge_status"],
            "source_doc": row["source_doc"],
            "source_locator": row["source_page_or_locator"],
            "content_version": row["content_version"],
            "last_updated": row["last_updated"],
        },
    })

bundle_ids = {record["faq_id"] for record in bundle_records}
for route_name, route in route_config["clarification_routes"].items():
    choices = route.get("choices", [])
    if not choices:
        errors.append(f"clarification route {route_name} has no choices")
    for choice in choices:
        target = choice.get("target_faq_id")
        if target and target not in bundle_ids:
            errors.append(f"clarification route {route_name} has missing target {target}")

for namespace, aliases in route_config.get("code_aliases", {}).items():
    namespace_codes = codes.setdefault(namespace, {})
    for code, target in aliases.items():
        if target not in bundle_ids:
            errors.append(f"code alias {namespace}:{code} has missing target {target}")
        elif code in namespace_codes and namespace_codes[code] != target:
            errors.append(f"code alias collision {namespace}:{code}")
        else:
            namespace_codes[code] = target

if errors:
    raise SystemExit("\n".join(errors))

payload = {
    "schema_version": "1.2.0",
    "bundle_version": VERSION,
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "source": "Ready Route Master FAQ (Drive-authority canonical export)",
    "runtime_rules": {
        "steps_are_verbatim": True,
        "model_may_select_only": False,
        "model_may_compose_from_selected_records": True,
        "model_may_not_add_operational_facts": True,
        "model_must_return_field_grounding": True,
        "invalid_model_output_falls_back_to_deterministic_answer": True,
        "no_match_returns_verified_answer_unavailable": True,
        "all_codes_are_namespaced": True,
        "ambiguous_bare_code_requires_clarification": True,
        "clarification_targets_must_be_published": True,
    },
    "codes_index": codes,
    "clarification_routes": route_config["clarification_routes"],
    "records": bundle_records,
}
bundle_path = OUT / f"ready-route-answer-bundle-{VERSION}.json"
bundle_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
digest = hashlib.sha256(bundle_path.read_bytes()).hexdigest()
report = {
    "valid": True,
    "bundle_version": VERSION,
    "record_count": len(bundle_records),
    "exact_code_count_by_namespace": {namespace: len(values) for namespace, values in codes.items()},
    "records_with_images": sum(bool(r["images"]) for r in bundle_records),
    "referenced_image_count": len({i["filename"] for r in bundle_records for i in r["images"]}),
    "sha256": digest,
    "validation_errors": [],
}
(OUT / f"validation-report-{VERSION}.json").write_text(json.dumps(report, indent=2) + "\n")

# Build a clean, directly packageable runtime directory. Only images referenced
# by published records are copied; cataloged review/withheld assets stay outside
# the driver bundle.
runtime_next = OUT / "runtime.next"
if runtime_next.exists():
    shutil.rmtree(runtime_next)
(runtime_next / "images").mkdir(parents=True)
runtime_bundle = runtime_next / "bundle.json"
runtime_bundle.write_bytes(bundle_path.read_bytes())
referenced_images = sorted({
    image["filename"]
    for record in bundle_records
    for image in record["images"]
})
for image_name in referenced_images:
    shutil.copy2(IMAGE_DIR / image_name, runtime_next / "images" / image_name)

runtime_files = [runtime_bundle, *(runtime_next / "images").glob("*.png")]
runtime_manifest = {
    "schema_version": "1.0.0",
    "bundle_version": VERSION,
    "bundle": "bundle.json",
    "record_count": len(bundle_records),
    "image_count": len(referenced_images),
    "files": {
        str(path.relative_to(runtime_next)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(runtime_files)
    },
}
(runtime_next / "manifest.json").write_text(
    json.dumps(runtime_manifest, indent=2) + "\n"
)
if RUNTIME.exists():
    shutil.rmtree(RUNTIME)
runtime_next.rename(RUNTIME)
print(json.dumps(report, indent=2))
