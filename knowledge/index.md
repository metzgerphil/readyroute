# Ready Route Answers knowledge system

## Current state

This is the clean v2 baseline created on 2026-08-15. The active corpus intentionally contains no operational sources, records, references, adjudications, aliases, or evaluation cases.

Until new material passes review and publication gates, Ready Route Answers must return an honest knowledge-gap or escalation response. It must not reuse the archived v1 dataset, conversation memory, general model knowledge, or plausible inference.

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
3. Create narrowly scoped records with exact evidence locators.
4. Mark unresolved, conflicting, or version-sensitive material as ineligible for definitive answers.
5. Add real driver-language evaluation cases.
6. Run `npm run knowledge:release`.
7. Review the manifest and evaluation results before importing anything into an answer environment.

The archived v1 corpus is documented in `docs/ready-route-answers-reset-2026-08-15.md`. It is not part of this active knowledge system.
