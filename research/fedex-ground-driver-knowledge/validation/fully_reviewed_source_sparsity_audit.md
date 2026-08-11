# Fully reviewed source sparsity audit

Status date: 2026-08-09

Purpose: test whether a `FULLY_REVIEWED` source with zero, one, or two source-to-knowledge mappings indicates missed operational knowledge. A low mapping count is a review trigger, not proof of either completeness or omission.

Current snapshot: 51 primary inventory rows are marked `FULLY_REVIEWED`; 40 have two or fewer source-to-knowledge mappings. Their validator-enforced dispositions are: 25 mapped operational-evidence sources, five reviewed landing pages with children pending, three reviewed index pages with children pending, three reviewed contextual sources with no distinct procedure, and one each for a reviewed container, secondary reference, customer-alert parent layer, and redirect. This audit examines low mapping yield after separating review completeness, evidence authority, and independently reviewable child resources.

## Containers and secondary references intentionally without mappings

- `SRC-GDRIVE-BROWSER-ROOT-0001` is the reviewed Google Drive folder container. Its 17 direct child files carry the substantive evidence, so a zero mapping count at the container level is expected.
- `SRC-GDRIVE-FILE-0003` is the fully reviewed 78-row scenario workbook. It remains a `SECONDARY_REFERENCE`: its scenarios were used to generate adversarial gap checks, but unsupported workbook answers were not promoted as authoritative operational evidence. Its zero mapping count is intentional. The hash-bound `validation/workbook_scenario_coverage.csv` accounts for every row and routes source-absent safety/handbook claims to `REFSRC-041`/`REFSRC-042` rather than to operational mappings.

## Previously flagged substantive pages — reinspection completed

The earlier audit flagged two pages because their original browser review evidence did not prove complete actionable-statement translation. Both have since been durably recaptured and re-reviewed:

- `SRC-MGB-PAGE-0008` — Customer Experience and Pickup Coordination. The complete visible page, 44-link inventory, one unlabelled figure target, eleven linked documents, and six embedded-video identities are preserved. The page functions as a resource index and does not itself state the linked pickup procedures. Its zero mapping count is therefore correct; the eleven documents remain separate acquisition/review obligations, while the six videos are fully reviewed historical manager-facing FCC context with zero canonical mappings.
- `SRC-MGB-PAGE-0015` — Unsafe Driving. The complete 2021 page is preserved. It defines the Unsafe Driving BASIC at a high level and names speeding, reckless driving, improper lane change, and inattention as examples, but supplies no distinct response procedure beyond the broader current CSA/DOT source. It remains contextual and potentially relevant rather than being promoted into a duplicate or incomplete rule.

No driver instruction is inferred from the pickup child-resource titles, video titles, or the high-level unsafe-driving examples.

## Reviewed index/landing pages whose linked content remains open

Zero mappings are not treated as extraction completeness for these sources. The visible landing/index page was reviewed, but the substantive child material remains a separate acquisition obligation:

- `SRC-MGB-PAGE-0003` — Safety Information Guide landing page; the current SIG is hosted in MyBizAccount and has not been acquired.
- `SRC-MGB-PAGE-0009` — ISP Agreement landing/version page; the sample agreement is a child source and cannot substitute for the executed agreement.
- `SRC-MGB-PAGE-0012` — Safety and Compliance Program Resources; linked PDFs remain pending.
- `SRC-MGB-PAGE-0013` — Safety Topic Library index; all 77 displayed child documents are inventoried, but individual content review is incomplete.
- `SRC-MGB-PAGE-0016` — Equipment Terms landing page; current linked equipment documents remain separate acquisition/review targets.

The zero count is therefore expected at the landing-page level but does not close the source family.

## Image references promoted only as source-limit evidence

- `SRC-GDRIVE-FILE-0011` and `SRC-GDRIVE-FILE-0012` are fully visually reviewed hand-sheet examples with no reliable publication identity/revision and 2021-era content. Each now has one mapping to `KNO-DOC-HANDSHEET-001`, limited to the fact that the photographed examples exist and cannot be identified as current OP-207/OP-207Res instructions. Their barcode, status, COD, and handwriting examples are not promoted into an approved procedure. Current OP-207/OP-207Res and station instructions remain required.

## Narrow sources represented by one or two comprehensive records

The following low counts are presently explainable because each source has a narrow scope that is preserved by one or two structured records. They must still be rechecked if a newer version is acquired:

- `SRC-GDRIVE-FILE-0005` — business-closure UI, represented in the business-release/closure conflict structure.
- `SRC-GDRIVE-FILE-0006` — call-tag all-versus-individual scope and closeout/recovery branches.
- `SRC-GDRIVE-FILE-0007` — Delayed Login, represented as one complete entry/use/exit/transmission sequence.
- `SRC-GDRIVE-FILE-0009` — older Quick Start material; only the supportable device-use warning was promoted and marked potentially outdated.
- `SRC-GDRIVE-FILE-0010` — audio/settings behavior, split into version-sensitive settings records.
- `SRC-GDRIVE-FILE-0013` — Manifest Preview permissions and manifest/misload review.
- `SRC-GDRIVE-FILE-0015` — package-placement quick reference, used as corroboration for the complete placement record.
- `SRC-GDRIVE-FILE-0016` — personnel qualification flow, represented by one manager/eligibility record rather than an on-route procedure.
- `SRC-GDRIVE-FILE-0017` — historical Authenticated Delivery screenshot, preserved with zero active mappings because the later current FORGE 3.3 guide controls the conditional Ground procedure.
- `SRC-MGB-PAGE-0004` — the narrow P&D qualification overview now supports final-activation context plus the explicit 24-month certification-expiry branch. `SRC-MGB-PAGE-0005` has additional mappings for observed hours, observer eligibility, recertification, and vehicle-size qualification and is no longer a sparse source.
- `SRC-MGB-PAGE-0006` and `SRC-MGB-DOC-0006` — accident-reporting landing page and OP-130 packet, mapped to immediate-scene and reporting sequences.
- `SRC-MGB-PAGE-0010` and `SRC-MGB-PAGE-0011` — OP-201 request/confirmation notices, mapped to the commercial-release conflict and special-shipper branches.
- `SRC-MGB-PAGE-0017` — coupling landing page, with the substantive coupling guide retained as a linked-source obligation.
- `SRC-MGB-PAGE-0018` — time-sensitive FAD announcement, preserved as historical launch context with zero active mappings after the current FORGE 3.3 guide resolved the operational branch.
- `SRC-MGB-PAGE-0019` — heat and dry-ice article, split into two safety records.
- `SRC-MGB-PAGE-0020`, `SRC-MGB-PAGE-0021`, and `SRC-MGB-PAGE-0022` — narrow rental/inspection pages represented by one complete conditional record each.

## Corroboration added during this audit

`SRC-MGB-PAGE-0007` (Security, updated 2025-11-19) already had vehicle-security and stolen-vehicle mappings. Its preserved full-page review also supports:

- `KNO-SEC-INCIDENT-REPORT-001` for current violence/threat reporting-channel corroboration.
- `KNO-CX-APPEARANCE-001` for current badge-display corroboration.

## Audit conclusion

Low mapping counts do not by themselves show missing records for the narrow-source group. The folder container and secondary workbook are intentionally unmapped, and the announcement screenshot is mapped only to its time-sensitive availability record. The validator-enforced `inventory/source_knowledge_coverage.csv` reconciliation makes every source disposition machine-checkable. No source remains open under the earlier two-page reinspection finding; landing/index child sources, partial documents, unreviewed primary sources, and authenticated acquisition targets remain explicit coverage gaps and still prevent a completeness claim.
