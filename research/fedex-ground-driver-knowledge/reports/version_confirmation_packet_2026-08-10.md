# Ready Route current-version confirmation packet

Status date: 2026-08-10

## Purpose

This packet contains the exact 20 canonical `POTENTIALLY_OUTDATED` records. These records are not unresolved because the older evidence was lost: every row has durable evidence capture and exact claim allocation. They remain gated because the controlling product behavior, policy, or pickup-service definition may have changed.

The machine-readable queue is [`knowledge/version_confirmation_queue.csv`](../knowledge/version_confirmation_queue.csv). It preserves each existing source/version and locator, the exact update needed, current safe boundary, responsible owner class, source-gap dependency, and publication gate.

## What closes a row

For each row, obtain and preserve:

1. The current authorized source bytes or a durable authorized capture.
2. Source title, application version/build, effective date, geography, role, device/platform scope, and exact pages or screens.
3. A claim-by-claim comparison showing whether the existing behavior is unchanged, changed, removed, or not addressed.
4. Material conditions, exceptions, and operational-authority boundaries.
5. The named authorized owner and determination date if the controlling source is unavailable or leaves a material ambiguity.
6. The source identity, checksum, inventory entry, capture coverage, mapping, claim allocation, evaluation impact, and supersession relationship required by the normal ingestion workflow.

A current-looking screen, filename, date, informal recollection, or newer document that does not match the applicable geography/product role is insufficient. A new source that conflicts with active `READY_ROUTE_APPROVED` knowledge must reopen the applicable adjudication rather than silently override it.

## Lane 1 — safety and current policy

| Priority | Knowledge ID | Existing basis | Current confirmation needed |
| ---: | --- | --- | --- |
| 1 | `KNO-FORGE-DEVICE-ROAD-001` | FORGE 1.0.0 Quick Start Guide, 2023 | Current exact device-use safety wording and the controlling interpretation of “while on road.” |

## Lane 2 — mainstream service and data integrity

| Priority | Knowledge ID | Existing basis | Current confirmation needed |
| ---: | --- | --- | --- |
| 2 | `KNO-FORGE-STANDARD-DELIVERY-001` | FORGE 2.8.0 application guide, 2025-04-01 | Routine multi-package delivery close sequence and signature/name requirements. |
| 3 | `KNO-FORGE-STANDARD-PICKUP-001` | FORGE 2.8.0 application guide, 2025-04-01 | Routine listed-pickup scan, count, threshold, and close sequence. |
| 4 | `KNO-FORGE-DOWNLOAD-SYNC-001` | FORGE 2.8.0 guide plus Download Pickup List 2.2.0, 2025-06-10 | Pickup-list/manifest download, refresh, outage, and safe-service boundaries. |
| 5 | `KNO-FORGE-SYNC-QUEUE-001` | FORGE 2.8.0 guide, 2025-04-01 | Sync-status symbols, manual upload, retry behavior, and duplicate-event safeguards. |
| 6 | `KNO-FORGE-SPLIT-DELIVERY-001` | FORGE 2.8.0 guide, 2025-04-01 | Split/partial-close behavior and documentation requirements. |
| 7 | `KNO-FORGE-COMBINE-DELIVERY-001` | FORGE 2.8.0 guide, 2025-04-01 | Combine-address UI behavior and operational-authorization boundary. |
| 8 | `KNO-FORGE-MERGE-PICKUP-001` | FORGE 2.8.0 guide, 2025-04-01 | Zero-package revisit and unlisted-to-listed pickup assignment behavior. |
| 9 | `KNO-FORGE-COMMENT-SCOPE-001` | FORGE 2.8.0 guide plus OP-117 v2, 2025-12-15 | Package-versus-stop comment behavior and supported operational use. |
| 10 | `KNO-FORGE-MULTICODE-001` | FORGE 2.8.0 application guide, 2025-04-01 | Supported multicode label formats and barcode-selection behavior. |

## Lane 3 — device access and operational support

| Priority | Knowledge ID | Existing basis | Current confirmation needed |
| ---: | --- | --- | --- |
| 11 | `KNO-FORGE-MANIFEST-PERMISSIONS-001` | Manifest Preview 4.5.0 guide, 2024-10-10 | Current permission names and authorized managed-device remediation. |
| 12 | `KNO-FORGE-FIRST-LAUNCH-001` | FORGE 2.8.0 application guide, 2025-04-01 | Current first-launch permission prompts and authorized remediation. |
| 13 | `KNO-FORGE-MANIFEST-SEARCH-001` | Manifest Preview 4.5.0 guide, 2024-10-10 | Search/filter/map behavior and assignment-authority boundary. |
| 14 | `KNO-FORGE-TIME-REMINDER-001` | FORGE 2.8.0 guide, 2025-04-01 | Reminder timing and confirmation that reminders do not replace service-window escalation. |
| 15 | `KNO-FORGE-MESSAGING-001` | FORGE 2.8.0 application guide, 2025-04-01 | Recipients, stop references, presets, sync behavior, and emergency-use boundary. |

## Lane 4 — settings, reference, and product taxonomy

| Priority | Knowledge ID | Existing basis | Current confirmation needed |
| ---: | --- | --- | --- |
| 16 | `KNO-PUP-SERVICE-TYPES-001` | OP-119, 2024-09-09 | Current pickup-service labels, definitions, availability, timing, and selection criteria. |
| 17 | `KNO-FORGE-AUDIO-ALERTS-001` | FORGE Settings 2.0.0, filename revision 2025-06-10 | Current delivery-instruction and pickup-closing audio controls. |
| 18 | `KNO-FORGE-DISPLAY-NAV-SETTINGS-001` | FORGE Settings 2.0.0, filename revision 2025-06-10 | Current navigation-provider and stop-list/display settings and safety constraints. |
| 19 | `KNO-FORGE-DEVICE-INFO-001` | FORGE 2.8.0 and Settings 2.0.0 guides | Current version/build/device-information paths and identifier-disclosure policy. |
| 20 | `KNO-FORGE-LANGUAGE-001` | FORGE 2.8.0 application guide, 2025-04-01 | Current language-setting path and effect. |

## Acquisition routing

- Nineteen rows depend on `REFSRC-022`, the current production FORGE application guide and release/version notes. Existing authenticated destinations `MGB-NAV-0044`, `MGB-NAV-0068`, and `MGB-NAV-0070` are contextual leads, not proof that the exact controlling source is present.
- `KNO-PUP-SERVICE-TYPES-001` depends on `REFSRC-035`. No exact authenticated acquisition-queue target is currently known; authorized discovery must identify the controlling pickup-service source without guessing from a title.

## Reconciliation rule

Confirmation does not mean replacing the old row in place. Preserve the existing source and version, ingest the new source as a distinct identity, compare the exact claims, record supersession or unresolved conflict, update affected records and evaluations, regenerate `/knowledge`, and rerun the full corpus, canonical-release, retrieval, and checksum validations.
