# Ready Route Answers knowledge system

## Current state

This is the clean v2 baseline created on 2026-08-15. The active corpus intentionally contains no operational sources, records, references, adjudications, aliases, or evaluation cases.

Ready Route Answers accepts two publication paths: documentary source verification and explicit Ready Route product-owner verification. Owner-provided operational knowledge does not require a matching PDF, but it must be preserved as an approved adjudication with exact scope and provenance. General model knowledge and plausible inference remain prohibited.

## Active locations

- `operations/records.jsonl` — generated canonical records; currently empty.
- `operations/publication-ready.jsonl` — definitive answer records; currently empty.
- `sources/registry.jsonl` — accepted sources; currently empty.
- `adjudications/records.json` — explicit Ready Route decisions; currently empty.
- `../research/fedex-ground-driver-knowledge/` — clean authoring and evidence workbench.
- `manifest.json` — generated counts and checksums proving the active release state.

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
