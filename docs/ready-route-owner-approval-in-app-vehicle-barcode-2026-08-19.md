# Ready Route owner approval — in-app vehicle barcode workflow

## Decision

Phillip Metzger, Ready Route product owner, approved an in-app Code 128 vehicle-barcode workflow for Ready Route Answers on 2026-08-19.

When a driver asks about Code 128, cannot find the vehicle-scan barcode, or asks Ready Route to create or generate a barcode, Ready Route asks exactly: “What is the vehicle number?” The next message in that conversation is treated as the vehicle number. Ready Route constructs the encoded value by placing an uppercase `V` immediately before the supplied value and generates a Code 128 barcode inside the application.

The barcode and its human-readable encoded value must be displayed in Ready Route. No external barcode-generator website, additional Code 128 confirmation, vehicle lookup, or unnecessary vehicle-number validation is required.

## Examples

- Vehicle number `400770` encodes as `V400770`.
- Vehicle number `123456` encodes as `V123456`.
- Vehicle number `90821` encodes as `V90821`.

## Scope and safeguards

1. The workflow is specific to the approved vehicle-scan barcode use case.
2. Ordinary package, pickup, delivery, SRA, and tracking-barcode questions retain their existing procedures unless the driver explicitly asks Ready Route to create or generate a barcode.
3. Pending vehicle-number state is scoped to the authenticated Ready Route conversation.
4. The encoded symbology is always Code 128.
5. The earlier external-generator workaround remains preserved as superseded history.

## Approval metadata

- **Approved by:** Phillip Metzger, Ready Route product owner
- **Approval date:** 2026-08-19
- **Effective date:** 2026-08-19

## Reopen conditions

- Phillip revises the in-app workflow.
- The accepted vehicle barcode prefix or symbology changes.
- A later application or operational requirement materially conflicts with this workflow.
