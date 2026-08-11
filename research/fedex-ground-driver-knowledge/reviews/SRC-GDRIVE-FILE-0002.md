# Source review: SRC-GDRIVE-FILE-0002

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction plus visual review of all 16 rendered pages
- Document identity: OP-119, last update 9/9/24 (Drive filename says 10/28/24 and requires metadata reconciliation)
- Scope: customer-experience obligations across pickup, delivery, package care, scanning, service offerings, security, and media/recording

## Page map

- Pages 1-3: authority, limitations, and service-provider obligations.
- Pages 4-5: pickup flow, packaging expectations, escalation of recurring packaging/label concerns, and pickup-service taxonomy.
- Pages 6-8: residential/commercial definitions, delivery-attempt expectation, handling, package placement, and appearance.
- Pages 9-11: tracking events, point-of-service scanning, inaccurate practices, and delivery status-code reference.
- Pages 12-13: ISR/DSR/ASR, age verification, alcohol, central receiving, tobacco/e-cigarettes, and signature/release matrix.
- Pages 14-15: driver release, photo-at-delivery, prohibited release categories, indirect delivery, premium services, and security.
- Page 16: recording, media, publication, and social-media restrictions.

## High-value conditional findings

- Page 5 distinguishes FDO, SDO, PRP, CTG, SCH, AUT, and NAP pickups. Call tags are physically return pickups but are processed as a delivery in FORGE and require a delivery status code even for unsuccessful attempts.
- Page 6 says commercial means all delivery locations other than a home/private residence with no apparent commercial activity. It states three service-day attempts when a package cannot be driver released, subject to later/current-source reconciliation.
- Page 12 models signature type as a mandatory clarification. ISR, DSR, and ASR have materially different locations, release methods, and age/ID requirements.
- Page 12 permits manual date-of-birth entry only after an ID scan attempt and only when the recipient declines the scan or the barcode cannot be read. Refusal to provide ID for age verification means the ASR package is returned to the station.
- Pages 12-13 impose additional alcohol restrictions, including verified age, adult signature, no visibly intoxicated recipient, and no indirect/driver/door-tag release.
- Page 13 allows certain central-receiving deliveries only when someone is available to sign and the other applicable requirements are met.
- Page 14 describes the qualifying conditions and required tracking artifacts for driver release and PPOD.
- Page 15 lists categories not to driver release, then separately defines indirect-delivery documentation: alternate-location address, signature there, and completed/scanned door tag left at the original delivery address.

## Potential conflict or change candidates

- OP-119 is older than OP-117. All operational statements require comparison to OP-117 before promotion.
- The filename's 10/28/24 date does not match the document body's 9/9/24 last update.
- The tobacco/e-cigarette prohibition includes a limited commercial-shipper exception and must not be flattened into an unconditional rule.
- The three-attempt statement may interact with service type, customer instructions, HAL/RTH, or later status rules.

## Complete-PDF reconciliation

The all-Drive page-accountability pass classifies all 16 pages in `knowledge/drive_pdf_page_coverage.csv`. It promoted source-bounded pickup-service terminology, the corroborated three-attempt delivery limit, and pickup scan-integrity obligations. Front matter, presentation context, and the older status reference remain explicitly separated; current pickup-service definitions/selection criteria are tracked as `REFSRC-035` rather than inferred.
