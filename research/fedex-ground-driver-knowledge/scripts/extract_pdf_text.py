from __future__ import annotations

import argparse
from pathlib import Path

from pypdf import PdfReader


def extract_pdf(input_path: Path, output_path: Path) -> None:
    reader = PdfReader(str(input_path))
    parts: list[str] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        parts.append(f"===== PDF PAGE {page_number} =====\n{text.strip()}\n")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(parts), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()

    for input_path in sorted(args.input_directory.glob("*.pdf")):
        output_path = args.output_directory / f"{input_path.stem}.txt"
        extract_pdf(input_path, output_path)


if __name__ == "__main__":
    main()
