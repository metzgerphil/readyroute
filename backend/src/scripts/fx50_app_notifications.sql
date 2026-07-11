create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('driver', 'manager')),
  driver_id uuid references public.drivers(id) on delete cascade,
  manager_user_id uuid references public.manager_users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  severity text not null default 'info' check (severity in ('info', 'warning', 'urgent')),
  link_type text,
  link_ref jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_notifications_driver_recipient_check
    check (
      (recipient_type = 'driver' and driver_id is not null)
      or
      (recipient_type = 'manager')
    )
);

create index if not exists app_notifications_driver_inbox_idx
  on public.app_notifications (account_id, driver_id, status, created_at desc)
  where recipient_type = 'driver';

create index if not exists app_notifications_manager_inbox_idx
  on public.app_notifications (account_id, manager_user_id, status, created_at desc)
  where recipient_type = 'manager';

create index if not exists app_notifications_manager_broadcast_idx
  on public.app_notifications (account_id, status, created_at desc)
  where recipient_type = 'manager' and manager_user_id is null;

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_by_account on public.app_notifications;

create policy app_notifications_by_account
on public.app_notifications
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
