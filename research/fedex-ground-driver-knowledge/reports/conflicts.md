# Conflict report

Status date: 2026-08-08

No item in this report may be presented as a verified driver procedure until the conflict is resolved against a controlling source.

## Record-status index: CONFLICT

- `KNO-DEL-BUS-OP201-001` — Business delivery has no OP-201 release authorization on file.
- `KNO-SEC-STOLEN-VEHICLE-001` — FedEx-branded or shipment-laden vehicle is stolen.

## CONFLICT-001 — Business release without OP-201

- Newer source candidate: SRC-GDRIVE-FILE-0014, OP-117 v2 page 27, dated 12/15/2025.
- Earlier source candidate: SRC-GDRIVE-FILE-0008, FORGE P&D Application Guide 3.00 pages 83-85, dated 4/1/2025.
- Corroborating rule sources: SRC-MGB-PAGE-0010 and SRC-MGB-PAGE-0011, explicit November 2022 MyGroundBiz OP-201 communications.
- Conflict: OP-117 says not to release without an OP-201, leave a door tag, and return the package. The FORGE guide demonstrates acknowledging the missing OP-201 and releasing the stop.
- Current database treatment: KNO-DEL-BUS-OP201-001, status CONFLICT; approved answer withheld and management/station escalation required.
- Resolution needed: review the relevant 2026 ISP Agreement service-standard language and obtain current implementation clarification explaining why the April 2025 FORGE guide exposes the contradictory release path.

## RECONCILIATION-002 — Tobacco/e-cigarette commercial-delivery scope

- Source candidate: SRC-GDRIVE-FILE-0002, OP-119.
- Source candidate: SRC-GDRIVE-FILE-0014, OP-117 v2.
- Conflict candidate: OP-119 describes a limited preauthorized commercial exception; OP-117 uses broader prohibition language and directs questions to station representation.
- Current database treatment: KNO-DEL-TOBACCO-001, status HUMAN_REVIEW_REQUIRED. The individual-consumer prohibition is treated as established; the commercial branch withholds approval pending confirmation.
- Resolution needed: current controlling content/service rule and scope.

## CONFLICT-003 — Status tables in unversioned hand sheets

- Sources: SRC-GDRIVE-FILE-0011 and SRC-GDRIVE-FILE-0012.
- Newer comparison sources: OP-117 and MGB-119.
- Conflict candidate: photographed status-code/status-list material differs from the newer 2025 guides and lacks visible revision identity.
- Current database treatment: hand-sheet material classified as potentially outdated and not used to override current guides.
- Resolution needed: current OP-324/OP-321 and OP-207/OP-207Res source set.

## Metadata/version conflicts

- FORGE Business Closure and FORGE Settings filenames imply 2.2.0 while internal labels show 2.0.0.
- OP-119 filename indicates 10/28/24 while the document body states a 9/9/24 last update.

These metadata discrepancies do not automatically create operational conflicts, but they prevent silent version assumptions.

## CONFLICT-004 — Stolen-vehicle GSOC notification responsibility/order

- Source candidate: SRC-GDRIVE-FILE-0014, OP-117 v2 page 84, dated 12/15/2025.
- Source candidate: SRC-MGB-PAGE-0007, Security page updated 11/19/2025.
- Conflict: OP-117 directs service-provider personnel to call law enforcement, then GSOC, then station/Linehaul management and security. The portal page directs personnel to call law enforcement and station/hub management, while assigning GSOC/security calls to FedEx representatives.
- Current database treatment: KNO-SEC-STOLEN-VEHICLE-001, status CONFLICT. Personal safety, law-enforcement contact, and station/hub escalation remain supported; the disputed GSOC caller/order is withheld.
- Resolution needed: written confirmation from FedEx Security or the current controlling agreement/procedure owner.
