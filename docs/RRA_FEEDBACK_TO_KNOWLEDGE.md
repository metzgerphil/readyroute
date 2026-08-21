# Ready Route Answers feedback-to-knowledge procedure

Driver feedback is a review signal, not operational authority. A thumbs-down, comment, unanswered question, or field report must never rewrite a published answer automatically.

## 1. Capture and contain

1. Preserve the interaction, selected canonical record, exact question, rating, optional comment, actor, and timestamp.
2. When feedback is negative, suspend reuse of the matching answer-memory route immediately.
3. Keep the currently published canonical record unchanged until the review is resolved.
4. If the existing answer may be unsafe, use the normal knowledge-status or adjudication process to withhold or reopen it rather than silently editing it.

## 2. Review the report

1. Reproduce the exact question in the RRA test console and deterministic evaluation path.
2. Identify whether the issue is wording/retrieval, conversation context, presentation, stale information, or an incorrect operational procedure.
3. Compare the result with the active canonical record, its sources, conditions, exceptions, prohibitions, and adjudication trace.
4. Do not fill a missing operational fact with model knowledge or a plausible inference.

## 3. Establish authority

Use one of the two approved publication paths:

- `SOURCE_VERIFIED`: preserve and review applicable documentary evidence with exact locators.
- `READY_ROUTE_APPROVED`: preserve the exact product-owner-verified statement, approver, approval date, provenance, scope, reasoning, and reopen conditions.

Vlad-supplied information that Phillip has accepted is valid owner-approved authority within its preserved scope. New or materially different information must receive its own preserved evidence or owner determination.

## 4. Make the controlled change

1. Update the research/evidence workbench; do not hand-edit generated release artifacts.
2. Preserve earlier sources, interpretations, conflicts, and superseded adjudications.
3. Add the exact corrected question and answer expectation.
4. Add realistic paraphrases, shorthand, misspellings, ambiguity, neighboring-procedure boundaries, unsupported boundaries, and a multi-turn scenario when clarification is required.
5. Regenerate the canonical release with `npm run knowledge:release`.

## 5. Verify before publication

1. Run the record-by-record gold gate.
2. Run the complete three-pass stability gate.
3. Run the relevant backend, portal, and driver-app tests.
4. For AI interpretation changes, run repeated live-model shadow evaluations and retry transport timeouts separately from answer discrepancies.
5. Do not deploy or prepare TestFlight while any critical answer, traceability, unsupported-answer, conversation-state, or barcode test fails.

## 6. Close the loop

Record the disposition as one of:

- confirmed correction published;
- retrieval or presentation correction published without changing the approved procedure;
- existing answer confirmed correct;
- awaiting source or owner decision;
- duplicate report;
- outside the current Ready Route corpus.

Keep the report linked to its interaction and canonical record so the reason for the disposition remains auditable.
