# Procedural and decision logic map

Status: complete for the current 137-record knowledge layer and live as new sources are added

This map summarizes branching logic already supported by structured knowledge records. It does not replace the authoritative procedure or evidence stored in records.jsonl.

## Signature package

1. Identify the signature/service type: ISR, DSR, ASR, alcohol/controlled substance, appointment, or no signature service.
2. Identify who is present and where the delivery is occurring.
3. Apply only the branch authorized for that signature type.
4. If nobody eligible is available, follow the unsuccessful-attempt/status/door-tag branch for that type.
5. For ASR, separate refusal to provide ID from refusal to scan a presented valid ID. No ID provided uses the code-006/notation/station-return branch; manual DOB is permitted only after a scan attempt when valid ID was presented but scanning was declined or its barcode was unreadable.
6. An allowed mailroom or central receiving area does not waive ASR eligibility: the signer must still be 21 or older, not visibly intoxicated under the FORGE guide, present valid government ID, and sign in person.

Records: KNO-DEL-SIG-ISR-001, KNO-DEL-SIG-DSR-001, KNO-DEL-SIG-ASR-001, KNO-DEL-ALCOHOL-001.

## Residential release or inaccessible location

1. Is a recipient or required eligible signer present?
2. If not, confirm whether the package is otherwise eligible for unattended residential driver release.
3. For an otherwise releasable package, is there a secure location near the primary entrance, out of public view, and protected from damage and weather?
4. If no qualifying location exists, determine whether the package/service permits indirect delivery. ISR has a specific indirect-signature path; DSR, ASR, and appointment delivery cannot use the generic neighbor path. Hazmat and alcohol/controlled-substance packages use their separate restricted procedures.
5. For an eligible neighbor delivery, select Indirect Delivery, enter the neighboring location, obtain the accepting person's signature, and complete/scan a door tag naming that location for the original recipient's primary entrance.
6. If neither driver release nor eligible indirect delivery is available, apply Status Code 007, complete the matching delivery notation and scanned door tag, capture PPODA when prompted, and return the package to the station.
7. A question mentioning a dog first maps to `KNO-SAF-DOG-ENCOUNTER-001` for the current avoidance, approach, knockdown, or wound-response branch. If a package outcome is also requested, route separately to the applicable release/status/signature record; the dog-safety source does not establish a delivery status code or package disposition.

Records: KNO-DEL-APT-001, KNO-DEL-SAFEPLACE-001, KNO-DEL-SIG-ISR-001, KNO-DEL-SIG-DSR-001, KNO-DEL-SIG-ASR-001, KNO-DEL-HAZMAT-SIGNATURE-001, KNO-DEL-ALCOHOL-001.

## Business release with no OP-201

1. Confirm whether an OP-201 or other documented authorization is actually on file.
2. If none is present, stop.
3. The supplied sources conflict; Ready Route must not choose either branch.
4. Contact management/station and retain the item in the human-review queue.

Record: KNO-DEL-BUS-OP201-001.

## Recipient refuses a delivery package

1. Confirm the recipient explicitly refused the package; do not substitute refusal for a recipient-not-in condition.
2. Identify whether this is an ordinary delivery, ASR/ID refusal, call tag, COD/payment refusal, or another special-service branch.
3. Ordinary recipient refusal: current OP-117 establishes Status Code 006.
4. The reviewed corpus does not establish the complete ordinary post-code documentation and custody sequence; contact management/station before final disposition.
5. ASR, call-tag, and COD refusal branches must retain their separate requirements and source limitations.

Records: KNO-DEL-REFUSED-001, KNO-DEL-SIG-ASR-001, KNO-PUP-CALLTAG-REFUSED-001, KNO-PUP-CALLTAG-RESTRICTED-001, KNO-DEL-COD-MULTI-001.

## Customer security prevents delivery

1. Does the customer security protocol prevent delivery, or only delay an attempt that remains allowed?
2. If it prevents delivery, do not bypass the control or deliver the package.
3. Apply code 001, complete matching notation, and return the package to station.
4. If security only delays an allowed attempt, do not substitute the Express-only delay code as a Ground-selected procedure; clarify with management/station.

Records: KNO-DEL-SECURITY-NODELIVERY-001, KNO-SEC-ROUTE-001, KNO-SEC-INCIDENT-REPORT-001.

## Possible package damage before delivery

1. Is this a delivery package, pickup, or call tag?
2. Is there leaking or hazardous-material involvement?
3. Leaking/damaged hazmat: stop and use the hazmat emergency branch.
4. Ordinary delivery package with possible damage: do not deliver; apply code 010, complete matching notation, and return it for station inspection.
5. Pickup and call-tag damage use their separate acceptance/status branches.

Records: KNO-DEL-DAMAGE-INSPECTION-001, KNO-HAZ-LEAK-001, KNO-PUP-PACKAGING-001, KNO-PUP-CALLTAG-RESTRICTED-001.

## Barcode/scanner problem

1. Is the label missing, or is a supported barcode merely unreadable?
2. Look for the primary 2D/96 barcode before using a 00 number.
3. If the source-supported 00 contingency applies, use the specified manual process.
4. Otherwise, select the correct supported manual format only when the operational rule permits.
5. Camera Scan may replace the hardware scanner, but enabling it disables hardware scanning.
6. If no valid supported barcode exists, return for relabeling rather than inventing a record.

Records: KNO-DEL-BARCODE-001, KNO-FORGE-MANUAL-BARCODE-001, KNO-FORGE-CAMERA-SCAN-001.

## Status-code scope

1. Does the same condition apply to every package in the stop?
2. Yes: use the stop-level action.
3. No: select/scan only the affected package and use the package-level action.
4. Choose the actual code from a separate condition-specific rule.
5. Review the summary before closing.

Record: KNO-FORGE-STATUS-SCOPE-001.

## Zero-package or call-tag pickup

1. Is the stop an ordinary listed pickup or a call tag?
2. Ordinary listed pickup with no packages: use the zero-package path and the truthful supported reason.
3. Call tag not ready and no same-day return: code 024 plus signature/physical-tag documentation.
4. Call tag refused: code 006 plus signature/physical-tag documentation.
5. Call tag restricted/damaged/hazmat: code 081; hazmat return requires original-shipper/station direction.

Records: KNO-PUP-ZERO-001, KNO-PUP-CALLTAG-NOTREADY-001, KNO-PUP-CALLTAG-REFUSED-001, KNO-PUP-CALLTAG-RESTRICTED-001.

## Multiple call tags and suspected fraud

1. Does the same outcome apply to every call tag at the stop?
2. Yes: use the matching All Call Tags action, then complete the procedure and documentation required by that outcome.
3. No: choose Handle Call Tags Individually and process only the currently scanned tag before handling the others.
4. If suspected fraud is being considered, do not infer the criterion from the UI label. Obtain management/station confirmation before using code 106.
5. Never apply an all-call-tags result when it is not true for every tag.

Records: KNO-FORGE-CALLTAG-SCOPE-001, KNO-PUP-CALLTAG-FRAUD-001.

## Pickup scanner failure or capacity

1. Determine whether the failure is technological or physical capacity.
2. Scanner failure: code 26, preserve pickup time/count, and provide station data for manual update.
3. Insufficient capacity: notify AO/BC; AO/BC contacts CXPC/station; document actual packages taken and remaining.
4. Do not report a complete pickup when it was not complete.

Records: KNO-PUP-SCANNER-FAIL-001, KNO-PUP-VEHICLE-CAPACITY-001.

## Misdelivery recovery

1. Has the package been physically recovered?
2. Record the recovery through the misdelivery-pickup path with code 17.
3. Is the correct address established and can redelivery occur the same day?
4. Successful same-day redelivery: code 18 at the correct-address stop.
5. For partial redelivery, only successfully redelivered packages receive the redelivery result; others remain in recovery disposition.

Record: KNO-DEL-MISDELIVERY-RECOVERY-001.

## SenseAware pickup

1. Is a tag present?
2. Present: scan it and determine healthy, unhealthy, or unresponsive state.
3. Healthy: apply it through the normal workflow.
4. Unhealthy: use another healthy tag if available and return/report the unhealthy tag.
5. Unresponsive: rescan or use a different tag.
6. No healthy tag available: use the no-SA-ID branch and station handling.

Record: KNO-PUP-SENSEAWARE-NOHEALTHY-001.

## Drop-box access

1. Which connection mode does FORGE show: NFC, BLE only, or NFC and Bluetooth Not Available?
2. NFC shown: hold the NFC chip in position; reposition and retry after failure. The third failure moves to BLE.
3. BLE: activate the box radio, hold the device near the BLE label, and retry after failure/timeout.
4. After three BLE failures, or when NFC and BLE are unavailable, contact CXPC.
5. Use a manual combination only if CXPC determines neither electronic method is operational and supplies it; never guess or reuse a code.

Record: KNO-PUP-DROPBOX-CONNECTION-001.

## Accident or security emergency

1. Immediate life safety and emergency services come first.
2. Accident: use the current OP-130 scene sequence, report to management/FedEx, and preserve electronic/video evidence.
3. Stolen shipment-laden/branded vehicle: contact law enforcement and station/hub management immediately. The current sources conflict over who places the GSOC call; follow station/security direction and do not present that branch as resolved.
4. Active threat: GET OUT; if impossible, HIDE OUT; TAKE ACTION only for imminent danger; call 9-1-1 when safe.

Records: KNO-INC-ACCIDENT-REPORT-001, KNO-INC-ACCIDENT-SCENE-001, KNO-SEC-STOLEN-VEHICLE-001, KNO-SEC-ACTIVE-THREAT-001.

## Hazardous-material pickup and transport

1. Identify the marking/type and destination before acceptance.
2. Alaska/Hawaii, Radioactive III, and Dangerous When Wet branches are prohibited from ordinary pickup.
3. Verify packaging, labels/markings, and required certification; if a required item is missing, do not accept.
4. Load accepted hazmat on the floor, oriented and braced, with incompatible materials separated.
5. Keep certification, declaration, manifest, and ERG immediately accessible.
6. Verify the manifest before departure and cross out each delivered package.
7. For a leak/damage event, stop safely, do not handle/deliver, and contact the station immediately.

Records: KNO-HAZ-ACCEPTANCE-001, KNO-HAZ-RADIOACTIVE-WET-001, KNO-HAZ-AKHI-001, KNO-HAZ-LOAD-PAPERS-001, KNO-HAZ-MANIFEST-001, KNO-HAZ-LEAK-001, KNO-HAZ-SF136-001.

## Heat illness or dry-ice exposure

1. Can the driver stop work/vehicle operation safely and leave the exposure area?
2. Heat symptoms: move to a shaded or air-conditioned break area and assess severity; call 911 immediately for severe or life-threatening symptoms.
3. Dry ice/UN1845: maintain fresh-air ventilation and ventilate enclosed space before entry.
4. CO2-exposure symptoms: leave the area immediately and seek assistance; never handle exposed dry ice bare-handed.

Records: KNO-SAFETY-HEAT-ILLNESS-001, KNO-HAZ-DRY-ICE-001.

## ELD and rental-vehicle HOS

1. Has the vehicle moved without the correct driver logged into the ELD?
2. If yes, stop safely, preserve the actual movement facts, notify management, and use the approved vendor reconciliation process without falsification.
3. For a rental with no installed ELD, determine the exact rental duration.
4. Eight days or fewer: use the approved manual RODS process and carry the rental agreement.
5. More than eight days: the rental exception does not apply; automatic ELD recording is required before operation.

Records: KNO-HOS-UDE-001, KNO-HOS-RENTAL-ELD-001.

## Rental vehicle preparation

1. Is the vehicle from an authorized rental company or another service provider?
2. Verify qualification and VEDR before dispatch.
3. Rental-company vehicle: carry the valid agreement identifying FEC USDOT 86876 and select Rental in FORGE.
4. Other provider's qualified vehicle: carry the owner's Schedule B/Addendum 1 and inter-provider agreement; select Contractor Owned.
5. Do not use pending-qualification equipment or guess the vehicle classification.

Record: KNO-VEH-RENTAL-PREP-001.

## Vehicle inspection currency

1. Is there a current passing inspection record for the exact vehicle?
2. General annual branch: proof must be within the preceding 12 months; roadside inspection does not substitute.
3. California P&D branch: calculate 90 calendar days from the last inspection, including weekends and holidays.
4. If expired, incomplete, failed, or defects are not corrected/attested, do not dispatch; the California source permits only movement to a repair site in its specified branch.

Records: KNO-VEH-PRETRIP-DEFECT-001, KNO-VEH-ANNUAL-INSPECTION-001, KNO-VEH-CA-90DAY-INSPECTION-001.
## Pickup-window risk

1. Read the current ready time, close time, comments, and any pickup update.
2. Can the pickup be completed within the current window?
3. Yes: complete and reconcile it normally.
4. No: notify the business contact/CXPC immediately so CXPC can alert the customer.
5. Follow any transfer/update and record only what actually occurred.

Record: KNO-PUP-WINDOW-RISK-001.

## Pickup assigned to the wrong work area

1. Has dispatch occurred?
2. No: notify station personnel so the listing can be corrected and resubmitted.
3. Yes: the business contact transfers it through FCC.
4. If FCC is unavailable or the transfer crosses Service Areas, contact CXPC as soon as possible.
5. Confirm Removed/Added to Pickup Listing messages before considering the transfer complete.

Record: KNO-PUP-WRONG-WA-001.

## Pickup Research Request

1. Identify the exact pickup and reported date in the PRR.
2. Gather scans, messages, timing, and the driver's known facts.
3. Respond through the business contact/approved CXPC path.
4. If the reason cannot be established, say so; never invent one.

Record: KNO-PUP-PRR-001.

## Combo versus multiple stops

1. Identify actual customer addresses/service points and signature requirements.
2. Same location/time delivery plus pickup: one combo stop and one signature.
3. Separate commercial points requiring signatures: separate stops.
4. Apartment, locker, OnSite/Office/Authorized ShipCenter, and Walmart each use the source-specific branch.
5. Unsuccessful delivery is zero completed stops but still requires the applicable status/door tag.

Record: KNO-FORGE-COMBO-STOP-001.
## International pickup documentation

1. Confirm the correct pickup and scan every international package.
2. Review the International Pickup prompt and required-document state.
3. Are the required documents actually attached?
4. Yes: confirm the document step and close accurately.
5. No or unclear: do not select DONE; escalate for the controlling international-document requirement.

Record: KNO-PUP-INTERNATIONAL-DOCS-001.

## Multiple COD packages

1. Scan each package and verify its COD amount independently.
2. Review the total due at stop close.
3. Complete each package's COD screen and applicable check number.
4. If amount, payment type, check allocation, payee, custody, or refusal handling is unclear, stop and escalate; the application guide does not establish those rules.

Record: KNO-DEL-COD-MULTI-001.

## Pharmacy, critical healthcare, and SenseAware delivery

1. Identify PHAR, Critical Healthcare, SenseAware, Time Definite, ASR, and DSR indicators.
2. Pharmacy: group PHAR packages in a separate pharmacy-counter visit and preserve ASR/DSR requirements.
3. Critical healthcare: preserve Time Definite priority and any attached signature requirement.
4. SenseAware delivery: remove the tag at delivery, secure it, and return it to station personnel.
5. Escalate missing signer, timing risk, package issue, or tag problem; do not invent a release alternative.

Records: KNO-DEL-PHARMACY-001, KNO-DEL-CRITICAL-HEALTH-001, KNO-DEL-SENSEAWARE-TAG-001.
## Bulk manifest and count integrity

1. Is this bulk delivery or bulk pickup, and what vehicle type is selected?
2. Verify the physical package count represented by the bulk barcode/count.
3. Reconcile address/date, manifest, count, and stop summary.
4. Do not equate one scanned bulk barcode with one physical package.
5. Escalate any vehicle classification, threshold, or count mismatch.

Record: KNO-FORGE-BULK-001.

## Combine or split delivery stops

1. If Verify Address appears after scanning another stop, compare both labels and actual service points.
2. Combine only when the approved delivery point and signature structure truly match.
3. For a partial outcome, scan only the packages completed now.
4. Confirm all unscanned packages move into a new open stop before closing.
5. Never use a new-address field as redirect authority or apply the first outcome to unscanned packages.

Records: KNO-FORGE-COMBINE-DELIVERY-001, KNO-FORGE-SPLIT-DELIVERY-001.

## Revisit or link pickup records

1. Are the activities for the same customer/address and pickup ID?
2. Later zero-package visit: use Revisit (Zero Pkg) and the truthful reason.
3. Unlisted packages: assign the correct listed pickup ID.
4. Verify separate completed entries preserve their own counts/reasons.
5. Do not link an unrelated pickup merely to reconcile the list.

Record: KNO-FORGE-MERGE-PICKUP-001.
## Package versus stop comments

1. Does the fact affect one package or the whole stop?
2. One package: add/verify a Package Comment on that package only.
3. Whole stop: add/verify a Stop Comment.
4. Complete any required status, damage/refusal, or escalation process separately.

Record: KNO-FORGE-COMMENT-SCOPE-001.

## Incorrect address and Edit Address

1. Compare the label, FORGE stop, physical location, and any approved correction.
2. Is the corrected delivery point authoritatively confirmed?
3. Yes: edit accurately and recheck Stop Details before delivery.
4. No: do not guess or redirect; use the applicable code 002/documentation and escalate.

Record: KNO-FORGE-EDIT-ADDRESS-001.

## End of Day

1. Verify the correct latest vehicle and any prior vehicle change.
2. Enter actual odometer readings and truthful defect selections/comments.
3. Record actual return and off-duty times.
4. Review the summary and log out.
5. Do not use EOD to hide unresolved stops, defects, or inaccurate times.

Record: KNO-FORGE-EOD-001.

## Missing listing or manifest

1. Is the pickup listing missing, the delivery manifest missing, or a pre-first-stop refresh needed?
2. Confirm connectivity and use the matching option when FORGE presents it.
3. Refresh is available only until the first stop closes.
4. Failed or empty results do not prove no work exists.
5. Preserve unmanifested activity for EOD reconciliation and notify management/station.

Record: KNO-FORGE-DOWNLOAD-SYNC-001.
## Bulk transfer

1. Confirm the authorized destination and unattempted stop list.
2. Select only those stops and verify the destination work area/vehicle.
3. Confirm Transfer Success on the sending device and receipt/message on the destination device.
4. Reconcile the physical package handoff.
5. Code 079/application success does not prove physical transfer.

Record: KNO-FORGE-BULK-TRANSFER-001.

## Queued stop uploads

1. Compare closed stops with uploaded stops in Sync Status.
2. Restore safe cellular connectivity and allow queued transmission.
3. Manually trigger failed uploads when supported.
4. Recheck the counts and escalate any mismatch before EOD.

Record: KNO-FORGE-SYNC-QUEUE-001.

## Time reminder

1. Open the reminder and verify the stop and exact target time.
2. Determine whether the underlying pickup/premium window can still be met.
3. If not, use the applicable management/CXPC escalation immediately.
4. The reminder does not extend the window or complete the stop.

Record: KNO-FORGE-TIME-REMINDER-001.

## Login validation warning

1. Identify the exact person, agreement/CSA/SIG, medical-card, vehicle, CARB, HOS, or qualification warning.
2. Is the underlying compliance fact true and current?
3. Yes: proceed only through the approved validation path.
4. No or unclear: stop dispatch and contact management/compliance.
5. A Continue button does not cure a deficiency or authorize false certification.

Record: KNO-FORGE-LOGIN-WARNING-001.
## HOS limits and exceptions

1. Classify all source-defined on-duty and driving time; do not omit waiting, inspection, loading, traffic, or other work.
2. Compare actual totals to the normal driving/window/cycle/break limits.
3. If a short-haul, 16-hour, restart, or adverse-condition exception is proposed, verify every current condition.
4. Stop driving and contact HOS/compliance when a limit or exception is uncertain.
5. Never infer an extension from ambiguous source wording.

Records: KNO-HOS-DUTY-LIMITS-001, KNO-HOS-SHORT-ADVERSE-001.

## HAL/RTH delivery

1. Verify HAL/RTH and the hold-location address on the label/manifest.
2. Select the actual location category; true hold transfers receive code 095, while Other Location follows normal delivery.
3. For mixed HAL/non-HAL stops, use the separate high-confidence transfer branch.
4. If the hold location cannot accept before close, use code 250 and the truthful reason.
5. If FedEx Office refuses after close, verify OP-406, scan as pickup, and return to station QA.

Records: KNO-DEL-HAL-DELIVERY-001, KNO-DEL-HAL-NONHAL-TRANSFER-001, KNO-DEL-HAL-UNABLE-001.

## Delivery classification, scan integrity, notation, door tag, and photos

1. Identify the actual delivery point: individual dwelling or centralized/business receiving point.
2. Scan every attempt at the real customer location and actual delivery/attempt time; if no attempt occurred, use only an applicable supported no-attempt status and do not record a false event.
3. If delivery is unsuccessful, select the condition-supported electronic status and write the matching code/reason, time, date, and work area on the package.
4. Complete and scan the door tag at the main/front entrance; use the authorized restricted-location branch when photography is prohibited.
5. Distinguish residential PPOD, locker PPOD, business PPODB, and attempted-delivery PPODA before applying photo-content rules.
6. Residential PPOD shows the package in its actual secure location; locker PPOD shows it inside the used compartment plus adjacent compartments; PPODA shows the door tag and recognizable attempt-location context.
7. Business PPODB requires approved OP-201 and may include publicly visible door/street numbers or signage, but sensitive information is avoided at a restricted/nonpublic entrance. Do not apply that public-signage allowance to residential, locker, or attempt photos.
8. Exclude people/body parts, apply the branch-specific privacy rules, recapture a noncompliant image, and use Restricted Location only where photography is prohibited.

Records: KNO-DEL-CLASSIFICATION-001, KNO-DEL-SCAN-INTEGRITY-001, KNO-DEL-NOTATION-001, KNO-DEL-DOORTAG-001, KNO-DEL-PPOD-001.

## Alternate signature capture and release authorization

1. Is the package ISR-eligible, and is the issue a recipient SRA or inability/refusal to sign the scanner?
2. SRA: branch on barcoded versus non-barcoded form, use the corresponding ALT path, record the recipient name, and turn in the required artifact at check-in.
3. Scanner signature unavailable/refused: use a current-date OP-206, link the tracking IDs, capture recipient name/signature on the corresponding line, and turn it in.
4. Shipper-authorized release: proceed only when FORGE explicitly identifies package-specific enrollment, no signature restriction applies, and a safe authorized placement exists; remove the prompted code and complete the scanned door-tag release record.
5. If signature type, form validity, or shipper-authorization scope is unclear, stop and escalate.

Records: KNO-DEL-SRA-001, KNO-DEL-OP206-001, KNO-DEL-SHIPPER-RELEASE-001.

## Premium service, tobacco, and Authenticated Delivery

1. Identify every service indicator and the exact date/time window before deciding release eligibility.
2. Appointment service requires a signature at delivery and cannot be driver released or indirectly delivered; Date Certain/Evening release depends on the specified date/window and any separate signature service; Time Definite uses the applicable package/location service commit.
3. If a Time Definite due time cannot be met, deliver as soon as safely possible thereafter; never compromise safety to recover the commit.
4. If the package is explicitly labeled FO, PA, PA+, or M&I and the first attempt is unsuccessful, make the MGB-119-required second attempt on the same day. Preserve those labels verbatim because the reviewed source does not define all of their abbreviations; do not generalize the reattempt rule to an unlabeled or unclear package.
5. Known or suspected tobacco/e-cigarette shipment to an individual consumer is not delivered; any claimed commercial preauthorization requires current FedEx confirmation because the source set is incomplete.
6. The reviewed FAD announcement launched Express only and said Ground was future. A Ground FAD prompt requires current station/management confirmation; do not bypass authentication.

Records: KNO-DEL-PREMIUM-WINDOW-001, KNO-DEL-TOBACCO-001, KNO-DEL-FAD-GROUND-001.

## Third-party locker failure

1. Confirm the package is eligible for the locker.
2. Locker eligibility is limited to residential packages designated for release without a signature. Signature-required, ASR, hazmat, and oversize packages are ineligible; the portal article also excludes commercial packages intended for residential-complex employees.
3. Is the locker full/malfunctioning, or was the package placed in the wrong compartment?
4. Full/malfunctioning: contact property management for another approved release location. Do not leave the package on, under, near, or on the floor outside the unusable locker. If property management cannot be contacted or no alternate exists, apply Status Code 007 and return the package to the station.
5. Wrong compartment: contact the third-party vendor or property management for correction.
6. Use only the provided access code, do not share it with an unauthorized person, and preserve each customer address as a separate stop. A third-party locker is a delivery location, not a FedEx hold location.
7. When locker PPOD is captured, show the package inside the used compartment plus adjacent compartments; exclude locker numbers, people, addresses, labels, and other identifying information.

Records: KNO-DEL-LOCKER-FAIL-001, KNO-DEL-PPOD-001.

## Successful call tag, unlisted pickup, and packaging condition

1. For a call tag, first verify the package passes the specialized acceptance restrictions.
2. Successful call tag: apply code 029, cover every old barcode/address with the new label, and give the recipient the top tracking tab.
3. Unlisted pickup: first confirm the package independently satisfies all applicable acceptance and special-service requirements. Review the displayed listed pickups and assign only to the correct match; otherwise choose Not on List, enter/accept the actual address, complete any premium prompt, select Business or Residential, and verify count/type at close.
4. If the location is retail, use the separate Mark Pickup As Retail/location-type branch. If the unlisted package is hazmat, complete the Hazmat Pickup acknowledgment and specialized hazmat-count close, but do not treat those screens as acceptance authorization; the separate hazmat rules remain controlling.
5. Packaging concern: branch first to leak, hazmat, restricted-call-tag, or another stricter rule. For other nonconforming packaging, the source says pickup is not advisable but does not establish a universal refusal rule; obtain station/management direction and report recurring problems.

Records: KNO-PUP-CALLTAG-SUCCESS-001, KNO-PUP-UNLISTED-001, KNO-PUP-PACKAGING-001, KNO-HAZ-ACCEPTANCE-001.

## Pickup offer acceptance or decline

1. Confirm the user is the authorized business contact and review the full offer.
2. If accepting, assign it to the correct work area.
3. The reviewed source does not define approved decline criteria; do not infer them from the button.
4. Obtain business-management/CXPC/station confirmation before declining.

Record: KNO-PUP-OFFER-DECLINE-001.

## Badge, appearance, route security, and public communications

1. Before service, verify the valid FedEx badge is displayed and service-provider business identification is visible; Alternative Vehicle operation adds the source-specific reflective-vest branch.
2. Forgotten badge: obtain/display the temporary paper badge. Lost badge: report and replace it; return a later-found deactivated badge to a station representative.
3. At stops and whenever the vehicle is not operating, lock the doors including the bulkhead door when applicable, close the windows, and remove the keys or secure them in a key lockbox. Secure packages, park visibly when practical, conceal personal items, maintain awareness, and prioritize personal safety over property during a threat.
4. Do not use another person's badge, make unauthorized recordings on FedEx premises, answer media inquiries for FedEx, or publish using the FedEx brand without authorization.

Records: KNO-CX-APPEARANCE-001, KNO-SEC-LOST-BADGE-001, KNO-SEC-ROUTE-001, KNO-COMMS-MEDIA-001.

## Truthful records, roadside reports, and qualification status

1. Record the actual event, scan, signature, identity, qualification, and status; uncertainty never authorizes false information.
2. A written roadside inspection report is retained and delivered to FedEx upon arrival at the next station, with any cited violation escalated for compliance review.
3. L10 activation is not complete merely because one stage passed: confirm the documented background/qualification, certification/road test, SIG/E-Verify, badge, MBA Driver Status, and CDAS Status stages.
4. The exact legal/employment gating and unacquired linked qualification materials remain human-review items.

Records: KNO-ETH-FALSIFICATION-001, KNO-DOT-ROADSIDE-REPORT-001, KNO-QUAL-L10-ACTIVATION-001.

## Vehicle change and coupling

1. Vehicle change: select the replacement vehicle, complete its documented inspection/DVIR workflow, and preserve the current required manual record for an earlier vehicle not represented in the latest-vehicle EOD summary.
2. Full DVIR/legal instructions remain human-review dependent because the controlling source set is incomplete.
3. Coupling: identify the installed equipment and follow the applicable manufacturer/current FedEx procedure.
4. Before movement, positively verify kingpin/fifth-wheel lock; for a dolly/lead-trailer connection also verify pintle latch and both safety chains.
5. Do not move equipment when any connection cannot be positively verified.

Records: KNO-FORGE-VEHICLE-CHANGE-001, KNO-LH-COUPLING-BASIC-001.

## Incorrect scan deletion

1. Was the package only scanned into an open stop, or was it actually delivered?
2. Open-stop scan only: identify the package, use Package Action > Delete Scan, and verify the remaining package list before closing.
3. Actual delivery or already-closed/transmitted stop: do not use scan deletion as recovery; escalate or use the applicable misdelivery branch.

Record: KNO-FORGE-DELETE-SCAN-001.

## Business-closure message

1. Identify whether closure is a recurring weekday, single date, or date range and whether it affects delivery, pickup, or both.
2. Create the Business Closure message with the actual address/details, send it to CPC, and verify the sent message.
3. The message does not complete the operational attempt or disposition; separately perform the required scan/status/package-handling procedure.

Record: KNO-FORGE-BUSINESS-CLOSURE-MSG-001.

## Delayed Login

1. Use Delayed Login only when offered through the documented authentication/network failure path.
2. Enter the required station/WAN, identity, vehicle, authorization, and on-duty information; treat work as unmanifested/unlisted while manifest, map, message, transfer, and sync functions are unavailable.
3. Do not guess missing package/stop data.
4. When service returns, authenticate with the same user ID, download the manifest, transmit/merge delayed stops, verify the merge, and complete EOD only after successful authentication.

Record: KNO-FORGE-DELAYED-LOGIN-001.

## Manifest Preview discrepancy and permissions

1. Before dispatch, determine whether a discrepancy represents a physically present package and confirm work-area ownership through the approved station process.
2. Add, insert, or resequence only after assignment is confirmed; failed network retrieval is not proof that no discrepancy exists.
3. If the application is unavailable because permissions were denied, confirm the installed version and use only authorized managed-device permission changes.
4. After dispatch, use current on-road processes; if permissions or discrepancies remain unresolved, contact device support/management rather than bypassing controls.

Records: KNO-FORGE-MANIFEST-PREVIEW-001, KNO-FORGE-MANIFEST-PERMISSIONS-001.

## Device use and audio settings

1. Do not interact with FORGE while driving or maneuvering; stop legally and secure the vehicle first.
2. Because the underlying device-use wording is version-sensitive, follow any newer company, station, or legal requirement when stricter.
3. In Settings, disable only the text-to-speech functions the current screen permits.
4. Continued Delivery Instructions or Pickup Closing audio is not by itself a malfunction when those functions are not user-toggleable; confirm version and escalate actual mismatches to support.

Records: KNO-FORGE-DEVICE-ROAD-001, KNO-FORGE-AUDIO-ALERTS-001.

## Disputed-delivery prevention

1. Verify the label and actual recipient address; never infer a house number.
2. Scan at the customer location when the real delivery or attempt occurs, and scan every attempt.
3. Apply the required signature/release and truthful non-delivery status.
4. Record the actual placement, indirect location, signature, door tag, and PPOD as applicable.
5. Leave the scanned/completed door tag visibly at the primary entrance—not on the package.

Record: KNO-DEL-DISPUTE-PREVENTION-001.

## Entered ZIP versus label-address correction

1. Is only the ZIP entered after scanning wrong, or is the shipping-label address itself wrong?
2. Entered ZIP only: use Edit Address > ReEnter, correct it exactly, and verify the stop.
3. Label address: obtain an authoritative correction and management/station authorization.
4. If a different delivery point cannot be verified and authorized, do not guess; use the applicable code-002/documentation path.

Record: KNO-FORGE-EDIT-ADDRESS-001.

## Drop-box settings, holiday, early last pickup, or listed serial

1. Identify the exact task: pickup settings, holiday closing, early last pickup, or listed-pickup serial entry.
2. If the question is who may choose a time/date or authorize an early pickup, the supplied guide does not establish role authority; route that decision for human review.
3. Pickup settings: unlock, verify/record the serial, enter the established weekday/Saturday settings, send them to the box, verify four checks, and tap FINISH. Exiting earlier makes no change.
4. Holiday Closing: select and confirm the established next pickup day and complete the connection/update; the exit warning means no modification.
5. Early Last Pickup: apply the option, open the box, then scan and close the pickup stop.
6. Listed serial: from the listed stop use Dropbox Manual Entry, scan or accurately key the inside-door barcode label, and tap DONE.

Records: KNO-PUP-DROPBOX-SCHEDULE-001, KNO-PUP-DROPBOX-SETTINGS-001, KNO-PUP-DROPBOX-HOLIDAY-001, KNO-PUP-DROPBOX-EARLY-LAST-001, KNO-PUP-DROPBOX-SERIAL-001, KNO-PUP-DROPBOX-CONNECTION-001.

## Facility vehicle entry and security screening

1. Ordinary personal vehicle or approved Alternative Vehicle?
2. Ordinary vehicle: park outside restricted secured/door areas and use the main pedestrian screening entrance.
3. Alternative Vehicle: enter only for designated loading/unloading, display the placard, carry one occupant, and leave immediately.
4. Follow posted weapons rules and submit to required screening.
5. When an item's classification or local-law interaction is uncertain, stop and ask the local FedEx senior manager.

Records: KNO-SEC-FACILITY-VEHICLE-001, KNO-SEC-WEAPONS-SCREENING-001.

## Security incident reporting

1. Is danger active? Get safe and call 9-1-1 first.
2. Do not resist for property or dismiss a threat.
3. Report the incident to FedEx immediately through management, assigned security specialist, or GSOC.
4. Preserve the vehicle/package, witness, police, and observation details.
5. Keep the incident number after an online Alert Line report.
6. For a stolen shipment-laden/branded vehicle, follow the separate unresolved GSOC caller/order branch.

Records: KNO-SEC-INCIDENT-REPORT-001, KNO-SEC-STOLEN-VEHICLE-001.

## Hand sheet or "Blue Sheet" during an outage

1. Read the exact official form number, title, and revision; do not infer identity from driver shorthand.
2. Determine whether the situation is the current OP-117 HAL outage branch, another outage scenario, or a different document family.
3. OP-117 supports current OP-207/OP-207Res for HAL only when FORGE or scanning is inoperable; obtain the station-approved form and current cover/flap instructions.
4. If form identity, revision, or complete instructions cannot be established, withhold a fill-out procedure and contact management/station.
5. Never treat the two unidentified photographed examples or their sample data/barcode lengths as proof of a current approved process.

Record: KNO-DOC-HANDSHEET-001.

## Multicode label and first-launch setup

1. For a recognized multicode label, scan one supported barcode for the package; never scan every displayed barcode or guess an unfamiliar format.
2. On first launch, identify the exact permission being requested and the installed FORGE version.
3. Enable only the current authorized managed-device permissions; if a required permission cannot be enabled or the prompt differs, contact device/FORGE support.
4. These April 2025 UI paths remain version-gated.

Records: KNO-FORGE-MULTICODE-001, KNO-FORGE-FIRST-LAUNCH-001.

## Normal login and dispatch

1. Confirm the actual assigned user role, station/work/service area, and vehicle type.
2. Enter the actual vehicle identity/odometer and actual on-duty time.
3. Respond truthfully to medical, vehicle, HOS, qualification, agreement, manifest, and service prompts.
4. A demo selection or Continue button is not authorization or compliance proof.
5. When any assignment, compliance, vehicle, duty-time, or hazmat-manifest condition is uncertain, withhold the dispatch procedure and contact management/station.

Record: KNO-FORGE-LOGIN-DISPATCH-001.

## Language setting and device information

1. Language: use the current Settings path, select an available language, and verify the displayed text changes.
2. Device identity: use Login, Settings > About, or EOD > User Info only if that path exists in the current version.
3. Provide support only the exact build/version/device field requested; do not guess or broadly disclose device identifiers.
4. If current menus differ, contact FORGE/device support.

Records: KNO-FORGE-LANGUAGE-001, KNO-FORGE-DEVICE-INFO-001.

## Standard listed multi-package delivery or pickup

1. Confirm the correct listed stop and whether every expected package is present.
2. Scan and account for every package actually delivered or accepted at pickup.
3. Branch away from the generic workflow for a missing package, partial delivery, zero/unlisted pickup, signature service, call tag, hazmat, COD, packaging problem, or other exception.
4. Reconcile the stop summary/count, complete required signature/name or pickup documentation, close the stop, and verify sync.
5. The precise April 2025 UI path requires current-version confirmation.

Records: KNO-FORGE-STANDARD-DELIVERY-001, KNO-FORGE-STANDARD-PICKUP-001.

## Unmanifested delivery creation

1. Establish why the package is unmanifested and verify its identity, shipping-label address, and route/work-area assignment.
2. Obtain management/station authorization before creating a delivery stop.
3. If authorized, scan it, select Delivery, use only source-supported address information, select the actual stop type, and follow the applicable delivery procedure.
4. Never treat Enter Stop Details as authority to invent a destination or self-assign another route's package.

Record: KNO-FORGE-UNMANIFESTED-DELIVERY-001.

## Hazmat delivery signature

1. Confirm the package is hazmat and identify any additional service restriction.
2. Never driver release or leave it unattended.
3. Complete delivery only through the required in-person signature path.
4. If no eligible recipient is available, complete the applicable non-delivery documentation, retain the package for station return, and contact management if that branch is unclear.

Record: KNO-DEL-HAZMAT-SIGNATURE-001.

## Alternate Signature

1. Identify the exact package service and signed tag/form/revision.
2. Determine whether the current authorized ALT scenario and current physical signature record apply.
3. Do not key a barcode, choose a line number, or record a recipient name until current eligibility and custody/submission instructions are confirmed.
4. Never treat an arbitrary signed note as delivery authorization or substitute this path for ISR, DSR, ASR, SRA, or outage procedures.

Record: KNO-DEL-ALT-SIGNATURE-001.

## FORGE pickup/delivery messaging

1. Determine whether the issue is routine coordination or requires an immediate emergency/safety channel.
2. For routine coordination, open Inbox/New Message and select the correct work area/service area.
3. Attach the correct stop reference and send accurate text or an applicable quick message.
4. Monitor the Inbox for a response; sending a message does not itself authorize or complete an exception procedure.

Record: KNO-FORGE-MESSAGING-001.

## Pickup service-type label

1. Read the exact FDO, SDO, PRP, CTG, SCH, AUT, or NAP label.
2. Use the older source definition only to identify the category; do not treat it as the full pickup procedure.
3. Clarify listed/unlisted state, ready/close information, package condition, and any exception.
4. Confirm the current definition/version before relying on market, timing, cancellation, or selection details.

Record: KNO-PUP-SERVICE-TYPES-001.

## Delivery-attempt expectation and three unsuccessful attempts

1. Determine whether the package can be driver released and how many unsuccessful attempts have occurred on different Service Days.
2. If it cannot be driver released, OP-119 establishes an expectation of delivery attempts on three different Service Days.
3. After three unsuccessful attempts, give the package to QA so the recipient can be contacted.
4. OP-117 says a further attempt remains possible, but the reviewed pages do not define who authorizes or schedules it; ask QA/station rather than claiming approval or prohibition.

Record: KNO-DEL-ATTEMPT-LIMIT-001.

## Pickup scan integrity

1. At the actual customer location and pickup time, scan every accepted package.
2. Reconcile the stop to the actual package count and condition.
3. If scanning technology fails, use the documented status-26/manual station-update branch.
4. Never omit a package or invent the pickup time, location, count, or scan event.

Record: KNO-PUP-SCAN-INTEGRITY-001.

## FORGE display or navigation preference

1. Safely stop and identify the exact display/navigation behavior to change.
2. Use the available current Settings path and relevant preference.
3. Verify the display result without changing any required service, scan, or safety action.
4. Because the source is FORGE 2.0.0, confirm current version/support when menus differ.

Record: KNO-FORGE-DISPLAY-NAV-SETTINGS-001.

## Manifest Preview filter or search

1. Confirm the task is before dispatch; Manifest Preview is not an on-route tool.
2. Use Summary/Expand, premium-service Filter, or Search by address, shipper, or SID.
3. Use map view only when the station map is available and treat all results as informational.
4. A displayed, absent, filtered, or mapped result does not authorize package reassignment or routing; use the separate approved manifest/assignment process.

Record: KNO-FORGE-MANIFEST-SEARCH-001.
## Customer trailer pickup security

Records: KNO-LH-CUSTOMER-TRAILER-SECURITY-001, KNO-SEC-ROUTE-001, KNO-LH-COUPLING-BASIC-001.

## Alternative Vehicle readiness

1. Confirm the vehicle is being onboarded under Alternative Vehicle Operations rather than treated as an ordinary personal vehicle.
2. Has the signed Statement of Lease been provided, and is a Statement of Sub-Lease also required because the service provider is not the owner?
3. Confirm registration, inspection, insurance information, and photos were provided.
4. Do not treat the vehicle as ready until a Unit number is assigned and the dashboard placard is provided.
5. Display the placard while providing service; escalate any incomplete approval, ownership, inspection, insurance, Unit-number, placard, or qualification status.

Record: KNO-VEH-ALT-ONBOARD-001.

## Trailer dock-pull verification

1. Before operation, inspect cargo and load-securing devices and confirm the load is properly loaded and secure.
2. Get out for a visual inspection immediately before pulling.
3. Confirm dock plates are down or detached and the trailer and dock doors are closed.
4. If direct visual confirmation is unavailable, use the documented alternative checks as appropriate.
5. At a customer location, seek customer confirmation; if readiness still cannot be verified, notify FedEx.
6. If neither customer nor FedEx can verify readiness, leave the trailer and do not pull it.

Record: KNO-LH-TRAILER-DOCK-PULL-001.

## P&D road-test readiness and completion

1. Before the road test, confirm the DOT application/physical, criminal-history and MVR checks, and defensive-driver training are complete.
2. Confirm the administrator is a Qualified Provider or currently eligible Certified Trainer.
3. Complete the pre-trip inspection, range/obstacle-course, and at least ten miles of on-road driving.
4. Document the observation on the applicable Qualified Provider-supplied Record of Road Test.
5. Road-test completion is one qualification gate; do not assign service until the remaining activation statuses are also confirmed complete.

Records: KNO-QUAL-PD-ROADTEST-001, KNO-QUAL-L10-ACTIVATION-001.

## P&D qualification sequence and observed hours

1. Before road practice or road test, confirm all required Driver Safety and Background Standards are satisfied.
2. Complete knowledge validation, skill check, and the road test over no fewer than three calendar days before observed hours begin.
3. Confirm the accompanying Certified Trainer or Qualified Observer is currently eligible.
4. Within 21 calendar days after the successful road test, complete at least eight behind-the-wheel hours over no fewer than two calendar days while providing Services in the type of CMV to be operated.
5. Complete the named observed-hours form and Qualified Provider recordkeeping; final activation remains a separate gate.

Records: KNO-QUAL-PD-SEQUENCE-001, KNO-QUAL-OBSERVER-001, KNO-QUAL-L10-ACTIVATION-001.

## Qualified Observer eligibility

1. Open MBA > Workforce Information > Qualification Certification.
2. Find the exact person under Certified Trainer/Qualified Observer Conditions and select Click to view.
3. Use the person as a Qualified Observer only if Observer Conditions Met currently says Yes.
4. If the result is No, blank, unavailable, or mismatched, use another eligible person or contact qualification management.

Record: KNO-QUAL-OBSERVER-001.

## Qualification Certification recertification

1. Check the exact person's compliance date in MBA; Qualification Certification expires 24 months after issuance.
2. Complete the current recertification knowledge validation.
3. Complete the skill check, including driving range and road practice.
4. Confirm the updated MBA status before assignment and separately satisfy CDL, vehicle-size, background, medical, or activation gates that apply.

Record: KNO-QUAL-RECERT-001.

## Larger vehicle qualification

1. Identify the exact larger weight or size vehicle to be assigned.
2. Confirm a Qualified Provider or currently eligible Certified Trainer will administer the test.
3. Successfully complete the road test in the size vehicle to be operated.
4. Record and verify the resulting qualification before assignment.

Record: KNO-QUAL-VEHICLE-UPGRADE-001.

## Package placement hazard

1. Confirm driver release is allowed and review the customer instructions.
2. Does the proposed placement create theft/weather risk, block a door or accessibility ramp, or expose the package or property to garage-door/vehicle damage?
   - Yes: choose a safe alternative entrance/location or contact the customer/station.
   - No: continue the normal secure-placement and PPOD checks.
3. If the driveway is unsafe for truck travel, do not force access; obtain another arrangement.
4. If a large package needs handling equipment, use appropriate equipment and do not toss or throw it.
5. If no qualifying safe placement or approved alternative exists, use the no-safe-place attempt/documentation/return branch.

Records: KNO-DEL-PLACEMENT-HAZARD-001, KNO-DEL-SAFEPLACE-001, KNO-DEL-PPOD-001.

```text
Customer trailer pickup
  -> Is a functioning combination lock applied using code 1503?
      -> No: do not begin transport; obtain the required control and escalate if it cannot be applied
      -> Yes: continue
  -> Is a FedEx-provided plastic seal applied?
      -> No: do not begin transport; obtain the required control and escalate if it cannot be applied
      -> Yes: the source-established trailer-security controls are satisfied
  -> Coupling and other movement-safety requirements remain separate and still apply
```

The Security page directly establishes the lock-and-seal rule. Separate lock-operation and FAQ documents remain unreviewed and cannot be used to add exceptions or steps.

## Red traffic signal

1. Is the traffic signal red?
   - Yes: stop; do not run the red light.
   - No: this record does not establish the applicable signal procedure.
2. Do not infer right-on-red, emergency-direction, or jurisdiction-specific exceptions from this source.

Record: KNO-SAF-REDLIGHT-001.

## Sideswipe-collision prevention

1. Identify whether the immediate task is following, turning, merging, or changing lanes.
2. Operate at a safe speed and maintain a safe following distance.
3. In ideal conditions below 40 mph, use at least one second per ten feet of vehicle length; above 40 mph, add one second.
4. Check mirrors every 8–10 seconds and remain aware of traffic entering and leaving blind spots.
5. When turning a corner, double-check for passenger vehicles.
6. Before changing lanes, signal well in advance and scan adjacent traffic and road hazards; then move smoothly and safely.
7. If conditions are adverse, do not invent an adjustment from this module—the source supplies only the ideal-condition formula.

Record: KNO-SAF-SIDESWIPE-001.

## Summer hydration

1. Drink one cup (8 ounces) of water every 15–20 minutes.
2. Avoid dehydrating drinks containing caffeine, alcohol, or sugar.
3. Do not wait until thirsty; continue hydration throughout the day.
4. If an individualized medical restriction or instruction applies, this general source does not resolve it.

Record: KNO-SAF-HYDRATION-001.

## Summer traffic and work zones

1. Scan 15 seconds—approximately one-quarter mile—ahead for traffic, work zones, and other hazards.
2. Obey speed limits and determine whether weather or traffic requires slower travel.
3. Signal and brake early enough for others to recognize the driver's intent.
4. Get enough rest and buckle up.

Record: KNO-SAF-SUMMER-TRAFFIC-001.

## Sun exposure during route work

1. Is the driver exposed to sustained sunlight?
   - Yes: use protective measures such as sunscreen, sunglasses, long sleeves, and a hat.
   - No: no action from this branch is established.
2. Do not infer sunscreen rating, reapplication timing, diagnosis, or treatment from this source.

Record: KNO-SAF-SUN-EXPOSURE-001.

## Distraction while driving

1. Is the vehicle being driven?
   - Yes: keep focus on driving and avoid the source-listed distracting activities.
   - No: this record does not establish the complete stopped/secured device-use policy.
2. While driving, do not text or dial, use apps or a dispatch device, take photos/video, reach for or move objects, adjust the radio, eat, drink, smoke, groom, or apply makeup.

Records: KNO-SAF-DISTRACTION-001, KNO-FORGE-DEVICE-ROAD-001.

## Closed business assigned delivery

1. Confirm the stop is non-residential and no eligible signature or authorized-release path permits delivery.
2. If confirmed, use the human-reviewed code-004, door-tag, package-crossing, SID-removal, and custody branch.
3. If stop classification or release eligibility is unclear, contact the BC or station.

Record: KNO-DEL-BUS-CLOSED-001.

## FORGE floating action button

1. Open Settings and select the desired Floating Button Action under Stop Detail Preferences.
2. Before using the button on Stop Details, confirm its displayed action matches the intended task.
3. Apply the normal operational and documentation requirements for that task.

Record: KNO-FORGE-FLOATING-ACTION-001.

## Pickup receipt

1. Was at least one package successfully picked up?
   - Yes: select the pickup-receipt checkbox on Stop Summary and print at the Pickup Receipt step.
   - No: the source says the receipt option is unavailable.
2. Confirm the printed receipt contains the pickup details and tracking numbers.

Record: KNO-PUP-RECEIPT-001.

## Pickup package-weight prompt

1. Does FORGE mark weight optional or required?
   - Optional: enter the known weight or continue without a value.
   - Required: enter an accurate package weight before continuing.
2. Keep any separately prompted Dry Ice weight in its own field.

Record: KNO-PUP-WEIGHT-ENTRY-001.

## FORGE device-time login block

1. Verify the device date, time, and time zone.
2. Correct the clock through approved managed-device settings and retry login.
3. If the clock is correct and the error persists, contact device/FORGE support.

Record: KNO-FORGE-DEVICE-TIME-001.

## FORGE Shuttle Transfer

1. Confirm Shuttle Transfer is available to the authorized user and identify the source work area.
2. Enter the source work area, scan or key-enter each actual package, and remove any incorrect entry.
3. Select Done only after a valid work area and at least one valid package are present.
4. Confirm the closed station-address stop and code-95 results; do not count the packages as route deliveries.

Record: KNO-FORGE-SHUTTLE-TRANSFER-001.
