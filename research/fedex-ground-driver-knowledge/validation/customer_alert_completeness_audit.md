# Customer Alert Completeness and Segmentation Audit

Status date: 2026-08-09

## Scope

This audit covers the complete 905-line durable capture of `SRC-MGB-PAGE-0023` (`Recent Customer Alerts`), updated 2026-08-06. It evaluates source-unit discovery, alert-level extraction, currency gating, source traceability, and linked-resource accountability. It does not claim that independently linked articles, downloads, or monthly news archives have been reviewed.

## Results

- 138 distinct alert segments were identified across 2023-2026.
- All 138 segments are `FULLY_REVIEWED` and `EXTRACTED_TO_CUSTOMER_ALERT_LAYER`.
- The segments produce 137 operational records because two 2026 Alo Yoga alerts establish one canonical procedure and retain both evidence fragments.
- All 138 source segments have a unique exact mapping to an operational record.
- Every mapping preserves source ID, alert ID, exact line range, segment SHA-256, alert date, temporal classification, knowledge status, and answer mode.
- Fifteen records are `VERIFIED`; 122 are `POTENTIALLY_OUTDATED` and publication-withheld.
- Fourteen records permit a current customer-specific answer; one current notice is reference-only; all historical, expired, incomplete, superseded, broken-link-dependent, or version-sensitive records withhold a current answer.

## Adversarial segmentation findings

The first segmenter recognized only headings with a four-digit year directly inside parentheses. A line-by-line adversarial review found two silently merged authoritative units:

1. `Kroger and banner stores (UPDATED 7/14/2025)` had been merged into the Sanofi segment.
2. `New customer: LeMans Corporation (4/26/24)` had been merged into the Ross/dd's segment.

The segmenter now recognizes these formats, assigns stable supplemental IDs (`MGB-ALERT-0048A` and `MGB-ALERT-0107A`), validates that both are discovered, and preserves every preexisting alert ID. The corrected neighboring line ranges and hashes are regenerated automatically.

## Currency and publication controls

- Explicit calendars, campaigns, forecast windows, and event dates that have elapsed are never presented as current procedures.
- Historical instructions that appear open-ended remain `POTENTIALLY_OUTDATED` until a current authoritative source validates them.
- Newer alerts are linked as superseding or corroborating evidence where the reviewed text warrants that relationship.
- System-version-dependent instructions, particularly FORGE release or column behavior, require current-system confirmation.
- Historical release exceptions, signature rules, phone numbers, customer/store lists, and Scan All exemptions are withheld unless current authority is established.
- Safety-sensitive language is not interpreted to authorize bypassing barricades, unsafe access, signature service, release controls, or damage procedures.

## Linked-resource accountability

Seven accessible alert-linked resources are individually inventoried and remain `NOT_YET_REVIEWED`:

- Locker/package-room delivery article.
- Pure Country NSR/FORGE article.
- Orvis pickup and delivery article.
- 2025 ACT handling article.
- 2026 ACT handling article.
- PetSmart Ship-from-Store master list.
- 2023 Dick's Sporting Goods Scan All Exemption article.

Two later Dick's Sporting Goods links are inventoried as `INACCESSIBLE` because their captured URLs resolve to explicit Sitecore not-found endpoints. No exemption or pickup-window procedure is inferred from those missing pages.

The page also exposes 100 exact monthly news-archive links extending before the alert list shown in the main content. They are reconciled in `inventory/mygroundbiz_news_archive_backlog.csv` and included individually in the authenticated acquisition queue. Those archive pages remain a separate source-discovery and acquisition obligation; full review of `SRC-MGB-PAGE-0023` does not establish that the archive pages or their child articles have been reviewed.

## Validation gates

`scripts/validate_corpus_integrity.py` rejects:

- stale alert coverage, operational records, or source mappings;
- duplicate or missing alert assignments;
- missing exact evidence, hashes, locators, dates, or clarification requirements;
- unsupported answer modes or knowledge statuses;
- a `POTENTIALLY_OUTDATED` record that does not withhold a current answer;
- reviewed/extracted state without an operational record;
- a source-mapping alert set that differs from the reviewed alert set;
- source inventory, navigation status, capture status, or acquisition-queue drift.

## Remaining work

The parent alert page is fully reviewed. Completion of the larger corpus still requires acquisition and review of the seven accessible linked resources, replacement or authoritative resolution of the two broken Dick's links, systematic inventory/review of relevant monthly news archives and their child articles, and the broader authenticated MyGroundBiz acquisition queue.
