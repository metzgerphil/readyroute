create table if not exists public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  route_id uuid references public.routes(id) on delete set null,
  inspection_date date not null default current_date,
  inspection_type text not null default 'daily_check',
  odometer integer,
  issue_reported boolean not null default false,
  issue_note text,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  manager_review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_inspections_type_check
    check (inspection_type in ('daily_check', 'weekly_inspection', 'full_inspection')),
  constraint vehicle_inspections_status_check
    check (status in ('submitted', 'needs_review', 'reviewed')),
  constraint vehicle_inspections_odometer_check
    check (odometer is null or odometer >= 0)
);

create table if not exists public.vehicle_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.vehicle_inspections(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  checklist_item_key text not null,
  label text not null,
  value text,
  status text not null default 'note',
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint vehicle_inspection_items_status_check
    check (status in ('pass', 'fail', 'note', 'not_applicable'))
);

create index if not exists vehicle_inspections_account_date_idx
  on public.vehicle_inspections(account_id, inspection_date desc, submitted_at desc);

create index if not exists vehicle_inspections_account_status_idx
  on public.vehicle_inspections(account_id, status, submitted_at desc);

create index if not exists vehicle_inspections_vehicle_id_idx
  on public.vehicle_inspections(vehicle_id, submitted_at desc);

create index if not exists vehicle_inspections_driver_id_idx
  on public.vehicle_inspections(driver_id, submitted_at desc);

create index if not exists vehicle_inspection_items_inspection_id_idx
  on public.vehicle_inspection_items(inspection_id, sort_order);

alter table public.vehicle_inspections enable row level security;
alter table public.vehicle_inspection_items enable row level security;

drop policy if exists vehicle_inspections_by_account on public.vehicle_inspections;
create policy vehicle_inspections_by_account
on public.vehicle_inspections
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists vehicle_inspection_items_by_account on public.vehicle_inspection_items;
create policy vehicle_inspection_items_by_account
on public.vehicle_inspection_items
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
