# ReadyRoute — Extended Testing Session Report

**Report period:** August 2026, post-update build
**Preserved by Ready Route:** 2026-09-01
**Testers:** Vlad (live app, phone) and Claude (RRA Test Console, browser automation)
**Scope:** 32 planned systematic questions plus approximately nine live-app scenarios.

## Engineering findings

The session reported three system-level retrieval failures:

1. Unknown questions such as “What does DNA mean in delivery status?” and “What does OP-201 mean?” received the same unrelated Code 004 shipper-release procedure instead of an unavailable answer.
2. Definition questions frequently routed to operational records that merely contained a similar term.
3. Terse incident statements such as “Dog bit me” failed even when the same incident followed by “What should I do?” selected the correct record.

The report also identified these distinct mismatches, which are regression cases rather than approved operating procedures:

- Locked keys in a vehicle routed to a threat/confrontation flow.
- A customer recording a driver routed to an accident/injury flow.
- Two packages with the same tracking number routed to the duplicate-address procedure.

These software observations do not create driver instructions. A case with no approved matching record must fail closed.

## Owner-approved operational additions

### General customer complaint

For the question “Customer wants to make a complaint,” Vlad supplied:

1. Give the customer your BC’s phone contact.
2. Call your BC yourself to let them know what is going on.

This is a general-complaint procedure. It is not the CXPC Pickup Research Request procedure unless the facts establish that CXPC sent a Pickup Research Request about a missed pickup.

### Scanner low battery

For a scanner that is dying or low on battery, Vlad supplied:

1. If you have an extra battery, swap it. FORGE will not log you out when you swap the battery.
2. If you do not have an extra battery, call your BC.
3. If you are far from another driver and no nearby driver can provide a spare battery, use a hand sheet (blue sheet) to record deliveries.
4. Turn in the hand sheet at the check-in office.

This situation is distinct from a frozen scanner, an app crash, or a scanner that is already completely unavailable.

### Pickup-window risk

The existing response to “I don’t know if I’ll make it to the pickup during the window” correctly said to check the current ready and close times and contact CXPC so the customer can be alerted. Vlad added:

- Also contact your BC to see if the pickup can be transferred to another Work Area.

This addition is in addition to, not a replacement for, the established CXPC contact.

## Content gaps that remain unapproved

The report identified questions for which no complete procedure was supplied or approved in this intake, including smoke from the vehicle, sickness or dizziness while driving, downed power lines, scanner freeze, app crash, children answering without an adult, a delivery disputed by the customer, leaving a package with a stranger, and duplicate packages or packages sharing a tracking number.

The report says the duplicate-package procedure is pending field confirmation. Ready Route must not infer that procedure from the duplicate-address record.

## Retrieval and phrasing regression phrases

The report supplied these phrases for engineering verification:

- “What does DNA mean in delivery status?”
- “What does OP-201 mean?”
- “Customer wants to make a complaint.”
- “What is a WA?”
- “What is a call tag?”
- “What does OSA mean?”
- “What does BC stand for?”
- “What is FORGE?”
- “What is a service cross?”
- “What is a manifest?”
- “What is CXPC?”
- “Dog bit me.”
- “I did missdelivery what is my next step.”
- “I locked my keys in the van, what do I do?”
- “Customer recording me on camera, what do I do?”
- “Two packages, same tracking number, what do I do?”

These phrases are testing evidence. They authorize a canonical answer only where a separate active record or owner approval establishes one.

## Confirmed existing behavior

The report noted good existing matches for ISR versus DSR, PPOD, the wrong-package Delete Scan mechanic, COD when asked using that term, and several safety clarifiers. These observations do not expand the records beyond their existing approved scope.

## Pending follow-up

Vlad was checking the two-duplicate-packages scenario with another manager. No result was included in this report, so it remains outside the approved corpus.
