alter table public.vehicles
  add column if not exists last_service_date date,
  add column if not exists last_service_mileage integer,
  add column if not exists next_service_mileage integer,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true;

create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  service_date date not null,
  description text not null,
  cost numeric(10, 2),
  mileage_at_service integer,
  next_service_mileage integer,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_vehicle_id_idx
  on public.vehicle_maintenance(vehicle_id);

create index if not exists vehicle_maintenance_account_id_idx
  on public.vehicle_maintenance(account_id);

create index if not exists vehicle_maintenance_service_date_idx
  on public.vehicle_maintenance(service_date desc);

alter table public.vehicle_maintenance enable row level security;

drop policy if exists vehicle_maintenance_by_account on public.vehicle_maintenance;

create policy vehicle_maintenance_by_account
on public.vehicle_maintenance
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
