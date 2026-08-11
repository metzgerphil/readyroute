# Referenced-source acquisition coverage audit

Status date: 2026-08-09

Purpose: prove whether each missing-source obligation has an exact current link to the authenticated MyGroundBiz acquisition queue. A queue link is a research route, not evidence that the queued page contains the missing source.

## Result

`inventory/referenced_source_acquisition_coverage.csv` contains one deterministic row for each of the 42 open referenced-source obligations:

- 4 have both a direct gap-linked queue target and contextual record-resolution targets.
- 2 have a direct gap-linked queue target only.
- 6 have contextual record-resolution targets only.
- 30 have no current queue link.

Rows without a current queue link remain explicit acquisition obligations. This does not establish that they are unavailable in MyGroundBiz. It proves only that the present 264-resource queue does not yet contain an evidence-backed link to them.

## Priority-zero gaps without a current queue link

- `REFSRC-002` — OP-324 Service Measurement Status Codes Reference Card.
- `REFSRC-003` — OP-321 Pickup Reason Codes Card.
- `REFSRC-004` — OP-207.
- `REFSRC-005` — OP-207Res.
- `REFSRC-006` — HZ-035.
- `REFSRC-007` — SF-920P.
- `REFSRC-008` — Check-Out/Check-In for Relay Operations instructions.
- `REFSRC-015` — current hazardous-material pickup acceptance table.
- `REFSRC-021` — manufacturer-specific fifth-wheel and pintle-hook manuals/videos.
- `REFSRC-026` — current international-pickup document requirements.
- `REFSRC-027` — current Collect on Delivery policy and custody/payment rules.
- `REFSRC-030` — current status-specific operational procedures and approval criteria for definition-only delivery codes.
- `REFSRC-031` — current Emergency Response Guide.
- `REFSRC-033` — SF-035.
- `REFSRC-036` — current tobacco/e-cigarette prohibition and authorized commercial-exception criteria.
- `REFSRC-037` — current non-hazmat pickup packaging acceptance, refusal, escalation, and documentation procedure.
- `REFSRC-038` — current pharmacy-counter signer eligibility, release timing, custody, and unsuccessful-delivery procedure.
- `REFSRC-039` — current critical-healthcare designation, timing, tracker, notification, release, custody, and exception procedure.

These sources require targeted authorized discovery in addition to normal queue execution. Search results, page titles, and nearby documents remain discovery signals only until the exact source is acquired and fully reviewed.

## Link semantics

- `DIRECT_GAP_AND_CONTEXTUAL_RESOLUTION_LINKS`: at least one queue row explicitly lists the gap in `related_gap_ids`, and non-verified resolution rows also identify contextual queue resources.
- `DIRECT_GAP_LINK_ONLY`: at least one queue row explicitly lists the gap, with no contextual resolution target.
- `CONTEXTUAL_RESOLUTION_LINK_ONLY`: a non-verified record tied to the gap identifies a queue resource, but the resource is not asserted to contain the missing source.
- `NO_CURRENT_AUTHENTICATED_QUEUE_LINK`: neither exact linkage exists.

The ledger also derives affected knowledge and taxonomy IDs from exact backlog targets and non-verified resolution dependencies. It never derives operational relevance or source contents from a title or URL.

## Regression controls

The corpus validator requires:

- exactly one row for every current referenced-source backlog ID;
- deterministic equality with `scripts/build_referenced_source_acquisition_coverage.py`;
- all direct and contextual resource IDs to exist in the current authenticated queue;
- all affected knowledge and taxonomy IDs to resolve;
- the all-linked set to equal the union of direct and contextual links;
- a valid link class plus nonblank coverage basis and required follow-up.

This audit improves acquisition accountability. It does not resolve any source gap, change any knowledge status, or prove portal completeness.
