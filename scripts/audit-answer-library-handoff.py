#!/usr/bin/env python3
"""Audit the production-ready Ready Route answer-library handoff."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "outputs" / "answer-library-v1" / "drive-complete"
ELIGIBLE = {"SOURCE_VERIFIED", "READY_ROUTE_APPROVED"}


def csv_rows(name: str) -> list[dict[str, str]]:
    with (LIBRARY / name).open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    faqs = csv_rows("master_faq.csv")
    catalog = csv_rows("image_catalog.csv")
    coverage = csv_rows("document_coverage.csv")
    runtime = LIBRARY / "runtime"
    bundle = json.loads((runtime / "bundle.json").read_text(encoding="utf-8"))
    manifest = json.loads((runtime / "manifest.json").read_text(encoding="utf-8"))

    faq_ids = [row["faq_id"] for row in faqs]
    eligible_ids = {
        row["faq_id"]
        for row in faqs
        if row["status"] == "published" and row["knowledge_status"] in ELIGIBLE
    }
    bundle_ids = {row["faq_id"] for row in bundle["records"]}
    noneligible_bundle_ids = sorted(
        row["faq_id"]
        for row in bundle["records"]
        if row["trace"]["knowledge_status"] not in ELIGIBLE
    )

    authoring_catalog = {row["image_filename"]: row for row in catalog}
    referenced_images = {
        image["filename"]
        for record in bundle["records"]
        for image in record.get("images", [])
    }
    missing_catalog_entries = sorted(referenced_images - set(authoring_catalog))
    missing_authoring_images = sorted(
        name for name in referenced_images if not (LIBRARY / "images" / name).is_file()
    )
    missing_runtime_images = sorted(
        name for name in referenced_images if not (runtime / "images" / name).is_file()
    )
    unexpected_runtime_images = sorted(
        path.name for path in (runtime / "images").glob("*") if path.name not in referenced_images
    )

    hash_failures = []
    for relative, expected in manifest["files"].items():
        path = runtime / relative
        if not path.is_file():
            hash_failures.append({"file": relative, "problem": "missing"})
        elif sha256(path) != expected:
            hash_failures.append({"file": relative, "problem": "sha256_mismatch"})

    routes = bundle.get("clarification_routes", {})
    routes_without_choices = []
    invalid_routes = []
    for name, route in routes.items():
        choices = route.get("choices", [])
        if not choices:
            routes_without_choices.append(name)
        for choice in choices:
            target = choice.get("target_faq_id")
            namespace = choice.get("target_namespace")
            if target and target not in bundle_ids:
                invalid_routes.append({"route": name, "target_faq_id": target})
            if namespace and namespace not in bundle.get("codes_index", {}):
                invalid_routes.append({"route": name, "target_namespace": namespace})

    codes = bundle.get("codes_index", {})
    code_counts = {namespace: len(values) for namespace, values in codes.items()}
    code_26_targets = {
        namespace: values.get("26") or values.get("026")
        for namespace, values in codes.items()
        if values.get("26") or values.get("026")
    }

    safe = not any([
        len(faq_ids) != len(set(faq_ids)),
        eligible_ids != bundle_ids,
        noneligible_bundle_ids,
        missing_catalog_entries,
        missing_authoring_images,
        missing_runtime_images,
        unexpected_runtime_images,
        hash_failures,
        routes_without_choices,
        invalid_routes,
        manifest["record_count"] != len(bundle["records"]),
        manifest["image_count"] != len(referenced_images),
    ])

    result = {
        "valid": safe,
        "library_path": str(LIBRARY),
        "bundle_version": bundle["bundle_version"],
        "faq": {
            "catalog_count": len(faqs),
            "unique_id_count": len(set(faq_ids)),
            "eligible_authoring_count": len(eligible_ids),
            "bundle_record_count": len(bundle["records"]),
            "record_types": dict(Counter(row["record_type"] for row in faqs)),
            "knowledge_statuses": dict(Counter(row["knowledge_status"] for row in faqs)),
            "eligible_catalog_bundle_id_match": eligible_ids == bundle_ids,
            "noneligible_bundle_ids": noneligible_bundle_ids,
        },
        "images": {
            "catalog_count": len(catalog),
            "runtime_referenced_count": len(referenced_images),
            "missing_catalog_entries": missing_catalog_entries,
            "missing_authoring_referenced": missing_authoring_images,
            "missing_runtime_referenced": missing_runtime_images,
            "unexpected_runtime_files": unexpected_runtime_images,
        },
        "manifest": {
            "declared_file_count": len(manifest["files"]),
            "declared_record_count": manifest["record_count"],
            "declared_image_count": manifest["image_count"],
            "hash_failures": hash_failures,
        },
        "clarifications": {
            "route_count": len(routes),
            "without_choices": routes_without_choices,
            "invalid_targets": invalid_routes,
        },
        "codes": {
            "namespaces": code_counts,
            "code_26_targets": code_26_targets,
            "code_26_is_namespaced": len(set(code_26_targets.values())) > 1,
        },
        "source_coverage": {
            "document_count": len(coverage),
            "review_statuses": dict(Counter(row["review_status"] for row in coverage)),
            "published_records_with_live_drive_evidence": sum(
                int(row["published_records"] or 0) for row in coverage
            ),
        },
    }

    output = LIBRARY / "audit" / "complete-handoff-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"\nWrote {output}")
    if not safe:
        raise SystemExit("Answer-library handoff audit failed")


if __name__ == "__main__":
    main()
