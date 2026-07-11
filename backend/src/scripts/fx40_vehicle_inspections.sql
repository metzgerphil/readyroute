create table if not exists public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  inspection_date date not null,
  inspection_type text not null default 'driver',
  odometer integer not null check (odometer >= 0),
  issue_reported boolean not null default false,
  status text not null default 'submitted',
  issue_note text,
  items jsonb not null default '[]'::jsonb,
  submitted_by_type text not null default 'driver',
  submitted_by_driver_id uuid references public.drivers(id) on delete set null,
  submitted_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  submitted_by_name text,
  submitted_at timestamptz not null default now(),
  manager_review_note text,
  reviewed_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_inspections_type_check check (inspection_type in ('daily_check', 'weekly_inspection', 'full_inspection', 'driver', 'manager')),
  constraint vehicle_inspections_status_check check (status in (
    'submitted',
    'needs_review',
    'safe_to_operate',
    'safe_with_maintenance_reported',
    'manager_review_required',
    'urgent_manager_review',
    'reviewed'
  )),
  constraint vehicle_inspections_submitter_check check (submitted_by_type in ('driver', 'manager'))
);

create index if not exists vehicle_inspections_account_submitted_idx
  on public.vehicle_inspections (account_id, submitted_at desc);

create index if not exists vehicle_inspections_vehicle_submitted_idx
  on public.vehicle_inspections (vehicle_id, submitted_at desc);

create index if not exists vehicle_inspections_route_id_idx
  on public.vehicle_inspections(route_id);

create index if not exists vehicle_inspections_driver_route_date_idx
  on public.vehicle_inspections(account_id, submitted_by_driver_id, route_id, inspection_date);

create index if not exists vehicle_inspections_account_status_idx
  on public.vehicle_inspections (account_id, status, submitted_at desc);

create or replace function public.set_vehicle_inspections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_inspections_updated_at on public.vehicle_inspections;
create trigger vehicle_inspections_updated_at
before update on public.vehicle_inspections
for each row
execute function public.set_vehicle_inspections_updated_at();

alter table public.vehicle_inspections enable row level security;

drop policy if exists "vehicle inspections service role full access" on public.vehicle_inspections;
create policy "vehicle inspections service role full access"
on public.vehicle_inspections
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
