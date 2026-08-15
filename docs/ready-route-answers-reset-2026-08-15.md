# Ready Route Answers dataset reset — 2026-08-15

## Decision

The first-generation Ready Route Answers corpus was retired because its size and structure were not producing the required answer quality. It must not influence the replacement product.

## Preserved archive

- Private repository: `metzgerphil/readyroute-workspace`
- Release/tag: `readyroute-answers-dataset-v1-archive-2026-08-15`
- Source commit: `327aed2721e1e27ddf01cf4d9d0a68e37730f8f3`
- Archive: `readyroute-answers-dataset-v1-2026-08-15.tar.gz`
- Size: `396988273` bytes
- SHA-256: `7699a0e778983eee3f07942a245e8962a5dbc9e71578d23bd0d7bb76d6306998`

The archive includes the canonical release, research workbench, private ignored sources and captures, generated answer bundles, and images. It is retained only for recovery and audit history.

## Active reset boundary

The reset removes all v1 operational records, source registrations, evidence mappings, adjudications, reference codes, driver-language cases, clarification aliases, generated bundles, and source-workbench contents from the active pipeline.

The reset preserves the Ready Route Answers application, database schema, import and retrieval framework, publication gates, canonical schemas, and the separately preserved Ready Route Operations product.

Production customer, route, driver, vehicle, billing, and Ready Route Operations data are outside this reset.

## Replacement-corpus rule

Only newly supplied and explicitly accepted source material may populate v2. Archived records cannot be copied forward by default. Until v2 contains publication-ready records, the answer system must fail closed and provide no definitive driver instruction.
