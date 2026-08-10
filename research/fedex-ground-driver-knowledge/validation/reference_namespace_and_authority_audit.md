# Reference namespace and authority audit

Status date: 2026-08-09

Purpose: prevent a numeric code from being interpreted without its operational namespace and verify that every status/reason entry is source-traceable to reviewed authoritative material.

## Dataset result

- 50 `DELIVERY_STATUS` records use three-digit codes.
- Seven active `PICKUP_REASON` records use two-digit codes.
- Every record has a nonempty label, applicability statement, scope-note list, source ID, exact locator, source version, and knowledge status.
- Every cited source exists in the primary inventory, is reviewed, and is not a `SECONDARY_REFERENCE`.
- Delivery status results: 48 `VERIFIED`, one `HUMAN_REVIEW_REQUIRED` (code 362), and one `POTENTIALLY_OUTDATED` (code 030).
- Pickup reason results: one `VERIFIED` (scanner-failure reason 26) and six `HUMAN_REVIEW_REQUIRED` pending current OP-321 conditions. Four version-ambiguous historical reasons discovered in a rejected partial source are excluded from the active layer.

## Numeric collisions

Six numbers exist in both active namespaces:

| Number | Delivery status | Pickup reason |
|---|---|---|
| 10 | `010` Inspection Required | `10` Pickup Not Ready — Dispatch Again |
| 11 | `011` Non-residential Recipient Closed on Weekend | `11` Closed — Attempted, No Packages |
| 15 | `015` Holding Package | `15` Residential Pickup, Not Home |
| 17 | `017` Misdelivered Package Picked Up | `17` Hazmat — Pickup Not Made |
| 21 | `021` Business Driver Release | `21` Express Pickup — Cancel |
| 26 | `026` Return-to-Shipper Package Delivered to Shipper | `26` Pickup Not Scanned Due to Scanner Failure |

Every colliding record now has a symmetric note naming the other namespace. A driver statement such as “code 17” is therefore insufficient: retrieval must first determine delivery-status versus pickup-reason context.

The later operational-translation audits add a second guard: all 50 delivery statuses and all seven active pickup reasons have one-to-one classification ledgers. A verified label is not treated as a complete workflow, and a linked reference cannot override a limiting pickup-reason status while OP-321 is missing.

## Regression controls

The reference validator now rejects:

- Missing or incorrect namespace values.
- Non-three-digit delivery statuses or non-two-digit pickup reasons.
- Duplicate codes inside a namespace.
- Missing label, applicability, version, locator, or source identity.
- Evidence from unknown, unreviewed, or secondary sources.
- A cross-namespace collision without warnings on both records.
- Any unexpected change to the currently audited collision set.

The fixed collision-set assertion is intentionally conservative. A newly acquired OP-324 or OP-321 revision that adds/removes codes must trigger a deliberate audit update rather than silently changing number interpretation.

## Remaining source limits

Current OP-324 and OP-321 remain unacquired. The tables preserve only what the reviewed current source set establishes, including status-code 030's version risk and code 362's unresolved availability wording. Pickup reasons 01, 14, 16, and 25 from the rejected version-ambiguous source are not retained. The presence of a label is not permission to use a code when complete selection conditions are absent.
