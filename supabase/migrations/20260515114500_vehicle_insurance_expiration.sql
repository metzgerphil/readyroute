alter table public.vehicles
  add column if not exists insurance_expiration date;
