create table if not exists public.vehicle_odometer_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  old_odometer_reading integer,
  new_odometer_reading integer not null,
  odometer_reading integer not null,
  source text not null default 'driver',
  notes text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint vehicle_odometer_reading_nonnegative check (odometer_reading >= 0)
);

create index if not exists vehicle_odometer_entries_vehicle_id_idx
  on public.vehicle_odometer_entries(vehicle_id, created_at desc);

create index if not exists vehicle_odometer_entries_driver_id_idx
  on public.vehicle_odometer_entries(driver_id, created_at desc);

create index if not exists vehicle_odometer_entries_manager_user_id_idx
  on public.vehicle_odometer_entries(manager_user_id, created_at desc);

create index if not exists vehicle_odometer_entries_account_id_idx
  on public.vehicle_odometer_entries(account_id, created_at desc);

create index if not exists vehicle_odometer_entries_route_id_idx
  on public.vehicle_odometer_entries(route_id);

alter table public.vehicle_odometer_entries enable row level security;

drop policy if exists vehicle_odometer_entries_by_account on public.vehicle_odometer_entries;
create policy vehicle_odometer_entries_by_account
on public.vehicle_odometer_entries
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
