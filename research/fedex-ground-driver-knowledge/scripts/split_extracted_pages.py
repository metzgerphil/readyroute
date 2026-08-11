#!/usr/bin/env python3
"""Split page-marked PDF text created by extract_pdf_text.py into one file per page."""

from __future__ import annotations

import re
import sys
from pathlib import Path


PAGE_MARKER = re.compile(r"^===== PDF PAGE (\d+) =====$", re.MULTILINE)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: split_extracted_pages.py INPUT.txt OUTPUT_DIR", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    text = source.read_text(encoding="utf-8")
    matches = list(PAGE_MARKER.finditer(text))
    if not matches:
        raise SystemExit(f"no page markers found in {source}")

    output_dir.mkdir(parents=True, exist_ok=True)
    for index, match in enumerate(matches):
        page_number = int(match.group(1))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        page_text = text[start:end].strip() + "\n"
        (output_dir / f"page-{page_number:03d}.txt").write_text(page_text, encoding="utf-8")

    print(f"wrote {len(matches)} pages to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
