# Candidate driver-bot evaluation pack

Status date: 2026-08-10

These four files were supplied by the project owner as candidate evaluation material and are preserved byte-for-byte with `manifest.sha256`:

- `driver_bot_eval_pack.json`
- `eval_audit_report.md`
- `index.md`
- `messy_question_test_set.md`

They are **not canonical operational knowledge** and are not part of the production evaluation suite. Their expected answers do not carry canonical `knowledge_id`, knowledge status, source identity/version, evidence locator, or adjudication trace. Some instructions conflict with or exceed the eligible Ready Route release.

`candidate_eval_pack_profile.json` is deterministic diagnostic output from `scripts/audit_candidate_eval_pack.js`. Use the candidate prompts only after deduplication and record-level mapping to the canonical release. Preserve a separate holdout set so evaluation prompts are not silently added as retrieval synonyms before their generalization value is measured.

`candidate_canonical_mapping_queue.jsonl` contains the deduplicated 145-prompt union. Seventeen development prompts are now human-reviewed against the canonical delivery-status and pickup-reason reference layers and marked `MAPPED_TO_REFERENCE_EVALUATION`; the remaining 128 rows stay `NEEDS_CANONICAL_MAPPING`. Diagnostic retrieval is included only to prioritize review. The deterministic 32-prompt holdout remains untouched.

Regenerate and validate this intake with:

```sh
node scripts/audit_candidate_eval_pack.js
node scripts/validate_candidate_eval_pack.js
```
