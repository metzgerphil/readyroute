# Human review queue

Status date: 2026-08-09

## Record-status index: HUMAN_REVIEW_REQUIRED

- `KNO-DEL-COD-MULTI-001` — Delivering multiple Collect on Delivery packages at one stop.
- `KNO-DEL-ALT-SIGNATURE-001` — Using FORGE Alternate Signature with a recipient-signed door tag or physical signature record.
- `KNO-DEL-CRITICAL-HEALTH-001` — Delivering a critical healthcare package.
- `KNO-DEL-PHARMACY-001` — Delivering packages designated for a pharmacy counter.
- `KNO-DEL-REFUSED-001` — Recipient refuses an ordinary delivery package.
- `KNO-DEL-TOBACCO-001` — Package is known or reasonably believed to contain tobacco, e-cigarette, or vaping products.
- `KNO-DOC-HANDSHEET-001` — Driver asks how to complete a hand sheet or "Blue Sheet" when FORGE or scanning is unavailable.
- `KNO-DOT-ROADSIDE-REPORT-001` — Driver receives a roadside inspection report.
- `KNO-FORGE-BULK-001` — FORGE presents a bulk delivery manifest or bulk pickup count.
- `KNO-FORGE-BULK-TRANSFER-001` — Transferring unattempted delivery stops to another work area or vehicle.
- `KNO-FORGE-EDIT-ADDRESS-001` — Shipping label address appears incorrect and FORGE offers Edit Address.
- `KNO-FORGE-EOD-001` — Completing FORGE End of Day after route service.
- `KNO-FORGE-LOGIN-WARNING-001` — FORGE login displays an authorization, medical-card, vehicle, CARB, HOS, or driver-qualification warning.
- `KNO-FORGE-LOGIN-DISPATCH-001` — Preparing a normal FORGE login and dispatch.
- `KNO-FORGE-MANIFEST-PREVIEW-001` — Manifest Preview shows a potential misloaded or missing package before dispatch.
- `KNO-FORGE-VEHICLE-CHANGE-001` — Driver changes vehicles during the route day.
- `KNO-FORGE-UNMANIFESTED-DELIVERY-001` — Adding an unmanifested package as a new delivery stop in FORGE.
- `KNO-HAZ-ACCEPTANCE-001` — Evaluating a hazardous-material package at pickup.
- `KNO-HAZ-LOAD-PAPERS-001` — Loading and carrying accepted hazardous-material packages and paperwork.
- `KNO-HOS-DUTY-LIMITS-001` — Determining whether on-duty or driving limits allow continued driving.
- `KNO-HOS-RENTAL-ELD-001` — Using a rental commercial vehicle with no installed ELD.
- `KNO-HOS-SHORT-ADVERSE-001` — Considering a short-haul, 16-hour, or adverse-driving-conditions HOS exception.
- `KNO-LH-COUPLING-BASIC-001` — Coupling a tractor trailer or converter dolly.
- `KNO-PUP-CALLTAG-FRAUD-001` — FORGE offers cancellation of all call tags for suspected fraud.
- `KNO-PUP-DROPBOX-SCHEDULE-001` — Determining who may authorize a drop-box time, holiday date, or early-last-pickup change.
- `KNO-PUP-INTERNATIONAL-DOCS-001` — Picking up an international shipment and confirming required documents.
- `KNO-PUP-OFFER-DECLINE-001` — Business contact receives a new scheduled pickup offer in FORGE.
- `KNO-PUP-PACKAGING-001` — Pickup package appears damaged, poorly sealed, reused, or still displays old shipping labels.
- `KNO-QUAL-L10-ACTIVATION-001` — Determining whether an L10 ISP driver qualification/activation process is complete.
- `KNO-VEH-ANNUAL-INSPECTION-001` — Vehicle annual inspection is expired, missing, or incomplete.
- `KNO-VEH-CA-90DAY-INSPECTION-001` — California P&D vehicle's 90-day inspection is expired or has uncorrected defects.
- `KNO-VEH-RENTAL-PREP-001` — Preparing and identifying a rental vehicle for P&D service.

## Priority 1 — blocks approved driver guidance

1. Resolve business release without OP-201 against the ISP Agreement or a later explicit FedEx instruction.
2. Resolve the commercial tobacco/e-cigarette preauthorization scope; the individual-consumer prohibition is established.
3. Obtain and approve current OP-324 and OP-321 before publishing broad code/reason guidance.
4. Clarify the service/geographic availability statement for status code 362.
5. Resolve the stolen-vehicle GSOC caller/order conflict between OP-117 and the current Security page.
6. Obtain the controlling criteria, authorization, and documentation sequence for call-tag suspected-fraud code 106.
7. Establish driver acceptance/refusal authority for non-hazmat pickup packaging defects; do not convert packaging expectations into a universal refusal rule.
8. Obtain the approved limited scenarios in which a service-provider business contact may decline a Pickup Offer.
9. Corroborate current bulk-manifest eligibility, vehicle-type thresholds, and physical-count reconciliation outside the April 2025 application guide.
10. Establish controlling address-correction authority before allowing use of FORGE Edit Address for a new delivery point.
11. Review current EOD vehicle-closure, defect, return-time, and off-duty workflows for HOS/DVIR compliance.
12. Establish the approved authorization and physical-custody process for Bulk Transfer, not merely the FORGE code-079 UI.
13. Review each login-warning category against current medical-card, CARB, HOS, qualification, agreement, and vehicle compliance requirements.
14. Validate the OP-117 HOS limits and short-haul/16-hour/adverse-condition exception language against current controlling law and the applicable Agreement; resolve the ambiguous adverse-condition sentence before publication.
15. Establish which personnel roles may authorize or perform drop-box pickup-setting, holiday-date, and early-last-pickup changes; the mechanical FORGE sequence is documented, but decision authority is not.
16. Obtain the complete ordinary recipient-refusal procedure after Status Code 006, including any required notation, door tag, attempt photo, signature, custody, and station-return steps; do not generalize the distinct ASR or call-tag sequence.
17. Obtain current OP-207/OP-207Res, verify whether "Blue Sheet" is an authorized or merely colloquial name, and establish the complete form-selection, field, custody, submission, and non-HAL outage procedure. Do not promote the unidentified photographed examples.
18. Establish current real-user login/dispatch role, assignment, vehicle, duty-time, compliance, and manifest authority outside the demonstration flow.
19. Establish who may authorize an unmanifested package's route assignment and delivery-point creation; an Enter Stop Details screen is not authorization.
20. Acquire current Alternate Signature eligibility, OP-200/physical-signature-record identity, line-number, custody, and submission instructions.

## Priority 2 — safety, legal, or compliance review

1. Review HOS and DOT records before commercial publication.
2. Review hazmat records where current external cards/guides are absent.
3. Review personnel qualification/employment implications.
4. Confirm current vehicle-security and incident-response sources.
5. Review the rental-vehicle ELD threshold/workflow and linehaul equipment-specific coupling sequences before publication.

## Priority 3 — source/version verification

1. Verify MyGroundBiz download identity for the five Drive-matched P&D guides.
2. Establish versions for photographed hand-sheet examples.
3. Confirm COD, bulk, pharmacy, critical-healthcare, and alternate-signature workflows against controlling operational material.
4. Confirm Ground effective status for FedEx Authenticated Delivery.
5. Confirm current wording and scope for the 2023 FORGE warning against device operation while on road.
6. Resolve code 030 Retail Refusal/O.S.A., which appears in 2024 OP-119 but not the reviewed December 2025 OP-117 list.
7. Verify current FORGE audio-setting behavior for Delivery Instructions and Pickup Closing alerts.
8. Verify current Manifest Preview permission requirements and managed-device workflow.
9. Verify current FORGE combine/split/revisit/merge UI behavior and address-change controls.
10. Verify current package/stop comment and listing/manifest download/refresh UI behavior.
11. Verify current queued-sync controls and delivery/pickup reminder timing.
