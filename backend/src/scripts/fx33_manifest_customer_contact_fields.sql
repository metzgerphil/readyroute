-- Adds optional stop-level customer contact fields for richer manifest imports.
-- All columns are nullable so existing routes, route history, driver app calls,
-- and manager portal calls continue to load when a manifest does not include
-- customer contact details.

alter table public.stops
  add column if not exists business_name text,
  add column if not exists company_name text,
  add column if not exists primary_phone text,
  add column if not exists alternate_phone text,
  add column if not exists email text,
  add column if not exists customer_instructions text,
  add column if not exists delivery_instructions text,
  add column if not exists consignee text,
  add column if not exists shipper text,
  add column if not exists contact_source text,
  add column if not exists contact_last_imported_at timestamptz,
  add column if not exists raw_contact_metadata jsonb;

-- Package rows are currently generated from stop-level package counts during
-- manifest ingest, so v1 keeps contact data on stops. Add package-level contact
-- columns later only when ReadyRoute preserves real manifest package records.
