# Source review: SRC-GDRIVE-FILE-0014

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction, page-by-page reading, and visual review of all 89 rendered pages
- Document identity: OP-117 v2, last update 12/15/25
- Scope: current broad on-road reference for service-provider personnel
- Authority note: the document states that an ISP Agreement controls in the event of conflict. It also identifies several external cards/guides that are not in the supplied Drive corpus and must be pursued on MyGroundBiz or through station access.

## Complete page map

- Pages 1-5: authority statement and table of contents.
- Pages 6-7: ethics, falsification, accident/injury reporting, data preservation, DOT compliance, and vehicle safety.
- Pages 8-10: on-duty/driving time, HOS limits, short-haul conditions, work-reporting location, 16-hour and adverse-condition exceptions.
- Page 11: FORGE user types, persistent-support route, and scan deletion.
- Pages 12-16: ISR/DSR/ASR, alcohol, central receiving, tobacco/vaping, appointment/date-certain/evening/time-definite services, and tracking devices.
- Pages 16-18: residential/commercial classification and examples.
- Pages 19-25: door tags, indirect/apartment delivery, recipient-signed door tags, OP-206, barcoded/non-barcoded SRA, and electronic signatures.
- Pages 26-35: business/residential/shipper-authorized release, Express-only release cases, third-party lockers, secure placement, PPOD, ASR ID contingency, no-safe-place, hazmat release prohibition, PPODA, and business PPOD.
- Pages 36-40: delivery status-code conditions and package notation.
- Pages 40-47: disputed-delivery causes, customer expectations, HAL, SenseAware delivery, missing/wrong barcode, address exceptions, retry limits, damage comments, and signature-device refusal.
- Pages 47-55: pickup expectations, listing/reconciliation, unlisted pickup flow, reason codes, call tags, and SenseAware pickup exception paths.
- Pages 56-64: listed/unlisted drop box pickup; NFC, BLE, manual-entry fallback; pickup settings; holiday closing; early last pickup; and serial entry.
- Pages 65-71: CXPC transfers/messages/offers/research, pickup FAQ, scanner-failure handoff, vehicle capacity, combo/multiple-stop rules, zero-package stops, and Alaska/Hawaii hazmat restriction.
- Pages 72-81: hazmat acceptance, certification, loading, manifest, delivery, leaking/damaged package emergency, relay references, and geographic/call-tag restrictions.
- Pages 81-87: badges, parking, weapons, screening, recording, theft/stolen vehicle, violence, active threat, incident reporting, and personal security.
- Pages 88-89: common label formats and fill-in contact fields.

## High-impact clarification variables

- Signature type: none, ISR, DSR, ASR, alcohol/controlled substance, appointment.
- Location type: qualifying residence, commercial recipient, individual apartment, inaccessible multi-recipient building, central receiving, neighbor, third-party locker, HAL, restricted-photo location.
- Presence and authority: recipient present, eligible signer present, neighbor/office willing to sign, OP-201 on file, shipper-authorized release, SRA/barcoded SRA, electronic signature.
- Package characteristics: signature service, hazmat/limited quantity, alcohol, size/locker eligibility, missing/damaged/unreadable barcode, SA ID, premium service, call tag.
- Attempt state: first/later attempt, code already applied, stop-wide versus package-specific condition, same-day redelivery, three prior unsuccessful attempts.
- Pickup state: listed/unlisted, package count zero, customer ready/closed/not home, pickup window, scan availability, vehicle capacity, packaging acceptance, call-tag disposition.
- System state: normal FORGE, outage, manifest/list missing, device scan failure, drop box connection tier, photography restriction.

## Material sequences that must remain intact

- Accident/injury response and preservation/reporting (pages 6-7).
- ISR release through recipient-signed door tag or SRA (pages 19 and 22-25).
- Apartment attempt followed by central-receiving indirect delivery (pages 20-22).
- Business release with/without OP-201 and shipper authorization (pages 26-28).
- ASR ID scan, permitted manual contingency, signature, or refusal disposition (pages 32-34).
- No-safe-place attempt, possible indirect delivery, status/notation/door-tag/return path (page 34).
- HAL transfer, hand-sheet contingency, refusal, and returned pickup (pages 42-45).
- Unlisted pickup creation and close (pages 48-51).
- Call-tag five-way closeout and package-ready/refusal/restriction paths (pages 52-54).
- SenseAware healthy/unhealthy/unresponsive/unavailable paths (pages 54-55).
- Drop box NFC to BLE to authorized manual-entry escalation (pages 56-61).
- Drop-box settings through serial capture, approved time/date entry, send-and-FINISH completion, holiday closing, and early-last-pickup scan/close (pages 61-64).
- Hazmat acceptance, paperwork, loading, manifest maintenance, delivery, and leak/damage emergency (pages 72-81).
- Active threat and later reporting (pages 85-86).

## Second extraction-audit result

The page map was rechecked against the structured knowledge layer after initial extraction. This pass promoted five previously under-modeled areas:

- `KNO-DEL-DISPUTE-PREVENTION-001` — address verification, actual-location/time scanning, indirect placement, signature, PPOD, and door-tag integrity from pages 40-41.
- `KNO-PUP-DROPBOX-SCHEDULE-001` — setup, serial, pickup settings, holiday closing, early last pickup, and FINISH/scan-close completion from pages 61-64.
- `KNO-SEC-FACILITY-VEHICLE-001` — personal-vehicle restrictions and the narrow Alternative Vehicle facility-entry exception from page 82.
- `KNO-SEC-WEAPONS-SCREENING-001` — posted weapons standards, screening, inspection, and denied-access consequence from pages 83-84.
- `KNO-SEC-INCIDENT-REPORT-001` — threat, robbery, burglary/package-loss, missing-vehicle, emergency, FedEx-channel, and Alert Line reporting from pages 84-87.

The pass also updated `KNO-FORGE-EDIT-ADDRESS-001` to separate the verified wrong-ZIP `Edit Address > ReEnter` recovery on page 46 from unresolved authority to change a shipping-label delivery point. Page 46 now corroborates the delivery-time damage `Package Comment` path, while the broader stop-comment UI remains version-sensitive.

Open gaps discovered in this pass are preserved rather than filled by inference: who authorizes drop-box schedule/date changes, and the complete post-complaint Disputed Delivery investigation/recovery workflow.

## Exact page-to-knowledge reconciliation

The later page-level completeness pass parses every OP-117 locator in the source-to-knowledge ledger and reconciles all 89 pages in `knowledge/op117_page_coverage.csv`.

- 76 pages map directly to operational knowledge only.
- 2 pages map to both operational knowledge and normalized delivery-status reference rows.
- Pages 37-39 are completely represented as normalized status-code reference rows rather than falsely promoted into complete per-code procedures.
- Page 26 now explicitly supports the OP-201 commercial-release conflict branch.
- Page 75 now explicitly supports retention and station return of the required accepted fully regulated hazmat certification/declaration copy.
- Page 1 is governing context; pages 2-5 are contents; page 74 is a section divider.
- Page 88 is a visual label-format reference without an explicit procedure.
- Page 89 contains label examples and a blank local Contact Information table. The table is tracked as `ART-DOC-003`; it requires authorized local configuration and does not supply actual current contact details.

No page remains unclassified. The validator regenerates the ledger and rejects missing pages, stale mappings, invalid linked records/artifacts, or any `UNRECONCILED` disposition.

## Cross-source conflict and change candidates

- OP-117's 12/15/25 statements supersede older summaries where the scope is the same, but the ISP Agreement remains controlling.
- OP-119 described a limited preauthorized commercial exception for tobacco/e-cigarette products. OP-117 states a broad prohibition and still directs questions to a station representative. Preserve the difference for conflict/human review.
- The image-only hand-sheet tables differ from the current OP-117/MGB-119 status list and lack a version. Treat them as potentially outdated.
- FORGE UI details must be compared with the 4/1/25 FORGE 2.8.0 guide and any MyGroundBiz updates after 12/15/25.
- HOS/legal rules are high-stakes and time-sensitive. Preserve the source statement, its date, and the need for compliance review rather than treating this corpus as legal advice.
- Page 53 says a call tag can be used for packages never previously entered, while other summaries describe previously delivered returns. Do not narrow the call-tag definition.
- Page 60/61 manual drop-box entry is available only after specified connection failures and CXPC determination on capable devices; do not present the combination-code path as a first-line workaround.

## Referenced sources not yet in the supplied Drive corpus

- ISP Agreement and applicable schedules/attachments.
- Accident Packet Instructions for Drivers, OP-130.
- Service Measurement Status Codes Reference Card, OP-324.
- Pickup Reason Codes Card, OP-321.
- Delivery Record, OP-207, and Delivery Manifest Record, OP-207Res, including cover/flap instructions.
- Hazardous Materials Reminder Card, HZ-035.
- Safety Information Guide, SF-920P.
- Check-Out/Check-In for Relay Operations.
- Vehicle standards, anti-theft specifications, and related MyGroundBiz references.
- State CDL manuals and applicable regulations cited by the guide.
