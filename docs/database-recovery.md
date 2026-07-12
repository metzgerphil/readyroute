# ReadyRoute Database Recovery

ReadyRoute creates an automated production recovery package every night. Each package contains:

- an authoritative `public` schema dump;
- all `public` table data;
- every object from the private `driver-documents`, `pod-photos`, and `vehicle-inspection-photos` buckets;
- a Storage manifest with file sizes and SHA-256 checksums.

The GitHub workflow restores the database dump into a disposable local Supabase project and verifies core tables before it accepts the backup. It also verifies every downloaded Storage object against its checksum.

## Retention

The durable copy is stored in the private Google Cloud Storage bucket configured by `GCP_BACKUP_BUCKET`. GitHub keeps a second copy for 14 days so a recent backup is easy to retrieve from the Actions run.

## Restore Procedure

1. Download the desired archive and its `.sha256` file from the private backup bucket.
2. Run `sha256sum --check <archive>.sha256` before extracting it.
3. Create a disposable Supabase project first. Never test a restore against production.
4. Apply `backup/database/schema.sql` with `psql --set ON_ERROR_STOP=1`.
5. Apply `backup/database/data.sql` with the same setting.
6. Recreate the three private buckets, keeping `public = false`.
7. Upload each object to the bucket and path recorded in `backup/storage/manifest.json`.
8. Verify object sizes and checksums with `node scripts/verify-supabase-storage-backup.mjs backup/storage`.
9. Point a non-production API revision at the restored project and run the production smoke suite.
10. Record the restore date, backup ID, row counts, object count, and smoke result.

Production recovery should only begin after the disposable restore passes. Database credentials, service-role keys, and backup archives must never be committed to Git.
