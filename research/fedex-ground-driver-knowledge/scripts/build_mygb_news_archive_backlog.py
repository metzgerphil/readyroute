#!/usr/bin/env python3
"""Build exact monthly MyGroundBiz news-archive discovery coverage."""

from __future__ import annotations

import csv
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent.parent
LINKS_PATH = ROOT / "captures/mygroundbiz/recent_customer_alerts_2026-08-06_links.csv"
OUTPUT_PATH = ROOT / "inventory/mygroundbiz_news_archive_backlog.csv"
SOURCE_ID = "SRC-MGB-PAGE-0023"
ARCHIVE_RE = re.compile(r"^\d{4}-\d{2}$")

FIELDS = [
    "archive_id",
    "parent_source_id",
    "link_order",
    "archive_label",
    "year_month",
    "url",
    "discovery_locator",
    "access_status",
    "review_status",
    "relevance_status",
    "acquisition_status",
    "required_action",
]


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def build_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for link in load_csv(LINKS_PATH):
        query = parse_qs(urlparse(link["url"]).query)
        archive_values = query.get("archive", [])
        if not archive_values:
            continue
        if len(archive_values) != 1 or not ARCHIVE_RE.fullmatch(archive_values[0]):
            raise ValueError(f"invalid archive URL parameter: {link}")
        year_month = archive_values[0]
        expected_label = datetime.strptime(year_month, "%Y-%m").strftime("%B %Y")
        if link["link_text"].strip() != expected_label:
            raise ValueError(
                f"archive label/date mismatch: {link['link_text']!r} != {expected_label!r}"
            )
        rows.append(
            {
                "archive_id": f"MGB-ARCHIVE-{len(rows) + 1:04d}",
                "parent_source_id": SOURCE_ID,
                "link_order": link["link_order"],
                "archive_label": expected_label,
                "year_month": year_month,
                "url": link["url"],
                "discovery_locator": (
                    "Recent Customer Alerts link inventory row "
                    f"{int(link['link_order']) + 1} (link order {link['link_order']})"
                ),
                "access_status": "AUTHENTICATED_LINK_DISCOVERED",
                "review_status": "NOT_YET_REVIEWED",
                "relevance_status": "POTENTIALLY_RELEVANT",
                "acquisition_status": "NOT_ACQUIRED",
                "required_action": (
                    "Open while authenticated; durably capture the complete archive page; "
                    "inventory every article and pagination link; assess each article under the broad "
                    "driver-operational inclusion standard; do not treat archive or article titles as evidence."
                ),
            }
        )
    return rows


def main() -> int:
    rows = build_rows()
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} MyGroundBiz news-archive backlog rows to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
