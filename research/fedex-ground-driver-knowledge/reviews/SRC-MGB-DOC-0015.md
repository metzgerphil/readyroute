# SRC-MGB-DOC-0015 — Common Reason Codes for Unsuccessful Pickup Attempts

- Review date: 2026-08-09
- Coverage: upper visible regions of both pages; cropped lower regions remain unreviewed
- Status: partially reviewed
- Version ambiguity: portal path is filed under `2023`, while the authenticated PDF viewer title is `0827COL Pickup Status Codes 2017.indd`

## Reviewed source truth

The source says accurate pickup-attempt information depends on using the most applicable FORGE reason code. Its legend marks orange reasons as stop charges paid and purple reasons as stop charges not paid.

The reviewed page-1 region visibly defines:

- Code 1, `Missed Pickup - DNA` (not paid): no pickup attempt was made; CPC contacts the service provider for a recovery attempt; the source says call-in pickup types automatically recycle to the next business day.
- Code 10, `Pickup Not Ready - Dispatch Again` (paid): the pickup contact says packages are not ready or cannot locate them; CPC follows up about readiness/location and coordinates same-day or next-day reattempt timing with the service provider; the source says call-in pickup types automatically recycle to the next business day.
- Code 16, `Holiday/Contingency/Local Event` (not paid): a pickup is known in advance to be closed for one of those reasons, so no attempt is made; the source says call-in pickup types automatically recycle to the next business day.
- Code 20, `Attempted-Cust Confirms No Pkg` (paid): the pickup was attempted in the window and the contact confirmed no packages at a Daily Scheduled pickup; the source also names Future Day On-Call and Package Returns Program locations where the contact says pickup is no longer needed.

The reviewed page-2 region visibly defines:

- Code 25, `Wrong Address - Pickup Not Made` (not paid): the pickup address is incorrect; CPC researches the correct address and attempts to coordinate same-day recovery.
- Code 26, `Pickup Not Scanned` (not paid): scanning technology prevents the scan at an attempted pickup; station personnel need pickup time, package count, or other reason information to manually update the pickup; the source says call-in pickup types automatically recycle to the next business day.

The visible conversion-table region lists codes 1, 10, 11, 14, 15, 16, 20, and 21 with their reason labels and FORGE abbreviations. Lower table rows and cropped text are not reviewed.

## Authority and version gate

This source does not override the later OP-117 v2 (2025-12-15) reason list or supply the current OP-321 card. Newly discovered codes 1, 14, 16, and 25 are retained as `POTENTIALLY_OUTDATED` reference records because the viewer title identifies 2017 while the portal path suggests 2023, and the complete source is not visible. Codes already established by current OP-117 retain OP-117 as their controlling reference source.

The document cannot establish that its paid/not-paid designations, recycling behavior, CPC recovery steps, or code availability remain current. No production answer should select one of these historically sourced codes without a current controlling source when OP-117 does not independently establish it.

## Capture

Two 1280×720 page-addressed upper-region JPEGs and `manifest.sha256` are stored under `captures/mygroundbiz/SRC-MGB-DOC-0015/`. These renders prove the reviewed regions only; they are not original PDF bytes or complete-page captures.
