# Source review: SRC-GDRIVE-FILE-0010

## Review result

- Status: `FULLY_REVIEWED`
- Method: page-marked text extraction plus visual review of all six pages
- Document label: FORGE 2.0.0; filename revision 6/10/25
- Scope: display, sound, navigation, stop-list, camera-scanning, and information settings
- Knowledge risk: `POTENTIALLY_OUTDATED` until compared with the comprehensive current-version guide

## Page map

- Page 1: Settings entry points.
- Page 2: night mode and text-to-speech; delivery-instruction and pickup-closing audio cannot be disabled.
- Page 3: navigation provider, automatic next-stop navigation, and map display of closed/pickup stops.
- Page 4: progress, closed-stop, tap behavior, and stop-card address preferences.
- Page 5: camera scanning disables the hardware barcode scanner and adds the camera/flash interface.
- Page 6: About and version-specific What's New details.

## Operational use

- Camera scanning is a documented alternative when enabled; a barcode-read problem should branch to the current guide's camera or key-entry workflows rather than immediately inventing a manual package disposition.
- These are preferences, not replacements for required package handling, scan timing, or status rules.

## Complete-PDF reconciliation

All six pages are accountable in `knowledge/drive_pdf_page_coverage.csv`. The pass added version-gated display/navigation preference knowledge and linked page 6 to the existing device-information record. The FORGE 2.0.0 UI paths remain `POTENTIALLY_OUTDATED` and cannot override current operational policy.
