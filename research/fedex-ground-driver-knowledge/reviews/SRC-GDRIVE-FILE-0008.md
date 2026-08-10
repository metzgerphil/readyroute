# Source review: SRC-GDRIVE-FILE-0008

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction, page-by-page reading, and visual review of all 246 rendered pages
- Document identity: FORGE P&D Application Guide, Version 3.00, dated 4/1/2025, optimized to FORGE 2.8.0
- Stated scope: legacy FedEx Ground users only
- Interpretation limit: this is primarily an application-workflow guide. A demonstrated screen path does not necessarily establish the controlling operational rule when a newer operational guide or the ISP Agreement differs.

## Complete page map

- Pages 1-4: identity, version, authority/copyright notes, and table of contents.
- Page 5: demonstration barcodes and the one-barcode-per-package warning.
- Pages 6-7: user types and vehicle types.
- Pages 8-22: application permissions, login, station/map/vehicle selection, on-duty state, hazardous-material manifest prompt, time-definite prompts, and data notices.
- Pages 23-27: screen layout, stop/package icons, action menus, language settings, and premium-service indicators.
- Pages 28-42: listed multi-package business delivery, listed multi-package pickup, unmanifested residential delivery, and unlisted retail pickup.
- Pages 49-58: stop-level versus package-level delivery status codes and their different scope.
- Pages 59-61: zero-package pickup closeout.
- Pages 62-72: misdelivery pickup, same-day redelivery, and the separate treatment of packages not successfully redelivered.
- Pages 73-85: indirect delivery, residential release and photo handling, and business release.
- Pages 86-96: international pickup documentation and ASR delivery/identification flow.
- Pages 97-103: COD and SenseAware delivery.
- Pages 104-109: pharmacy and critical-healthcare delivery.
- Pages 110-116: HAL selection/transfer and hazmat delivery.
- Pages 117-137: unlisted hazmat, call-tag, and SenseAware pickup workflows.
- Pages 135-142: bulk delivery and bulk pickup manifests.
- Pages 143-169: combine, split, revisit, and merge workflows for delivery and pickup stops.
- Pages 170-177: package comments and stop comments.
- Pages 178-188: manual barcode entry, address editing, scan deletion, and alternate door-tag/signature capture.
- Pages 189-201: end-of-day workflow and manifest/pickup-list download, refresh, and restrictions.
- Pages 202-223: drop-box NFC, BLE, manual-code fallback, early-last-pickup, holiday-closing, and configuration paths.
- Pages 224-232: bulk transfer, vehicle change/DVIR, and sync status.
- Pages 233-239: camera scanning, navigation, reminders, notifications, messages, and business-closure requests.
- Pages 240-246: demonstration barcodes, invalid-check-digit behavior, login validation, and device/application information.

## High-impact decision variables

- Stop scope: whether an action/status applies to every package in the stop or only a selected package.
- Stop identity: listed, unlisted, manifested, retail, residential, business, combined, split, revisited, or merged.
- Attempt outcome: delivered, recovered misdelivery, same-day redelivered, partially redelivered, or zero-package pickup.
- Package/service type: ASR, COD, international, pharmacy, critical healthcare, HAL, hazmat, call tag, SenseAware, or bulk.
- Device state: hardware scanner available, camera fallback enabled, barcode check digit valid, synchronization complete, or connection path failed.
- Drop-box connection state: NFC, BLE, or authorized manual-code fallback.
- Vehicle state: initial vehicle, vehicle change, rental/tractor bulk workflow, or contractor-owned bulk threshold.

## Material sequences that must remain intact

- Misdelivery pickup followed by same-day redelivery, including code 17/code 18 handling and partial-redelivery treatment (pages 62-72).
- International pickup with separate confirmation of package and required documents (pages 86-91).
- COD capture of amount, check number, check count, and currency (pages 97-101).
- SenseAware pickup when the tag is healthy, unhealthy, unresponsive, or absent (pages 131-134).
- HAL package selection and transfer; the operational authorization for moving a non-HAL package must come from the controlling guide (pages 110-114).
- Bulk pickup manifest choice and vehicle/package-count conditions (pages 138-142).
- Combining, splitting, revisiting, and merging stops without losing package/stop scope (pages 143-169).
- End-of-day completion, vehicle details, odometer/DVIR prompts, and manual treatment of earlier vehicles (pages 189-196 and 229-231).
- Drop-box fallback order from NFC to BLE to manual procedure and its configuration prerequisites (pages 202-223).

## Confirmed conflict requiring human resolution

- Pages 83-85 demonstrate a business driver-release flow when no OP-201 is on file; after the warning prompt, selecting `OK` releases the packages.
- OP-117 v2 page 27, dated 12/15/2025, says that without an OP-201 on file the package must not be released, a door tag is left, and the package is returned to station.
- The two instructions cannot both be converted into one approved driver answer. This is recorded as `CONFLICT`; the production answer must withhold a procedure and direct the driver to management until the controlling source is established.

## Reconciliation and version risks

- The guide predates OP-117 v2 by approximately eight months and is optimized to FORGE 2.8.0; later application behavior may differ.
- The guide's UI steps establish how the application represented workflows in April 2025, but operational policy must be reconciled with the newer OP-117 and the controlling ISP Agreement.
- COD, bulk, pharmacy, critical-healthcare, and alternate-signature scenarios need corroboration from controlling operational sources before broad driver-facing publication where this guide is the only evidence.
- Embedded links in the drop-box section point to additional guides that remain separate sources to acquire and inventory.

## Exact page-to-knowledge reconciliation

The later completeness pass parses every `SRC-GDRIVE-FILE-0008` locator and reconciles all 246 pages in `knowledge/forge_page_coverage.csv`.

- 236 pages map to one or more operational knowledge records.
- Page 1 is governing/version front matter and pages 2-4 are contents.
- Pages 23-24 are annotated UI screen references; page 27 is an icon glossary.
- Page 235 is a navigation-button/icon reference and does not establish routing or safe-driving policy.
- Pages 240-241 contain demonstration barcodes only and are not production package data.
- No page remains unclassified.

The pass discovered eleven previously unmodeled subjects: multicode one-barcode scanning, first-launch permissions, login/dispatch setup, language settings, baseline listed delivery, baseline listed pickup, unmanifested delivery creation, hazmat delivery signature/no-release, Alternate Signature, work-area/CPC messaging, and device-information lookup. Seven UI-dependent records are `POTENTIALLY_OUTDATED`, three authority/artifact-dependent records are `HUMAN_REVIEW_REQUIRED`, and the hazmat no-driver-release/in-person-signature record is `VERIFIED` through current OP-117 corroboration.

The pass also added exact FORGE evidence to existing indirect delivery, PPOD, ASR, unlisted pickup, call-tag scope/fraud, and business-closure-message records. It did not promote a demo screen into policy authority or erase the OP-201 conflict.
