-- Safe catch-up migration for the FCC manifest + progress sync worker.
-- This intentionally repeats earlier granular fx23-fx28 changes so a live
-- database can be brought current with one SQL paste/run.

alter table public.accounts
  add column if not exists operations_timezone text not null default 'America/Los_Angeles';

alter table public.accounts
  add column if not exists dispatch_window_start_hour integer not null default 6;

alter table public.accounts
  add column if not exists dispatch_window_end_hour integer not null default 11;

alter table public.accounts
  add column if not exists manifest_sync_interval_minutes integer not null default 15;

alter table public.accounts
  drop constraint if exists accounts_dispatch_window_start_hour_check;

alter table public.accounts
  add constraint accounts_dispatch_window_start_hour_check
  check (dispatch_window_start_hour >= 0 and dispatch_window_start_hour <= 23);

alter table public.accounts
  drop constraint if exists accounts_dispatch_window_end_hour_check;

alter table public.accounts
  add constraint accounts_dispatch_window_end_hour_check
  check (dispatch_window_end_hour >= 1 and dispatch_window_end_hour <= 23);

alter table public.accounts
  drop constraint if exists accounts_dispatch_window_order_check;

alter table public.accounts
  add constraint accounts_dispatch_window_order_check
  check (dispatch_window_end_hour > dispatch_window_start_hour);

alter table public.accounts
  drop constraint if exists accounts_manifest_sync_interval_check;

alter table public.accounts
  add constraint accounts_manifest_sync_interval_check
  check (manifest_sync_interval_minutes in (5, 10, 15, 20, 30, 60));

create table if not exists public.fedex_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nickname text not null,
  account_number text not null,
  billing_contact_name text,
  billing_company_name text,
  billing_address_line1 text not null,
  billing_address_line2 text,
  billing_city text not null,
  billing_state_or_province text not null,
  billing_postal_code text not null,
  billing_country_code text not null default 'US',
  connection_status text not null default 'not_started',
  connection_reference text,
  last_verified_at timestamptz,
  is_default boolean not null default false,
  created_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  constraint fedex_accounts_connection_status_check check (
    connection_status in ('not_started', 'pending_mfa', 'connected', 'failed', 'disconnected')
  ),
  constraint fedex_accounts_account_number_length check (char_length(trim(account_number)) >= 5)
);

alter table public.fedex_accounts add column if not exists fcc_username text;
alter table public.fedex_accounts add column if not exists fcc_password_encrypted text;
alter table public.fedex_accounts add column if not exists fcc_password_updated_at timestamptz;

create index if not exists fedex_accounts_account_id_idx on public.fedex_accounts(account_id);
create index if not exists fedex_accounts_status_idx on public.fedex_accounts(account_id, connection_status);
create unique index if not exists fedex_accounts_default_uidx on public.fedex_accounts(account_id)
where is_default = true and disconnected_at is null;
create unique index if not exists fedex_accounts_account_number_uidx on public.fedex_accounts(account_id, account_number)
where disconnected_at is null;

alter table public.routes
  add column if not exists dispatch_state text not null default 'staged',
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatched_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists sync_state text not null default 'sync_pending',
  add column if not exists last_manifest_sync_at timestamptz,
  add column if not exists last_manifest_change_at timestamptz,
  add column if not exists manifest_stop_count integer not null default 0,
  add column if not exists manifest_package_count integer not null default 0,
  add column if not exists manifest_fingerprint text,
  add column if not exists last_manifest_sync_error text;

alter table public.routes
  drop constraint if exists routes_dispatch_state_check;

alter table public.routes
  add constraint routes_dispatch_state_check
  check (dispatch_state in ('staged', 'dispatched'));

alter table public.routes
  drop constraint if exists routes_sync_state_check;

alter table public.routes
  add constraint routes_sync_state_check
  check (sync_state in ('sync_pending', 'syncing', 'staged_changed', 'staged_stable', 'dispatch_blocked', 'changed_after_dispatch', 'needs_attention', 'sync_failed'));

alter table public.routes
  drop constraint if exists routes_manifest_stop_count_nonnegative;

alter table public.routes
  add constraint routes_manifest_stop_count_nonnegative
  check (manifest_stop_count >= 0);

alter table public.routes
  drop constraint if exists routes_manifest_package_count_nonnegative;

alter table public.routes
  add constraint routes_manifest_package_count_nonnegative
  check (manifest_package_count >= 0);

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

create table if not exists public.fedex_sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  fedex_account_id uuid references public.fedex_accounts(id) on delete set null,
  work_date date not null,
  trigger_source text not null default 'manual',
  run_status text not null default 'queued',
  sync_window_state text,
  initiated_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  manifest_count integer not null default 0,
  changed_route_count integer not null default 0,
  error_summary text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.fedex_sync_runs
  drop constraint if exists fedex_sync_runs_trigger_source_check;

alter table public.fedex_sync_runs
  add constraint fedex_sync_runs_trigger_source_check
  check (trigger_source in ('manual', 'scheduled', 'progress_sync'));

alter table public.fedex_sync_runs
  drop constraint if exists fedex_sync_runs_status_check;

alter table public.fedex_sync_runs
  add constraint fedex_sync_runs_status_check
  check (run_status in ('queued', 'running', 'completed', 'completed_with_changes', 'skipped', 'failed'));

alter table public.fedex_sync_runs
  drop constraint if exists fedex_sync_runs_window_state_check;

alter table public.fedex_sync_runs
  add constraint fedex_sync_runs_window_state_check
  check (sync_window_state is null or sync_window_state in ('before_window', 'active_window', 'after_window', 'historical', 'scheduled'));

alter table public.fedex_sync_runs
  drop constraint if exists fedex_sync_runs_manifest_count_nonnegative;

alter table public.fedex_sync_runs
  add constraint fedex_sync_runs_manifest_count_nonnegative
  check (manifest_count >= 0);

alter table public.fedex_sync_runs
  drop constraint if exists fedex_sync_runs_changed_route_count_nonnegative;

alter table public.fedex_sync_runs
  add constraint fedex_sync_runs_changed_route_count_nonnegative
  check (changed_route_count >= 0);

create index if not exists fedex_sync_runs_account_work_date_idx
  on public.fedex_sync_runs(account_id, work_date desc, created_at desc);

create index if not exists fedex_sync_runs_status_idx
  on public.fedex_sync_runs(run_status, created_at desc);

alter table public.fedex_accounts enable row level security;
alter table public.route_sync_events enable row level security;
alter table public.fedex_sync_runs enable row level security;

drop policy if exists fedex_accounts_by_account on public.fedex_accounts;
create policy fedex_accounts_by_account
on public.fedex_accounts
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists route_sync_events_by_account on public.route_sync_events;
create policy route_sync_events_by_account
on public.route_sync_events
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists fedex_sync_runs_by_account on public.fedex_sync_runs;
create policy fedex_sync_runs_by_account
on public.fedex_sync_runs
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
