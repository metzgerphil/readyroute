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
  created_at timestamptz not null default now(),
  constraint fedex_sync_runs_trigger_source_check check (trigger_source in ('manual', 'scheduled', 'progress_sync')),
  constraint fedex_sync_runs_status_check check (
    run_status in ('queued', 'running', 'completed', 'completed_with_changes', 'skipped', 'failed')
  ),
  constraint fedex_sync_runs_window_state_check check (
    sync_window_state is null or sync_window_state in ('before_window', 'active_window', 'after_window', 'historical', 'scheduled')
  ),
  constraint fedex_sync_runs_manifest_count_nonnegative check (manifest_count >= 0),
  constraint fedex_sync_runs_changed_route_count_nonnegative check (changed_route_count >= 0)
);

create index if not exists fedex_sync_runs_account_work_date_idx on public.fedex_sync_runs(account_id, work_date desc, created_at desc);
create index if not exists fedex_sync_runs_status_idx on public.fedex_sync_runs(run_status, created_at desc);

do $$
begin
  alter table public.fedex_sync_runs
    drop constraint if exists fedex_sync_runs_trigger_source_check;

  alter table public.fedex_sync_runs
    add constraint fedex_sync_runs_trigger_source_check
    check (trigger_source in ('manual', 'scheduled', 'progress_sync'));
end $$;
