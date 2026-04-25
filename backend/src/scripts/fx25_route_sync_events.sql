create table if not exists public.route_sync_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  work_date date not null,
  event_type text not null,
  event_status text not null default 'info',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.route_sync_events
  drop constraint if exists route_sync_events_type_check;

alter table public.route_sync_events
  add constraint route_sync_events_type_check
  check (event_type in ('manifest_staged', 'manifest_updated', 'route_assignment_updated', 'routes_dispatched', 'post_dispatch_change', 'fcc_progress_synced'));

alter table public.route_sync_events
  drop constraint if exists route_sync_events_status_check;

alter table public.route_sync_events
  add constraint route_sync_events_status_check
  check (event_status in ('info', 'warning', 'urgent'));

create index if not exists route_sync_events_route_created_idx
  on public.route_sync_events(route_id, created_at desc);

create index if not exists route_sync_events_account_work_date_idx
  on public.route_sync_events(account_id, work_date desc, created_at desc);

do $$
begin
  alter table public.route_sync_events
    drop constraint if exists route_sync_events_type_check;

  alter table public.route_sync_events
    add constraint route_sync_events_type_check
    check (event_type in ('manifest_staged', 'manifest_updated', 'route_assignment_updated', 'routes_dispatched', 'post_dispatch_change', 'fcc_progress_synced'));
end $$;
