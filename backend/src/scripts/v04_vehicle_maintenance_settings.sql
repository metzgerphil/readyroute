create table if not exists public.vehicle_maintenance_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  service_type text not null,
  is_enabled boolean not null default true,
  default_interval_miles integer,
  default_interval_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_maintenance_settings_account_type_uidx
  on public.vehicle_maintenance_settings(account_id, service_type);
