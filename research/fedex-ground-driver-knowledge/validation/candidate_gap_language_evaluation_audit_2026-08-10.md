# Candidate knowledge-gap evaluation audit

Status date: 2026-08-10

## Purpose

Twenty-one development prompts from the owner-supplied candidate pack cannot safely be forced onto a definitive canonical procedure. This evaluation lane preserves them as explicit knowledge gaps or insufficient-context boundaries rather than accepting the candidate pack's proposed answers or selecting a merely plausible record.

Each case records its source candidate ID, gap type, related canonical knowledge and reference IDs, information sufficiency, expected response mode, required acquisition or clarification, safe boundary, and prohibited behavior. All cases are drawn only from the development partition; the 32-prompt deterministic holdout remains untouched.

## Current distribution

- Source or current-workflow gaps: call tag absent from the list, backing, customer tracking and post-delivery inquiry, pickup relocation, police-notification authority, knocking requirements, low-clearance handling, unknown FORGE messages, wrong pickup address, railroad crossings, tracking discrepancy, and forms selection.
- Insufficient-context prompts: generic pickup acceptance, generic “can I take this,” unidentified object/screen, and unspecified forms.
- Glossary or version gaps: CPC, DVIR, FCC, PRC, and unknown FORGE alert language where the corpus does not establish a complete current driver-facing meaning or procedure.

## Safety boundary

These cases do not independently authorize operational instructions. `ESCALATE` cases preserve the absence of current controlling evidence; `CLARIFY` cases require the missing situation before record selection. Related canonical IDs are investigative links, not answer authority.

The generated release includes `knowledge/evaluations/candidate-gap-language-cases.jsonl`. The release validator checks every related knowledge/reference foreign key and required boundary field. The full corpus validator additionally enforces the exact development candidate trace and rejects holdout contamination or queue drift.
