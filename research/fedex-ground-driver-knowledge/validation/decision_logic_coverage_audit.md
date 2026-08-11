# Decision-logic coverage audit

Status date: 2026-08-09

Purpose: verify that the procedural decision map covers every current structured knowledge record and preserves materially different branches, clarification needs, status limits, and escalation conditions.

## Coverage result

- 138 of 138 knowledge records are named in `knowledge/decision_logic.md`.
- No decision-map identifier points to a missing knowledge record.
- All 144 records contain at least one clarification requirement.
- 134 records contain explicit conditions; four are unconditional within their stated applicability and retain clarification questions.
- 40 records contain source-established exceptions.
- 137 records contain an ordered procedure. The sole record without one is `KNO-DEL-BUS-OP201-001`, whose status is `CONFLICT`; withholding both disputed procedural branches is intentional.
- 124 records contain documentation requirements; fourteen have none because the reviewed source did not establish a separate documentation artifact for that narrow action.
- 136 records contain prohibited actions; two narrow affirmative/source-limit records have no separate prohibition.
- 118 records contain an escalation requirement; self-contained status-scope rules do not invent escalation absent source support.
- 122 records link to related knowledge; graph validation separately accounts for isolated records and incoming-only connections.

## Missing-map repair

The prior decision map covered 72 records and omitted 32. The audit added evidence-preserving branches for:

- Delivery classification, scan integrity, package notation, door tags, PPOD, locker failure, premium services, tobacco, FAD, SRA, OP-206, and shipper-authorized release.
- Successful call tags, unlisted pickup creation, packaging defects, and scheduled-pickup offer acceptance/decline.
- Badges, appearance, route security, media/recording, falsification, roadside reports, and L10 activation.
- Vehicle change, coupling, incorrect-scan deletion, business-closure messaging, Delayed Login, Manifest Preview/permissions, device-on-road use, and audio settings.

The added sections are summaries of existing structured records. They do not promote unresolved steps or change any knowledge status.

The later FORGE page-completeness pass added decision branches for all eleven newly extracted records: barcode/permission setup, login/dispatch, language/device information, standard delivery/pickup, unmanifested delivery, hazmat signature, Alternate Signature, and messaging. Version and human-review gates remain explicit.

The complete Drive-PDF pass added five more branches for pickup-service terminology, delivery-attempt limits, pickup scan integrity, display/navigation settings, and manifest search. It preserves current-version verification for the three version-sensitive records.

## Branch-safety checks

- `CONFLICT`, `HUMAN_REVIEW_REQUIRED`, and `POTENTIALLY_OUTDATED` branches explicitly preserve their withholding, confirmation, or version-check requirements.
- UI availability is not converted into operational authorization for business release, pickup decline, address changes, or vehicle compliance.
- Specialized restrictions are evaluated before broader pickup/release paths.
- Emergency and immediate-safety actions precede clarification where delay could increase harm.
- Documentation and closeout steps remain in sequence rather than being detached into independent facts.

## Regression control

The corpus validator now requires the set of knowledge IDs in the decision map to equal the set in `knowledge/records.jsonl`. A new record therefore fails validation until its decision logic is incorporated, and a stale map reference fails if its record is removed or renamed.

This proves decision-map coverage for the current structured layer, not full source-corpus completeness. The audit must be repeated after every new extraction batch.
