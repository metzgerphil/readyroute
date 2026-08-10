# Mainstream driver-operational priority scope

Status date: 2026-08-09

## Decision

The active research lane prioritizes current operational information that is broadly applicable to FedEx Ground P&D drivers and affects most service providers. This implements the user's direction to focus on important mainstream data rather than spending the current phase on every historical, administrative, customer-specific, linehaul-only, promotional, or manager-system resource.

This is an ordering decision, not an evidence decision. Deferred sources remain inventoried and cannot support guidance until reviewed. No unresolved procedure is treated as approved merely because the lower-priority corpus is deferred.

## Core foundation already available

The reviewed source set already provides substantial coverage of:

- delivery attempts, driver release, signature branches, business/residential distinctions, and reattempt limits;
- delivery and pickup scans, status/reason-code namespaces, and known workflow limitations;
- pickup windows, unsuccessful/empty pickup handling, scan integrity, and escalation;
- misdeliveries, package recovery, address problems, customer refusals, and disputed-delivery prevention;
- package placement, PPOD, package damage, hazardous-material boundaries, and package security;
- FORGE delivery/pickup workflows, device/login/dispatch issues, messaging, and diagnostic branches;
- dogs, access hazards, locked gates, facility entry, vehicle/key security, accidents, and emergency escalation;
- forms, labels, markings, SID information, manifests, and other driver-used artifacts where the source establishes their use.

The current authoritative layer contains 138 general operational records. Eighty-three are `VERIFIED`; the remaining records are explicitly gated as `CONFLICT`, `HUMAN_REVIEW_REQUIRED`, or `POTENTIALLY_OUTDATED`. Driver-facing wording is separated from source truth, and unsupported workbook answers remain excluded.

## Active acquisition/review lane

### Tier 1 — current, broadly applicable driver procedures

1. Complete the current OP-135 accident-report form review (`SRC-MGB-DOC-0008`).
2. Durably recapture the original bytes for the fully reviewed current Dog Bite Prevention source (`SRC-MGB-DOC-0011`); its seven-page safety guidance is already extracted and validated.
3. Acquire/review the current pickup familiarization guide, notes, service-obligation guide, and unsuccessful-pickup reason-code guide (`SRC-MGB-DOC-0012` through `SRC-MGB-DOC-0015`).
4. Acquire current controlling forms and instructions referenced by reviewed operational sources: OP-324, OP-321, OP-207/OP-207Res, HZ-035, SF-920P, relay check-in/out, current emergency-response guidance, and current vehicle/security standards.
5. Acquire the cited 2025 Driver Safety Guidebook and Company Safety and Operation Handbook, then compare their mainstream procedures with the current authoritative layer.

### Tier 2 — current contractor controls that can change driver action

1. Complete the current ISP Equipment Terms review (`SRC-MGB-DOC-0010`).
2. Review the current English SRS/SRI FAQ (`SRC-MGB-DOC-0024`) for any broadly applicable driver-facing safety or incident-response requirements.
3. Reconcile exact portal identity/version for the already reviewed Drive copies of OP-117, OP-119, MGB-119, Focus on Package Placement, and the Package Placement Quick Reference (`SRC-MGB-DOC-0001` through `SRC-MGB-DOC-0005`).
4. Use the sample 2026 ISP Agreement only to identify controlling clauses and source gaps; do not treat a sample agreement as proof of any contractor's executed terms.

## Deferred lane

The following remain tracked but do not consume the current mainstream pass unless a Tier 1/2 source or an unresolved record points to them:

- six captured 2017 FCC system-training videos;
- historical monthly news archives and expired seasonal campaigns;
- customer-specific alerts/articles that do not establish a general driver rule;
- linehaul-only, trailer-pull, driving-school, qualification-administration, vendor, fuel-discount, recognition, and promotional material;
- duplicate translations when the controlling English source is available, unless geography/language-specific differences require review;
- legacy FORGE/status references already supersession-crosswalked to current evidence.

## Publication boundary

The priority decision does not relax any safety or evidence control:

- a source title is never operational evidence;
- a partially reviewed source supports only its reviewed pages/sections;
- a historical source cannot establish current procedure without revalidation;
- material conflicts remain publication-withheld;
- if the available source set cannot establish an approved answer, Ready Route must direct the driver to management rather than guess.

## Exit condition for the mainstream pass

The focused pass is ready to hand off when Tier 1 sources are either fully reviewed or explicitly documented as inaccessible, Tier 2 identity/version checks are resolved to the extent the portal permits, every resulting rule is mapped to exact evidence, and the targeted decision-logic and driver-language validation suite passes. Deferred sources remain visible as later completeness work rather than being represented as reviewed or irrelevant.
