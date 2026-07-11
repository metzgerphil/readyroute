alter table public.vehicle_inspections
  add column if not exists submitted_by_type text not null default 'driver',
  add column if not exists submitted_by_driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists submitted_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists submitted_by_name text,
  add column if not exists manager_review_note text,
  add column if not exists reviewed_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.vehicle_inspections
  add column if not exists route_id uuid references public.routes(id) on delete set null;

create index if not exists vehicle_inspections_route_id_idx
  on public.vehicle_inspections(route_id);

create index if not exists vehicle_inspections_driver_route_date_idx
  on public.vehicle_inspections(account_id, submitted_by_driver_id, route_id, inspection_date);
