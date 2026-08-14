# Ready Route answer-library runtime connection

## Current handoff

The publishable driver-answer bundle is generated at:

`outputs/answer-library-v1/drive-complete/runtime/`

The mobile application must read the versioned bundle produced there. It must not query Google Drive, source PDFs, or the raw research corpus during a driver question.

The bundle contains human-authored answer records, exact code mappings, image assets, version metadata, and checksums. Written steps remain authoritative; images are supporting references and never override the record text.

## Runtime behavior

1. Load and verify the published bundle version and checksums.
2. Cache the last valid bundle on the device for offline use.
3. Normalize a typed or transcribed question.
4. If the question contains an operational code, use the exact code index within its authored namespace and do not use AI.
   - Supported namespaces are currently `delivery_status`, `pickup_reason`, and `call_tag_status`.
   - A bare code that exists in more than one namespace must trigger the authored `code_namespace` clarification instead of guessing. For example, code `26` can mean a delivery status or a pickup reason.
5. Otherwise retrieve a small set of candidate FAQ records.
6. If AI is used for candidate selection, it may return only one candidate `faq_id` or `NONE`.
7. After eligible records are selected, AI may organize, combine, or paraphrase their supported content into a clearer driver-facing answer. It may not add an operational fact, code, number, condition, exception, prohibition, step, or escalation instruction that is absent from those selected records.
   - Every populated output section must identify the selected `knowledge_id` and exact source field paths that support it.
   - Invalid, incomplete, or ungrounded output is discarded and the deterministic human-authored answer is shown instead.
   - Exact code/reference lookups do not use AI.
8. Display referenced images from the selected records. Runtime clarification choices and routes come from `clarification_routes` in the published bundle and are never improvised by the model.
9. If no verified record matches, show the authored escalation response instead of guessing.
10. Log the query, selected `faq_id`, bundle version, response, composition mode, field-level grounding, feedback, and escalation outcome.

## Integration checklist

- Add a bundle loader with checksum verification and rollback to the last valid bundle.
- Add version-aware local caching for JSON and referenced image assets.
- Implement namespaced exact-code normalization and lookup before semantic retrieval.
- Implement candidate retrieval against only published FAQ records.
- Constrain model selection to candidate IDs plus `NONE`.
- Permit answer composition only after eligible records are selected, validate field-level grounding, and fall back deterministically on any unsupported output.
- Keep exact code/reference responses deterministic and render record images without model modification.
- Preserve authored clarification branches and conversation context.
- Add the verified no-match/escalation path.
- Record Helpful/Not Helpful feedback with company, driver, query, `faq_id`, and bundle version.
- Run the regression set before every bundle publish.

Production answers are restricted to records whose canonical status is `SOURCE_VERIFIED` or `READY_ROUTE_APPROVED`. Draft, retired, pending-review, potentially-outdated, and insufficient-evidence content is excluded from the runtime bundle.

## Repeatable release checks

Run the complete answer-library release check before connecting or publishing a new bundle:

```bash
npm run answer-library:release-check
```

This rebuilds the authoring catalog and runtime bundle, runs deterministic matcher tests, runs the adversarial retrieval set, verifies image and manifest integrity, validates clarification targets, and checks the namespaced code index.

## Publishing private image assets

The canonical knowledge importer detects the local runtime bundle, uploads its referenced PNG files to the private `driver-help-images` bucket, and stores only versioned paths and captions on published knowledge records:

```bash
cd backend
npm run knowledge:import
```

Run that command from an approved workspace containing `outputs/answer-library-v1/drive-complete/runtime/`. A clean CI checkout does not contain the private image bytes; in that environment the importer leaves existing image mappings unchanged instead of clearing them. The driver-help API generates short-lived signed URLs only for images belonging to the selected verified answer.

## Readiness boundary

The answer library is prepared for application wiring after its build and validation checks pass. This document does not authorize a deployment, TestFlight submission, EAS build, or replacement of the existing frontend.
