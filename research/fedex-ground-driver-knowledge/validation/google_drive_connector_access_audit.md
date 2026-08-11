# Google Drive connector access audit

Status date: 2026-08-10

## Purpose

The supplied Drive folder was fully inventoried and downloaded through the authenticated browser, but the separate connected Google Drive account had not independently verified the folder identity or metadata. This audit rechecks that connector boundary without treating an empty connector result as evidence that the source folder is empty.

## Target

- Source: `SRC-GDRIVE-ROOT-0001`
- Supplied folder ID: `11gFp2-i80bhI0s0tLR66B8KMWS_3JBEb`
- Browser-visible folder title: `Chat Bot`

## Prior connector observations

Two read-only connector checks were performed:

1. Listing the exact supplied folder URL returned a successful connector response with an empty `files` array.
2. A folder-only search for the exact visible title `Chat Bot` returned an empty `results` array.

The authenticated browser had previously exposed 17 direct children and no visible subfolders, and the complete browser ZIP plus extracted children are archived with validator-checked hashes. Therefore, the connector's empty results are an access/account-visibility limitation, not evidence that the supplied folder contains zero files.

## Restored connector observations

Connector visibility changed on 2026-08-10. A new read-only check established:

1. File metadata resolves folder ID `11gFp2-i80bhI0s0tLR66B8KMWS_3JBEb` to the title `Chat Bot`, MIME type `application/vnd.google-apps.folder`, creation time `2026-08-08T22:01:45.353Z`, and modified time `2026-08-10T21:45:41.014Z`.
2. Listing the exact folder returns 35 direct file children and no folder child in the returned set.
3. The 35 children represent 31 unique byte objects; four later `.ashx.pdf` uploads are byte-identical to earlier supplied copies of MGB-119, OP-119, Focus on Package Placement, and the Package Placement quick reference.
4. Every child was fetched through the authenticated connector as complete raw bytes and hashed independently. Decoded byte lengths equal provider sizes for all 35 files.
5. Every one of the 31 unique SHA-256 values already exists in `inventory/source_checksums.sha256`. No Drive child introduces unregistered bytes, and no duplicate filename or same-size assumption was used.

The durable 35-row provider snapshot is `inventory/google_drive_connector_snapshot_2026-08-10.csv`. It preserves the exact file ID, title, MIME type, size, SHA-256, provider creation/modification times, and folder identity for every returned child.

## Current disposition

- `SRC-GDRIVE-ROOT-0001` is now `ACCESSIBLE` and its current 35-child connector snapshot is fully reconciled.
- `SRC-GDRIVE-BROWSER-ROOT-0001` remains the reviewed accessible folder snapshot.
- The original 17-file browser snapshot remains historically accurate for its capture time; the 18 later direct uploads are additional connector-visible children, not proof that the earlier browser inventory was incomplete at capture time.
- All 35 current children map to already archived checksum-protected bytes. No source copy or knowledge extraction was needed.
- Connector identity, current child metadata, and byte identity are now independently verified. File revision history beyond the observed provider metadata remains outside this snapshot and is not inferred.

## Required follow-up

Repeat the exact folder listing and raw-byte reconciliation when the folder modified time changes or new source uploads are expected. Investigate added, removed, renamed, or hash-changed children before updating source coverage or operational knowledge.
