alter table public.vehicle_inspections
  add column if not exists route_id uuid references public.routes(id) on delete set null,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists issue_reported boolean not null default false,
  add column if not exists submitted_by_type text not null default 'driver',
  add column if not exists submitted_by_driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists submitted_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists submitted_by_name text,
  add column if not exists manager_review_note text,
  add column if not exists reviewed_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.vehicle_inspections
set issue_reported = true
where issue_note is not null
  and btrim(issue_note) <> '';

alter table public.vehicle_inspections
  drop constraint if exists vehicle_inspections_type_check,
  add constraint vehicle_inspections_type_check
    check (inspection_type in ('daily_check', 'weekly_inspection', 'full_inspection', 'driver', 'manager'));

alter table public.vehicle_inspections
  drop constraint if exists vehicle_inspections_status_check,
  add constraint vehicle_inspections_status_check
    check (status in ('submitted', 'needs_review', 'reviewed'));

alter table public.vehicle_inspections
  drop constraint if exists vehicle_inspections_submitter_check,
  add constraint vehicle_inspections_submitter_check
    check (submitted_by_type in ('driver', 'manager'));

create index if not exists vehicle_inspections_route_id_idx
  on public.vehicle_inspections(route_id);

create index if not exists vehicle_inspections_driver_route_date_idx
  on public.vehicle_inspections(account_id, submitted_by_driver_id, route_id, inspection_date);

create index if not exists vehicle_inspections_account_status_idx
  on public.vehicle_inspections(account_id, status, submitted_at desc);

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
