# Ready Route Answers knowledge system

## Current state

This is the controlled Ready Route Answers v2 corpus created on 2026-08-15 and expanded only through tested, source-grounded batches. The active release contains operational records, source-backed code references, adjudications, and evaluation cases. Refer to `manifest.json` for the current generated counts and checksums.

Ready Route Answers accepts two publication paths: documentary source verification and explicit Ready Route product-owner verification. Owner-provided operational knowledge does not require a matching PDF, but it must be preserved as an approved adjudication with exact scope and provenance. General model knowledge and plausible inference remain prohibited.

## Active locations

- `operations/records.jsonl` — generated canonical operational records.
- `operations/publication-ready.jsonl` — definitive operational answer records.
- `reference/delivery-status-codes.jsonl` — source-backed delivery/status code definitions.
- `reference/pickup-reason-codes.jsonl` — source-backed pickup reason-code definitions.
- `sources/registry.jsonl` — accepted sources.
- `adjudications/records.json` — explicit Ready Route decisions.
- `../research/fedex-ground-driver-knowledge/` — authoring and evidence workbench.
- `manifest.json` — generated counts and checksums proving the active release state.

## Code-reference coverage

The active reference dictionary includes every unique delivery/status code listed in the preserved OP-117 status table plus Code 030 from the MGB-119 core card, and every pickup reason visible in the preserved MGB-119 card or OP-117 FORGE list. This currently totals 50 delivery/status definitions and 13 pickup definitions.

These are definition records, not blanket authorization to select a code. Detailed procedures remain separate operational records. Code 030 and pickup Code 13 are explicitly definition-only because the reviewed material supplies a label but not the complete operating condition. The official OP-321 Pickup Reason Codes Card and OP-324 Service Measurement Status Codes Reference Card are not currently preserved in the corpus; obtaining them is required before claiming coverage beyond the codes visible in the current source set.

## Adding the replacement corpus

1. Preserve each supplied source's original identity and bytes in the private source area.
2. Register the source before extracting claims.
3. Create narrowly scoped records with exact evidence locators or an exact owner-verification trace.
4. When the product owner verifies a procedure without documentary support, preserve it through a `READY_ROUTE_APPROVED` adjudication instead of labeling it source-verified.
5. Mark unresolved, conflicting, or version-sensitive material as ineligible for definitive answers unless the product owner explicitly resolves it.
6. Add real driver-language evaluation cases.
7. Run `npm run knowledge:release`.
8. Review the manifest and evaluation results before importing anything into an answer environment.

The archived v1 corpus is documented in `docs/ready-route-answers-reset-2026-08-15.md`. It is not part of this active knowledge system.
