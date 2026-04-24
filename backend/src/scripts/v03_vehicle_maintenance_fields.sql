alter table public.vehicle_maintenance
  add column if not exists service_type text,
  add column if not exists condition_notes text,
  add column if not exists next_service_date date;
