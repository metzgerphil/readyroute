# Human-verified operational reconciliation — 31-item packet

Status date: 2026-08-10

## Provenance and governance

The project owner supplied a 31-item operational review described as verified by humans against current OP-117 v2 (12/15/2025), current FORGE behavior, and explicit gap checking. This packet is a human adjudication input, not a replacement source archive. Existing OP-117/FORGE evidence remains the audit trail. Any statement explicitly described as absent, partial, or needing CXPC/management remains gated.

Seven narrow determinations were entered as active Ready Route adjudications: vehicle change, Manifest Preview/work-area correction, OP-207/OP-207Res identity and HAL outage scope, hazmat pickup acceptance, hazmat loading/papers, everyday HOS limits, and short-haul/16-hour/adverse-condition exceptions. The already source-verified SRA procedure remains source verified. No gap was promoted merely because its absence was human confirmed.

## Item reconciliation

| # | Topic | Human result | Ready Route disposition |
|---:|---|---|---|
| 1 | Change vehicle during route | Change Vehicle in FORGE left-side menu | Narrow `READY_ROUTE_APPROVED`; multi-vehicle DVIR/manual closeout remains outside approval |
| 2 | Misloaded/missing in Manifest Preview | Package-handler scan, Modify scan-in, or owner-initiated Bulk Transfer | `READY_ROUTE_APPROVED` for pre-dispatch correction; on-road custody transfer remains separate |
| 3 | Suspected-fraud call tags | No definition/authorization in OP-117; call CXPC to check status | Preserve `PENDING_REVIEW`; no fraud determination or cancellation authority inferred |
| 4 | Damaged/poorly packaged pickup | Sturdy/taped requirements; refuse no-label/damaged/not-taped; correction/code/escalation incomplete | Preserve partial/gated record; exact missing branches remain open |
| 5 | International pickup documents | Document must be attached; driver does not validate correctness; no documents → CXPC | Preserve bounded partial answer and unresolved document-type/applicability branches |
| 6 | Multiple COD packages | Not verified | Preserve `PENDING_REVIEW`; CXPC/station required |
| 7 | Pharmacy counter | Not verified | Preserve `PENDING_REVIEW`; CXPC/station required |
| 8 | Critical healthcare/SenseAware | Pickup tag-state and delivery tag-removal steps verified; late/damaged/missing/refusal branches open | Existing verified tag-state records retained; critical-health gaps remain pending |
| 9 | Bulk delivery/pickup | Bulk Pickup and Spot user type visible; eligibility/count/discrepancy missing | Preserve `PENDING_REVIEW` |
| 10 | Edit address | Codes 003/002 and no-barcode return verified; independent redirect authority absent | Preserve bounded code evidence; no self-redirect approval |
| 11 | FORGE End of Day | Complete procedure not found | Preserve `PENDING_REVIEW` |
| 12 | Bulk transfer | Pickup reassignment roles verified; loaded-stop custody/code-079 procedure absent | Preserve pickup-specific verified record and separate transfer gap |
| 13 | Drop-box changes | UI flows found; approval authority not found | Existing source-backed flows retained; authorization question stays pending |
| 14 | Ordinary refusal | Status 006 verified; complete post-code disposition absent | Preserve `PENDING_REVIEW`; do not generalize special-service refusal workflows |
| 15 | Hand sheet/Blue Sheet | OP-207/OP-207Res for HAL outage; Blue Sheet informal | Narrow `READY_ROUTE_APPROVED`; full field/submission and non-HAL procedures remain open |
| 16 | Unmanifested package | Authorization/reassignment/address authority not verified | Preserve `PENDING_REVIEW` |
| 17 | Alternate Signature/SRA | ALT → Shipment Release Auth → scan SRA → recipient initial/name; return forms | Existing `SOURCE_VERIFIED` SRA record retained |
| 18 | Tobacco/vaping | No individual-consumer delivery; alert station manager; commercial preauthorization display open | Preserve pending status until the commercial branch is controlled |
| 19 | Hazmat pickup acceptance | Checklist and no-pickup boundary confirmed | `READY_ROUTE_APPROVED` with Hotline escalation and exception guard |
| 20 | Hazmat load/papers | Floor/block/brace/arrows/paper access/manifest/outage-transfer envelope confirmed | `READY_ROUTE_APPROVED`; relay source remains separate and open |
| 21 | FORGE login warning | Warning/blocking logic not in OP-117 | Preserve `PENDING_REVIEW` |
| 22 | HOS everyday limits | 11/14/70/34-hour restart/30-minute break confirmed | `READY_ROUTE_APPROVED`; exceptions remain condition-specific |
| 23 | Short-haul/16-hour/adverse | Conditions, frequencies, dispatch-knowledge test, outer limits confirmed | `READY_ROUTE_APPROVED` with fact and recordkeeping clarifications |
| 24 | Roadside inspection report | Deliver to FedEx at next station; deadlines/retention/repair follow-up open | Preserve partial/gated record |
| 25 | Rental vehicle without ELD | Not verified | Preserve `PENDING_REVIEW` |
| 26 | Tractor-trailer/dolly coupling | Not verified in OP-117 | Preserve `PENDING_REVIEW`; linehaul source required |
| 27 | Rental P&D preparation | Not verified | Preserve `PENDING_REVIEW` |
| 28 | Annual vehicle inspection | Not verified | Preserve `PENDING_REVIEW` |
| 29 | California 90-day inspection | Not verified | Preserve `PENDING_REVIEW`; California controlling source required |
| 30 | L10 qualification/activation | Not verified in OP-117 | Preserve `PENDING_REVIEW`; Driver Qualification Resources is the acquisition target |
| 31 | Scheduled pickup offer | Not verified | Preserve `PENDING_REVIEW` |

## Reopening and supersession rule

The adjudications use existing OP-117/FORGE source IDs and explicitly reopen if newer applicable documentation changes the workflow. New portal material does not silently replace an approval; it is preserved, compared, and routed through the governance process. Items outside the seven approved determinations retain their existing source status and escalation behavior.
