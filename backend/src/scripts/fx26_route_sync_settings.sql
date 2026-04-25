alter table public.accounts
  add column if not exists operations_timezone text not null default 'America/Los_Angeles';

alter table public.accounts
  add column if not exists dispatch_window_start_hour integer not null default 6;

alter table public.accounts
  add column if not exists dispatch_window_end_hour integer not null default 11;

alter table public.accounts
  add column if not exists manifest_sync_interval_minutes integer not null default 15;
