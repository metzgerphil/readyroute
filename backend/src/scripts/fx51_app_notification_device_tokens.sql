create table if not exists public.app_notification_device_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('driver', 'manager')),
  driver_id uuid references public.drivers(id) on delete cascade,
  manager_user_id uuid references public.manager_users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'unknown',
  device_id text,
  app_version text,
  device_name text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notification_device_tokens_recipient_check
    check (
      (recipient_type = 'driver' and driver_id is not null and manager_user_id is null)
      or
      (recipient_type = 'manager' and manager_user_id is not null and driver_id is null)
    )
);

create unique index if not exists app_notification_device_tokens_driver_unique_idx
  on public.app_notification_device_tokens (account_id, recipient_type, driver_id, expo_push_token)
  where recipient_type = 'driver';

create unique index if not exists app_notification_device_tokens_manager_unique_idx
  on public.app_notification_device_tokens (account_id, recipient_type, manager_user_id, expo_push_token)
  where recipient_type = 'manager';

create index if not exists app_notification_device_tokens_driver_active_idx
  on public.app_notification_device_tokens (account_id, driver_id, status)
  where recipient_type = 'driver';

create index if not exists app_notification_device_tokens_manager_active_idx
  on public.app_notification_device_tokens (account_id, manager_user_id, status)
  where recipient_type = 'manager';

alter table public.app_notification_device_tokens enable row level security;

drop policy if exists app_notification_device_tokens_by_account on public.app_notification_device_tokens;

create policy app_notification_device_tokens_by_account
on public.app_notification_device_tokens
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
