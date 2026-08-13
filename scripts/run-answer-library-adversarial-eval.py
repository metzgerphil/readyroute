#!/usr/bin/env python3
"""Run the deterministic answer-library adversarial regression set."""

from __future__ import annotations

import json
from pathlib import Path

from answer_library_matcher import AnswerLibraryMatcher


ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "tests" / "answer_library_adversarial_cases.json"
OUTPUT = ROOT / "outputs" / "answer-library-v1" / "drive-complete" / "audit" / "adversarial-evaluation.json"


def main() -> None:
    matcher = AnswerLibraryMatcher()
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    results = []
    passed = 0
    for case in cases:
        actual = matcher.match(case["query"])
        expected = {key: value for key, value in case.items() if key != "query"}
        comparison = {key: actual.get(key) for key in expected}
        ok = comparison == expected
        passed += int(ok)
        results.append({
            "query": case["query"],
            "expected": expected,
            "actual": comparison,
            "passed": ok,
        })

    report = {
        "valid": passed == len(cases),
        "case_count": len(cases),
        "passed": passed,
        "failed": len(cases) - passed,
        "results": results,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("valid", "case_count", "passed", "failed")}, indent=2))
    print(f"Wrote {OUTPUT}")
    if not report["valid"]:
        raise SystemExit("Adversarial evaluation failed")


if __name__ == "__main__":
    main()
