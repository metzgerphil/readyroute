# Record duplication and fragmentation audit

Status date: 2026-08-09

Scope: all 124 current operational knowledge records.

The status-code translation pass additionally kept code-001 security prevention separate from delay-only screening and kept ordinary code-010 damage inspection separate from pickup packaging, call-tag restriction, and leaking-hazmat emergency branches.

## Method

The audit compared each record pair using normalized terms from the canonical situation, normalized description, and authoritative rule. Every pair above a conservative similarity threshold was then reviewed manually against conditions, procedures, documentation, prohibitions, and source status.

The audit also checked procedure length to identify records that might state a rule without preserving its required sequence.

## Near-similar pairs reviewed

### Call tag not ready versus call tag refused

- Records: `KNO-PUP-CALLTAG-NOTREADY-001`, `KNO-PUP-CALLTAG-REFUSED-001`.
- Decision: retain separately.
- Reason: the conditions and status codes differ—package not ready/cannot return uses code 024, while recipient refusal uses code 006—even though both require customer signature, physical tag notation, and station return.
- Correction: all successful, not-ready, refused, and restricted call-tag outcome records now link to `KNO-FORGE-CALLTAG-SCOPE-001` and the sibling outcomes so retrieval cannot treat one similar sequence as the only branch.

### Ordinary package refusal versus ASR and call-tag refusal

- Records: `KNO-DEL-REFUSED-001`, `KNO-DEL-SIG-ASR-001`, `KNO-PUP-CALLTAG-REFUSED-001`, `KNO-PUP-CALLTAG-RESTRICTED-001`, and `KNO-DEL-COD-MULTI-001`.
- Decision: keep separate and cross-link.
- Reason: OP-117 establishes code 006 for ordinary recipient refusal but does not provide its complete post-code sequence; ASR ID refusal and call-tag refusal provide distinct source-supported steps, while COD refusal remains source-limited. Combining them would either omit required special-service documentation or invent an ordinary procedure.
- Correction: the new ordinary-refusal record and `AMB-005` force service-type clarification and withhold unsupported final-disposition guidance.

### DSR versus alcohol delivery

- Records: `KNO-DEL-SIG-DSR-001`, `KNO-DEL-ALCOHOL-001`.
- Decision: retain separately.
- Reason: alcohol follows ASR-style age/ID handling plus alcohol-specific intoxication and release prohibitions; DSR requires an in-person signature at the labeled address without those additional conditions.

### Accessible apartment versus no safe residential release location

- Records: `KNO-DEL-APT-001`, `KNO-DEL-SAFEPLACE-001`.
- Decision: retain separately.
- Reason: the apartment procedure requires the unit attempt and may route to an office/central receiver, while the no-safe-place branch begins with release-location suitability and may route to a neighbor or station return.
- Correction: the two records now link bidirectionally and both link the applicable door-tag/notation knowledge.

### DSR versus ASR

- Records: `KNO-DEL-SIG-DSR-001`, `KNO-DEL-SIG-ASR-001`.
- Decision: retain separately.
- Reason: both require an in-person signature at the labeled address, but ASR adds a 21-or-older signer and acceptable-ID verification with a narrowly defined manual-entry contingency.

### Scan integrity versus disputed-delivery prevention

- Records: `KNO-DEL-SCAN-INTEGRITY-001`, `KNO-DEL-DISPUTE-PREVENTION-001`.
- Decision: retain the base rule and the complete interacting situation record.
- Reason: scan integrity is a reusable rule for actual-location/time scanning and every attempt; disputed-delivery prevention combines it with address verification, signature/release, indirect-delivery, door-tag, PPOD, and placement obligations.
- Correction: the records now link bidirectionally so a scan-only result can lead to the complete interacting sequence when the driver's situation is broader.

### SenseAware delivery versus critical-healthcare delivery

- Records: `KNO-DEL-SENSEAWARE-TAG-001`, `KNO-DEL-CRITICAL-HEALTH-001`.
- Decision: retain separately.
- Reason: SenseAware establishes the general tag-removal/return procedure; Critical Healthcare adds service priority and Time Definite prompts while reusing the tag workflow. The records were already linked bidirectionally.

## Procedure-fragment result

- 117 records contain at least three ordered procedure steps.
- `KNO-FORGE-MULTICODE-001` intentionally has a complete two-step identify-then-scan sequence; it is not a fragment of manual-entry or camera-scan recovery.
- The only record with no procedure steps is `KNO-DEL-BUS-OP201-001`, which is intentionally `CONFLICT`: the disputed release action is withheld rather than converted into a false sequence.
- No verified record was found with a one-step or two-step fragment standing in for a longer documented sequence.

## Audit conclusion

No near-similar pair should be merged. Each pair differs by a material condition, authority, service type, or procedural branch. The audit improved eight related-record lists to reduce partial-sequence retrieval risk.

The FORGE page pass separately compared its eleven new records against existing login-warning, scanning, signature, pickup, sync, address-editing, business-closure, and hand-sheet branches. Baseline delivery/pickup records remain generic orchestrators with explicit exception exits; they do not duplicate their specialized procedures.

This graph linkage is knowledge-layer quality control only. A future retrieval design must deliberately follow relevant related records; this phase does not build or test that product behavior.
