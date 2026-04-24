alter table public.vehicles
  add column if not exists truck_type text,
  add column if not exists custom_truck_type text,
  add column if not exists registration_expiration date;
