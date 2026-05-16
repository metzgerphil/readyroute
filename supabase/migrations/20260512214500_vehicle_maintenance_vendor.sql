alter table public.vehicle_maintenance
  add column if not exists vendor_name text;
