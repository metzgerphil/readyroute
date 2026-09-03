# ReadyRoute — Post-Update Verification & New Findings Report

**Report date:** September 1, 2026  
**Received by Ready Route:** September 3, 2026  
**Tester:** Vlad, live driver app

This file preserves the operational findings and field procedures supplied by the Ready Route product owner in the September 3 workspace session. The product owner's standing direction is to follow Vlad's field-verified mechanics within their stated scope.

## Confirmed live behavior

The post-update app correctly answered smoke from the van, dizziness while driving, downed power lines, flat tire and triangle placement, a customer-requested address change, and duplicate tracking numbers. The locked-keys and known-vehicle-number barcode regressions were also confirmed fixed.

## Owner-authorized additions and corrections

### Unsafe road or structure prevents access

Apply Code 001 whenever it is unsafe to drive to a delivery location, for any reason. Add a comment explaining the specific reason so the station knows what happened.

Examples include an unsecured bridge or structure, a washed-out or flooded road, ice or snow making a road impassable, large potholes or road damage, a driveway too steep or unpaved for the vehicle, a fallen tree or debris, construction blocking access, loose livestock or animals blocking the only path, insufficient clearance, or no safe place to turn around.

### GroundCloud shows the wrong route

Call your BC.

### Driver believes the whole route cannot be completed

Call your BC.

### One leaking package and other good packages for the same address

Deliver everything that looks fine. Apply the applicable leaking-package branch only to the leaking package.

### Leaking package branches

- If hazardous: park in a safe place and call your BC.
- If not hazardous: apply Code 010, cross the package, remove the Vision Label/SID sticker, and bring it back to the station.

### Hand-sheet mechanics

- Date: the day the delivery actually happened.
- Tracking number: write four digits per cell.
- Street: write the first four letters of the street name.
- Time: use military time; for example, 1:00 p.m. is 13:00.
- Code 14: residential delivery with no signature.
- If a signature is required: the customer signs, and the driver writes the customer's first initial and full last name.

The prior driver-facing OP-207 and OP-207Res form-name claims are disputed by this field verification and must not remain active while the conflict is unresolved.

Implementation review found that those form names came from the previously approved `KNO-DOC-HANDSHEET-001` corpus record, which cited OP-117 page 44; they were not newly authored by the AI model. The operational problem was still real: the system presented that older determination confidently after current field evidence challenged it. The approval is therefore reopened, the record is withheld, and its source history remains preserved for reconciliation.

### Crossing a package

Use the four-quadrant service-cross format:

- Top-left: status code plus driver name or initials.
- Top-right: time.
- Bottom-left: date.
- Bottom-right: Work Area number.

### Key Enter Tracking discrepancy

Vlad reported this current field path: tap the top-right of the screen, select **Key Enter Tracking**, enter the specific long number, and use hand sheets if that does not work. This conflicts with the preserved FORGE guide's **Stop Options → Key Enter Barcode → Free Form/EPIC/Air Waybill → ACCEPT** path.

Neither path is approved for publication until the current FORGE screen is directly verified. Ready Route must fail closed for this discrepancy.

### Default no-answer wording

When Ready Route does not have a verified procedure, the driver-facing next step is: **Call your BC.**

## Reopen conditions

Reopen any affected determination if Phillip or Vlad revises the supplied procedure, a current FORGE screen capture resolves the manual-entry discrepancy, or later applicable operational, company-policy, safety, or regulatory guidance materially conflicts with it.
