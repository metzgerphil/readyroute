# Validation workspace

Validation is iterative and cannot be declared complete until source extraction and reconciliation are complete.

- driver_language_cases.jsonl contains source-grounded retrieval/clarification cases.
- Cases include shorthand, misspellings, incomplete facts, ambiguity, and interacting procedures.
- A case passes only if it maps to the expected record set, respects status such as CONFLICT or HUMAN_REVIEW_REQUIRED, asks all required material clarifications, and does not add unsupported instructions.
- Every current operational record has at least one case; the integrity validator fails if later records are added without coverage.
- Each case declares `information_sufficiency` and `response_mode`, separating a direct answer from clarification, version confirmation, source-limit escalation, or conflict withholding.
- `clarification_strategy_index.jsonl` gives every case an ordered minimal-fact strategy and stop rule; `clarification_minimality_audit.md` documents the one-to-one coverage and safety/status sequencing controls.
- `driver_language_validation_report.md` records coverage, failures found, limits, and remaining validation work.
- `form_and_physical_artifact_coverage_audit.md` verifies form/card/sheet/label/manifest coverage and prevents unidentified or outdated specimens from becoming approved procedures.
- `source_knowledge_coverage_audit.md` reconciles every source-inventory row to exact mapping counts and requires an explicit disposition for every zero-mapping source.
- `source_capture_coverage_audit.md` reconciles every source-inventory row to durable archive, checksum, review-artifact, and reproducibility status so review completion cannot conceal a missing source capture.
- `evidence_capture_risk_audit.md` projects capture status onto all knowledge evidence sets and separates operational verification from production evidence reproducibility.
- `claim_evidence_allocation_audit.md` reconciles every substantive claim to an automatic single-fragment allocation, reviewed multi-fragment allocation, or explicit pending production trace gate.
- `record_language_surface_audit.md` and `record_language_surface_coverage.csv` enforce both terse and context-rich wording for every operational record.
- `taxonomy_readiness_audit.md` projects record status, evidence capture, and acquisition dependencies onto all taxonomy nodes.
- `referenced_source_backlog_audit.md` reconciles all missing-source obligations and the exact source/page/section occurrences that created them.
- `workbook_scenario_coverage.csv` and `adversarial_workbook_gap_report.md` reconcile every row of the secondary 78-scenario workbook to authoritative records/reference data, explicit conditions, human review, current-source contradictions, version limits, or named source gaps without treating workbook answers as authority.
- Future passes must add cases for every newly discovered record and expand adversarial cases across interacting taxonomy branches.
