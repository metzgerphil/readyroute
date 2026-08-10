# Pending review

`records.jsonl` is generated from source records previously classified as conflict or human-review-required. `review-items.jsonl` converts each one into an actionable decision request with evidence, dates, applicability/condition differences, remaining uncertainty, and the decision needed. Use the detailed [human review queue](../../research/fedex-ground-driver-knowledge/reports/human_review_queue.md) and [conflict report](../../research/fedex-ground-driver-knowledge/reports/conflicts.md) to adjudicate them.

Pending records retain supported facts and evidence, but cannot independently produce definitive instructions. A resolution must be recorded through `../adjudications/records.json`.
