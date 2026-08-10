# Form and physical-artifact coverage audit

Status date: 2026-08-10

## Result

The reviewed corpus now has a deterministic, source-linked coverage ledger for 42 driver-used forms, cards, sheets, labels, manifests, credentials, guides, and vehicle/compliance records. The ledger connects 25 reviewed sources, 27 referenced-source gaps, and 30 operational knowledge records.

This audit deliberately separates artifact possession from procedural knowledge. Eight workflows are complete enough to model from reviewed instructions even though a current physical specimen is not always archived. Twenty-three are only partially modeled and eleven are reference-only. OP-135 is now preserved and reviewed as a complete five-page original.

## Coverage summary

### Artifact access

- 4 current artifacts fully reviewed: OP-130, OP-132, OP-135, and OP-117's blank local Contact Information table.
- 26 artifacts described but not acquired.
- 11 generic document types described without an archived current specimen.
- 1 photographed example family has unresolved identity and revision: the Delivery Record/hand-sheet images.

### Procedure coverage

- 8 `COMPLETE_PROCEDURE_MODELED`.
- 23 `PARTIAL_PROCEDURE_MODELED`.
- 11 `REFERENCE_ONLY`.

### Publication gates

- 11 `VERIFIED_PROCEDURE_WITH_ARTIFACT_GAP`.
- 10 `HUMAN_REVIEW_REQUIRED`.
- 20 `COMPLIANCE_REVIEW_REQUIRED`.
- 1 `LOCAL_CONFIGURATION_REQUIRED`.

These publication labels apply to the artifact/form dimension. They do not override each linked operational record's `knowledge_status`.

The page-89 Contact Information table is not an approved contact directory. It contains blank fields only. Actual service-provider, authorized-officer, station, alternate, and other contact details must be populated and maintained by an authorized local owner, and invented or stale values must never be published as source truth.

## Blue Sheet / manual sheeting finding

No reviewed authoritative source explicitly uses the name **Blue Sheet**.

The supplied corpus contains:

- `SRC-GDRIVE-FILE-0011`, an image-only page of completed Delivery Record examples and code tables with no visible publication identity or revision;
- `SRC-GDRIVE-FILE-0012`, an image-only manual-sheets/barcode/notation guide with no visible publication identity or revision and a 2021 sample date; and
- current OP-117 v2 page 44, which states only that HAL packages may be hand sheeted on OP-207 or OP-207Res when FORGE or scanning devices are inoperable and points to examples on OP-207 tablet flaps.

This evidence does **not** establish that either photograph is the current OP-207, the current OP-207Res, or the artifact a driver informally calls a Blue Sheet. It also does not establish a complete current form-selection, field-completion, custody, submission, or non-HAL outage sequence.

`KNO-DOC-HANDSHEET-001` therefore recognizes the driver's terminology for retrieval while withholding a fill-out procedure. Its driver-facing answer requires the exact official form identifier/revision and directs the driver to current station instructions. The unidentified images remain evidence of legacy/example content only.

## Other high-impact artifact gaps

- OP-321 and OP-324 remain unacquired, so a displayed code/reason definition cannot be treated as a complete operational procedure.
- Current OP-201 and the executed controlling ISP Agreement remain missing, preserving the commercial-release conflict.
- HZ-035, SF-034, SF-920P, OP-900 variants, OP-901/902, OP-950, SF-136, OP-908, the current ERG, and decal 20159S remain independent hazmat/compliance acquisition obligations.
- The April 2025 FORGE guide additionally names SF-035. Later reviewed sources instead name HZ-035 and SF-034. The corpus does not assume that SF-035 is a typo, obsolete identifier, duplicate, or equivalent card; it is a separate acquisition/reconciliation obligation.
- OP-406 is described only through the after-close HAL-refusal branch; the current label and complete QA-return handling are not acquired.
- The FORGE Alternate Signature section references a carried physical signature record and line number but does not identify the current form or establish its complete fields, eligibility, custody, or submission process. `ART-DOC-004` and `REFSRC-034` preserve that gap without equating it to OP-200, OP-207, or OP-207Res.
- Vehicle, medical, roadside, rental, and jurisdictional forms require document- and jurisdiction-specific compliance review rather than inference from FORGE warning screens.

## Controls added

`scripts/build_form_artifact_coverage.py` deterministically generates `knowledge/form_artifact_coverage.csv`. Corpus validation rejects:

- stale generated rows;
- duplicate or malformed artifact IDs;
- unknown source, backlog, or knowledge links;
- invalid access, procedure, or publication states;
- missing coverage limitations or follow-up actions;
- a partially reviewed artifact without a partially reviewed source;
- an unresolved photographed identity without a publication gate;
- any missing ledger coverage for the required card/form/artifact backlog; and
- any hand-sheet row not linked to the explicit source-limited knowledge record.

## Adversarial identifier-discovery pass

The identifier scan covers the complete 137-record structured layer, all 56 fully or partially reviewed source artifacts, and all 15 extracted PDF texts. It found 29 distinct normalized OP/SF/HZ/decal identifiers:

- 27 resolve to explicit `official_identifiers` in the artifact ledger.
- OP-117 and OP-119 are source-publication identifiers, not driver-completed or driver-carried artifacts; both have source-backed exclusions in `knowledge/artifact_identifier_exclusions.csv`.
- No discovered identifier remains unclassified.

This pass discovered SF-035, which had not appeared in the initial artifact ledger. The new validator reruns the scan on every corpus validation and fails if a future identifier is neither mapped to an artifact nor explicitly classified as a source publication. It also rejects stale exclusions and duplicate official identifiers.

## Conclusion

The corpus can now answer which physical documentation is known, which procedures are modeled, and why a procedure must still be withheld. It cannot yet provide an approved Blue Sheet/OP-207/OP-207Res fill-out guide. That requires acquisition and review of the current forms and station-approved instructions.
