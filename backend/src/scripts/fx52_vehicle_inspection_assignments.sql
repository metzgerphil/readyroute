create table if not exists public.vehicle_inspection_assignments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  assigned_driver_id uuid not null references public.drivers(id) on delete cascade,
  assigned_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  route_id uuid references public.routes(id) on delete set null,
  due_date date not null,
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  note text,
  require_before_route_start boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'overdue')),
  completed_inspection_id uuid references public.vehicle_inspections(id) on delete set null,
  completed_at timestamptz,
  cancelled_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_inspection_assignments_driver_due_idx
  on public.vehicle_inspection_assignments (account_id, assigned_driver_id, status, due_date);

create index if not exists vehicle_inspection_assignments_vehicle_due_idx
  on public.vehicle_inspection_assignments (account_id, vehicle_id, status, due_date);

create index if not exists vehicle_inspection_assignments_route_idx
  on public.vehicle_inspection_assignments (account_id, route_id)
  where route_id is not null;

create index if not exists vehicle_inspection_assignments_completed_inspection_idx
  on public.vehicle_inspection_assignments (completed_inspection_id)
  where completed_inspection_id is not null;

create or replace function public.set_vehicle_inspection_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_inspection_assignments_updated_at on public.vehicle_inspection_assignments;
create trigger vehicle_inspection_assignments_updated_at
before update on public.vehicle_inspection_assignments
for each row
execute function public.set_vehicle_inspection_assignments_updated_at();

alter table public.vehicle_inspection_assignments enable row level security;

drop policy if exists vehicle_inspection_assignments_by_account on public.vehicle_inspection_assignments;

create policy vehicle_inspection_assignments_by_account
on public.vehicle_inspection_assignments
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
