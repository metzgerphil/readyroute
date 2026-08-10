# SRC-MGB-DOC-0047 — FORGE 3.3.0 Combined Application Support Guide

- Review date: 2026-08-10
- Document version/date: 1.00, 7/23/2026; hub link labeled added 7/13/2026
- Coverage: all 198 pages from the original PDF
- Status: fully reviewed
- Original archive: `sources/mygroundbiz/documents/FORGE 330 Application Support Guide FXGMGB7726.pdf`
- SHA-256: `77721334d870385a48e39b2c72b738dfc6f02ac318fac71382a412838dd72f30`

## Review method and scope

All pages were textually extracted and reviewed. Every page was also rendered and checked in sequential contact sheets for missing, clipped, blank, or unreadable content. The source is a release-wise application-support compilation, not a complete substitute for every controlling operational policy. Its page 10 warning that older functionality may have changed is enforced by preferring the latest applicable section within the guide and newer controlling sources elsewhere in the corpus.

## Mainstream operational findings

- Pages 17-21 establish the current service-provider FAD workflow: per-package QR validation, D39 no-valid-QR branches, signature/PPOD behavior, validation-unavailable return, HAL restriction, and Counter-user restriction.
- Page 33 updates international pickup prompts with the ETD exception and mandatory per-package commercial-invoice response.
- Page 36 blocks pharmacy packages from HAL transfer.
- Pages 63-65 define setting, changing, and removing Express pickup exceptions.
- Pages 79-81 define optional EOD Delivery Reconciliation, eligibility, status changes, 30-package bulk reconcile, save/loss behavior, and completion.
- Page 107 confirms that a package with code 17 may receive another factually applicable status except code 16.
- Pages 102, 115, 122, 167-168, and 184 preserve distinct SenseAware pickup, association, delivery-removal, no-tag, and station-handoff branches.
- Pages 113, 181, and 198 distinguish hazmat/DG prompts and restrictions; these application behaviors do not replace the controlling HZ-035/OP-117 acceptance rules.

The guide also covers UI, navigation, demo-mode, country-specific, retail, transfer, bulk, signature, photo, drop-box, critical-package, time-commit, and intercept changes. Those sections are retained in the source review but do not automatically become standalone driver procedures unless mapped to a canonical record with an eligible status.

The 7/13 hub-label versus 7/23 document-date discrepancy remains documented rather than silently normalized.
