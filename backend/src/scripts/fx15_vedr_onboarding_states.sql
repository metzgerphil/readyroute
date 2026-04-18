alter table public.vedr_settings
  add column if not exists connection_status text not null default 'not_started',
  add column if not exists provider_selected_at timestamptz,
  add column if not exists connection_started_at timestamptz,
  add column if not exists connection_verified_at timestamptz;

alter table public.vedr_settings
  drop constraint if exists vedr_settings_connection_status_check;

alter table public.vedr_settings
  add constraint vedr_settings_connection_status_check
  check (
    connection_status in ('not_started', 'provider_selected', 'waiting_for_login', 'connected')
  );

update public.vedr_settings
set
  provider_selected_at = coalesce(provider_selected_at, created_at),
  connection_started_at = coalesce(connection_started_at, provider_selected_at, created_at),
  connection_verified_at = coalesce(connection_verified_at, setup_completed_at),
  connection_status = case
    when provider is null then 'not_started'
    when setup_completed_at is not null then 'connected'
    else 'waiting_for_login'
  end
where true;
