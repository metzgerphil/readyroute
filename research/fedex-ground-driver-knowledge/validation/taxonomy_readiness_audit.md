# Taxonomy readiness audit

Status date: 2026-08-09

## Purpose

Record-level validation can conceal a weak operational branch when a broad parent contains many verified siblings. This audit projects knowledge status, evidence durability, missing-source obligations, and authenticated acquisition dependencies onto every evidence-discovered taxonomy node.

Parent-node counts include every record whose full taxonomy path contains that parent; child-node counts isolate the narrower branch. A parent being partly verified never authorizes a non-verified child procedure.

## Exact coverage

`knowledge/taxonomy_readiness_coverage.csv` contains one deterministic row for all 57 taxonomy nodes:

| Readiness class | Nodes | Meaning |
|---|---:|---|
| `ALL_RECORDS_VERIFIED_DURABLE` | 18 | Every mapped record is verified and every evidence set is durably archived |
| `ALL_RECORDS_VERIFIED_CAPTURE_OPEN` | 2 | The branch is verified, but durable original-source capture remains open |
| `MIXED_VERIFIED_AND_NONVERIFIED` | 26 | The branch contains verified and conflict, human-review, or potentially-outdated records |
| `NO_VERIFIED_RECORDS` | 10 | Records exist, but none currently has verified status |
| `SOURCE_GAP_NO_OPERATIONAL_RECORD` | 1 | The source corpus names the branch, but the actual procedure has not been acquired |

Each row includes mapped record IDs; separate counts for verified, conflict, human-review, and potentially-outdated records; durable/capture-open counts; exact referenced-source gaps; authenticated queue resources; a readiness basis; and required follow-up.

## Branches with no verified record

The following narrower branches must not inherit a verified sibling or parent procedure:

- Collect on Delivery
- Pharmacy delivery
- Critical-healthcare delivery
- International pickup documentation
- Bulk workflows
- FORGE vehicle change
- Vehicle inspection
- Rental-vehicle preparation
- Coupling
- FedEx Authenticated Delivery

Some have durable evidence but remain authority-, completeness-, or version-gated. Others additionally rely on transient portal evidence. `NO_VERIFIED_RECORDS` does not mean the corpus knows nothing; it means the current records must preserve their human-review or potentially-outdated answer limitations.

## Capture-open branches

Two verified-only branches currently have a capture gap because the complete dog-safety source is retained as hashed rendered pages rather than original PDF bytes. Capture-open evidence also remains within mixed or non-verified branches—principally Incident, Security, Vehicle Safety, Linehaul, Inspection, and Coupling—so the record-level status and evidence-capture gates must both be evaluated.

## Empty sourced branch

`TAX-RELAY` remains `SOURCE_GAP_NO_OPERATIONAL_RECORD`. OP-117 names separate Check-Out/Check-In for Relay Operations instructions, but that procedure is absent. The node is linked to `REFSRC-008`; no rule, variant, concise answer, or driver procedure is inferred.

## Retrieval implication

Future retrieval must evaluate the selected record's status and capture/publication gates after taxonomy expansion. It must not answer a COD, pharmacy, critical-healthcare, bulk, international, coupling, inspection, rental, or Authenticated Delivery question from a verified general delivery, pickup, FORGE, DOT, or vehicle-safety parent alone.

## Automated control

`scripts/build_taxonomy_readiness_coverage.py` regenerates the ledger from taxonomy paths, knowledge statuses, record-level evidence-capture coverage, non-verified resolution dependencies, and taxonomy-targeted referenced-source gaps. The corpus validator requires exact 57-node coverage, exact deterministic content, valid classes, nonblank bases/follow-up, a sourced gap for every empty branch, and zero verified records in every `NO_VERIFIED_RECORDS` row.

## Limitation

This is readiness accountability for the current extracted layer, not proof of full taxonomy completeness. New source acquisition may add branches, add records to Relay, change statuses, or resolve capture gaps; any such change must regenerate and revalidate the ledger.
