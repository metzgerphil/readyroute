# Ready Route Answers v1 selective-recovery plan

Date: 2026-08-15

## Purpose

This plan catalogs the preserved v1 knowledge corpus for selective review. It does not authorize or activate any archived answer. The active RRA corpus remains the controlled 14-record v2 baseline.

## Inventory boundary

| Group | Records | Treatment |
| --- | ---: | --- |
| Preserved v1 archive | 150 | Historical recovery source only |
| Already represented in active v2 | 7 | Do not import again |
| Remaining archived candidates | 143 | Review selectively |
| Historically `READY_ROUTE_APPROVED` | 10 | Recheck scope and current evidence before reuse |
| Historically `SOURCE_VERIFIED` | 87 | Re-review source bytes and rewrite for the v2 answer format |
| Historically `PENDING_REVIEW` | 26 | Hold until the unresolved issue is decided |
| Historically `POTENTIALLY_OUTDATED` | 20 | Hold until current applicability is established |

The 14 active v2 records consist of seven selectively recovered v1 topics and seven newly approved v2 topics. The full record-by-record ledger is `v1_selective_recovery_inventory.csv` in this directory.

## Topic map of the 143 remaining candidates

| Topic family | Records | Initial handling |
| --- | ---: | --- |
| Delivery | 33 | Recover in tightly related decision families |
| FORGE | 31 | Defer version-sensitive items; recover stable workflows selectively |
| Pickup | 28 | Good source for later high-frequency batches |
| DOT / hours / vehicle / safety | 25 | Higher consequence; require narrower review |
| Security | 7 | Review separately from ordinary delivery help |
| Qualification | 6 | Manager/training audience; not an early driver-answer priority |
| Incident response | 4 | Higher consequence; require exact escalation language |
| Linehaul | 3 | Different operating context; do not mix into P&D batches |
| SenseAware | 2 | Specialized workflow; later batch |
| Appearance, ethics, public communication | 4 | Lower initial driver-answer priority |

## Proposed first recovery batch: signature-restricted delivery

This family is proposed first because drivers ask these questions frequently, the records share the same decision variables, and the current test already exposed a major alcohol-answer gap.

| Candidate | Driver decision covered | Archive status | Current action |
| --- | --- | --- | --- |
| `KNO-DEL-SIG-ISR-001` | What is allowed for ISR and what to do when no approved release path exists | Ready Route approved | Re-author from reviewed current evidence |
| `KNO-DEL-SIG-DSR-001` | Who may sign for DSR and what to do when nobody can sign | Ready Route approved | Re-author from reviewed current evidence |
| `KNO-DEL-SIG-ASR-001` | Age, ID, signature, ID-refusal, and ID-scan branches for ASR | Ready Route approved | Re-author from reviewed current evidence |
| `KNO-DEL-ALCOHOL-001` | Alcohol delivery requirements and unsuccessful-delivery branches | Ready Route approved | Re-author from reviewed current evidence |
| `KNO-DEL-DOORTAG-001` | Completing, scanning, and placing a door tag | Source verified | Re-review OP-117 pages cited by v1 |
| `KNO-DEL-SRA-001` | Handling a Shipment Release Authorization for ISR | Source verified | Re-review OP-117 pages 23-25 |
| `KNO-DEL-PPOD-001` | Required delivery and attempt photographs | Source verified | Narrow to claims supported by reintroduced sources |
| `KNO-DEL-ATTEMPT-LIMIT-001` | What happens after three unsuccessful attempts | Source verified | Narrow to claims supported by reintroduced sources |

These are candidates, not copies. Archived answer text, aliases, and clarification rules must not be transferred automatically.

## Required review before activation

1. Recheck every operational claim against the preserved OP-117, MGB-119, and FORGE source pages currently in v2.
2. Remove any claim that depends only on a source not yet reintroduced, unless the product owner explicitly confirms that claim.
3. Split each record into the smallest driver decisions needed for a direct answer.
4. Use the v2 compact format: one direct answer, no more than four short steps, one exception only when needed, and optional More Info.
5. Use `Code N` terminology and associate the code with the situation whenever the controlling facts are known.
6. Ask a clarification only when the missing fact changes the action. Never ask again for a fact already stated by the driver.

## Test pack required for this batch

Before any record is active, add tests for:

- a clear direct question for every decision branch;
- common shorthand such as ISR, DSR, ASR, sig, wine, and alcohol;
- common misspellings and speech-to-text wording;
- incomplete questions that genuinely require one clarification;
- multi-turn answers entered in the same textbox;
- negative tests that must not select a signature record;
- confusing neighbors, especially alcohol versus leaking/damaged hazmat;
- compact formatting, correct `Code N` wording, and no unsupported steps.

The batch can move to activation only after the full stability gate passes three consecutive times, the grounded-AI evaluation has no unsafe out-of-corpus selection, and the product owner approves the displayed answers.

## Suggested later batches

1. Call-tag pickup outcomes.
2. Ordinary pickup execution and missed-window situations.
3. Safe placement, apartments, lockers, and proof photographs.
4. HAL and transfer workflows.
5. Hazmat, incident, DOT/HOS, and security families after higher-consequence review.

Code 20 remains outside every batch until the product owner supplies or confirms the intended Code 20 information.
