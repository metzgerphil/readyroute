# SRC-GDRIVE-ROOT-0001 — Chat Bot connector folder

- Review date: 2026-08-10
- Coverage: exact authenticated folder metadata, direct-child listing, complete raw-byte fetch, provider-size comparison, and SHA-256 reconciliation
- Status: folder container fully reviewed; all current direct children match registered archive bytes

The exact supplied folder ID `11gFp2-i80bhI0s0tLR66B8KMWS_3JBEb` resolves through the authenticated Google Drive connector to the folder title `Chat Bot`. Provider metadata reports creation time `2026-08-08T22:01:45.353Z` and modified time `2026-08-10T21:45:41.014Z`.

The connector returned 35 direct file children and no folder child in the returned set. Every file was fetched as complete raw bytes. Decoded byte length matched provider size for all 35 files. Independent SHA-256 calculation produced 31 unique byte identities, all of which already exist in `inventory/source_checksums.sha256`. Four later `.ashx.pdf` uploads duplicate earlier supplied copies exactly.

The complete provider snapshot is preserved in `inventory/google_drive_connector_snapshot_2026-08-10.csv`. The folder is a container rather than substantive operational evidence, so it intentionally has no source-to-knowledge mapping. The snapshot establishes observed identity, metadata, child coverage, and byte equivalence; it does not infer unobserved revision history or source currency from upload time.
