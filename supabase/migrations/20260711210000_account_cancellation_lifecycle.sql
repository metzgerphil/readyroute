alter table public.accounts
  add column if not exists account_status text not null default 'active',
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists service_ends_at timestamptz,
  add column if not exists retention_ends_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.accounts
  drop constraint if exists accounts_account_status_check;

alter table public.accounts
  add constraint accounts_account_status_check
  check (account_status in ('active', 'canceling', 'retained'));

create index if not exists accounts_account_status_retention_idx
  on public.accounts (account_status, retention_ends_at);

create table if not exists public.account_cancellation_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  event_type text not null,
  requested_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  requested_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  actor_email text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint account_cancellation_events_type_check
    check (event_type in ('requested', 'retained', 'recovered', 'purged'))
);

create index if not exists account_cancellation_events_account_created_idx
  on public.account_cancellation_events (account_id, created_at desc);

alter table public.account_cancellation_events enable row level security;
