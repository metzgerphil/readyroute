# Source review: SRC-GDRIVE-FILE-0006

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction plus visual review of all three rendered pages
- Document label: optimized to FORGE 2.2.0; filename claims revision 6/10/25
- Scope: call-tag identification, stop creation/selection, and closeout branches

## Page coverage

- Page 1: call-tag purpose, list placement, scanning, delivery-versus-pickup choice, address handling, action selection, stop type, and stop close.
- Page 2: five all-stop/branch actions and the all-call-tags status-code flow.
- Page 3: per-package call-tag action flow.

## Decision structure

- The scanned tag must first be associated with the correct delivery or pickup stop; pickup address fields appear when `Not On List` is selected.
- Stop close branches among: all tags picked up (code 29); all tags delivered; all tags receive a status code; handle tags individually; or all tags cancelled for suspected fraud (code 106).
- Some status choices require a separate reason-code selection.
- The individual path applies the selected action/status/reason only to the currently scanned call tag.

## Interpretation limits

- This guide establishes the device workflow but does not enumerate the conditions for every available status/reason code.
- The meaning of `All Call Tags delivered` and the apparent delivery-versus-pickup duality must be presented carefully; OP-119 describes call tags as processed as a delivery in FORGE even though the physical task is normally a return pickup.
- Reconcile with OP-117 pages 52-54 and the comprehensive FORGE application guide before creating verified driver-facing instructions.

