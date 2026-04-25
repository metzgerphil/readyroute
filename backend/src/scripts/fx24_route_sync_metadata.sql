alter table public.routes
  add column if not exists sync_state text not null default 'sync_pending',
  add column if not exists last_manifest_sync_at timestamptz,
  add column if not exists last_manifest_change_at timestamptz,
  add column if not exists manifest_stop_count integer not null default 0,
  add column if not exists manifest_package_count integer not null default 0,
  add column if not exists manifest_fingerprint text,
  add column if not exists last_manifest_sync_error text;

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
