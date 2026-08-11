# Ready Route human adjudication packet

Status date: 2026-08-10

## Purpose

This packet contains the 27 current canonical `PENDING_REVIEW` records after subtracting the seven active `READY_ROUTE_APPROVED` determinations. It is the exact set of unresolved questions that an authorized human owner could answer or adjudicate. The machine-readable questions, current safe boundaries, owner classes, source dependencies, and publication gates are in [`knowledge/human_adjudication_queue.csv`](../knowledge/human_adjudication_queue.csv).

The packet does not ask humans to repeat already approved vehicle-change, Manifest Preview, hand-sheet identity, hazmat, or HOS determinations. It also does not include the 20 `POTENTIALLY_OUTDATED` records, which require current version/source confirmation rather than a free-standing operational answer.

## What makes an answer sufficient

For each answered row, preserve:

1. The responder's name or stable identifier and authorized owner role.
2. The answer date, applicable geography, and system/source version or effective date.
3. Material conditions, exceptions, and the smallest facts that change the branch.
4. Ordered driver actions.
5. Required codes, scans, forms, markings, custody, notifications, and escalation.
6. Prohibited actions.
7. Any part the responder cannot establish.
8. The controlling source when available, or an explicit statement that the answer is an authorized Ready Route determination by the named owner.

A source title, probable practice, personal recollection, or “call management” without resolving the requested authority is not enough to promote a record. Partial answers remain partial; Ready Route will preserve the supported subset and keep the rest gated.

## Lane 1 — mainstream P&D

These 20 questions come first because they affect ordinary delivery, pickup, FORGE, safety, and customer-service situations.

| Priority | Knowledge ID | Decision needed |
| ---: | --- | --- |
| 1 | `KNO-DEL-REFUSED-001` | Complete ordinary-refusal notation, door tag/photo, signature, custody, station-return, and final disposition after Status 006. |
| 2 | `KNO-FORGE-EOD-001` | Current EOD reconciliation, vehicle closure, defects, odometer, return/off-duty time, unresolved-stop, and logout requirements. |
| 3 | `KNO-PUP-PACKAGING-001` | Driver acceptance/refusal authority and correction/escalation procedure for non-hazmat packaging defects. |
| 4 | `KNO-PUP-INTERNATIONAL-DOCS-001` | Current document set, ETD/country/service exceptions, custody, refusal, and escalation for international pickup. |
| 5 | `KNO-DEL-COD-MULTI-001` | Payment types, payee/check allocation, discrepancy, refusal, custody, and closeout for multiple COD packages. |
| 6 | `KNO-DEL-PHARMACY-001` | Pharmacy-counter signer/ID eligibility, timing, release, custody, closed-counter, and unsuccessful-delivery branch. |
| 7 | `KNO-DEL-CRITICAL-HEALTH-001` | Critical-healthcare designation, timing, tracker/tag exception, notification, refusal, custody, and release requirements. |
| 8 | `KNO-FORGE-UNMANIFESTED-DELIVERY-001` | Who authorizes package/work-area assignment and delivery-point creation before using Enter Stop Details. |
| 9 | `KNO-FORGE-EDIT-ADDRESS-001` | Who may change a delivery point/address and what documentation/escalation is required. |
| 10 | `KNO-FORGE-BULK-TRANSFER-001` | Sender/receiver authority, physical custody, work-area assignment, code 079, confirmation, and completion. |
| 11 | `KNO-FORGE-BULK-001` | Current bulk eligibility/vehicle thresholds, physical-count reconciliation, discrepancies, and closeout. |
| 12 | `KNO-PUP-CALLTAG-FRAUD-001` | Suspected-fraud criteria, cancellation authority, documentation, tag/package custody, and later disposition. |
| 13 | `KNO-PUP-OFFER-DECLINE-001` | Exact scenarios and business-contact authority for accepting or declining a scheduled pickup offer. |
| 14 | `KNO-PUP-DROPBOX-SCHEDULE-001` | Roles authorized to change pickup time, holiday date, or early-last-pickup status. |
| 15 | `KNO-FORGE-LOGIN-WARNING-001` | Current blocking/advisory rules and resolution authority for medical card, vehicle, CARB, HOS, qualification, agreement, and role warnings. |
| 16 | `KNO-FORGE-LOGIN-DISPATCH-001` | Current real-user role, assignment, vehicle, duty-time, compliance, manifest, inspection, and dispatch authority. |
| 17 | `KNO-DEL-ALT-SIGNATURE-001` | Current ALT eligibility, physical record/form identity, fields/line number, OP-200 interaction, custody, and submission. |
| 18 | `KNO-DEL-BUS-OP201-001` | Written adjudication of newer OP-117's no-release branch versus the older FORGE release-without-OP-201 demonstration. |
| 19 | `KNO-DEL-TOBACCO-001` | Current controlling prohibition and whether any commercial exception remains authorized and how it is identified. |
| 20 | `KNO-SEC-STOLEN-VEHICLE-001` | Written controlling caller/order for law enforcement, station/hub, GSOC, and Security notifications. |

## Lane 2 — safety, compliance, vehicle, and qualification

| Priority | Knowledge ID | Decision needed |
| ---: | --- | --- |
| 21 | `KNO-DOT-ROADSIDE-REPORT-001` | Federal timing, out-of-service, correction, and retention baseline preserved; confirm FedEx's internal recipient/workflow and additional state obligations. |
| 22 | `KNO-HOS-RENTAL-ELD-001` | Federal exemption scope and documents preserved through 2027-10-12; confirm FedEx/Motive implementation, intrastate applicability, and renewal monitoring. |
| 23 | `KNO-VEH-RENTAL-PREP-001` | Rental-vehicle preparation, identification, inspection, documentation, equipment, and service-readiness requirements. |
| 24 | `KNO-VEH-ANNUAL-INSPECTION-001` | Inspection form, defect correction, record custody, removal from service, and return-to-service authority. |
| 25 | `KNO-VEH-CA-90DAY-INSPECTION-001` | California 90-day form, defect correction, custody, expiration, and return-to-service requirements. |
| 26 | `KNO-QUAL-L10-ACTIVATION-001` | Complete qualification/activation forms, First Advantage evidence, decision gates, and final activation authority. |

## Lane 3 — specialized linehaul

| Priority | Knowledge ID | Decision needed |
| ---: | --- | --- |
| 27 | `KNO-LH-COUPLING-BASIC-001` | Equipment-specific fifth-wheel/pintle-hook sequence, positive-lock checks, inspection, defect handling, and training/authorization. |

## Reconciliation rule

An answer does not automatically replace source history. Ready Route must record the response as evidence or an adjudication, compare it with existing material, preserve contradictions, apply the narrowest supported determination, update affected cases, regenerate `/knowledge`, and rerun all corpus/retrieval validators. A newer document controls only when its applicability, geography, scope, and effective status match the situation; date alone is not sufficient.
