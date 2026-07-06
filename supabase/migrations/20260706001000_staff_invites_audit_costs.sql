create table if not exists public.readyroute_staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role text not null default 'support',
  status text not null default 'pending',
  token_hash text not null unique,
  invited_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  accepted_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  email_provider_id text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint readyroute_staff_invites_role_check check (role in ('owner', 'admin', 'support', 'read_only')),
  constraint readyroute_staff_invites_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create unique index if not exists readyroute_staff_invites_pending_email_uidx
  on public.readyroute_staff_invites (lower(email))
  where status = 'pending';

create index if not exists readyroute_staff_invites_status_idx
  on public.readyroute_staff_invites (status, created_at desc);

create table if not exists public.readyroute_staff_audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  staff_email text,
  action text not null,
  target_type text,
  target_id text,
  account_id uuid references public.accounts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists readyroute_staff_audit_log_created_idx
  on public.readyroute_staff_audit_log (created_at desc);

create index if not exists readyroute_staff_audit_log_account_idx
  on public.readyroute_staff_audit_log (account_id, created_at desc);

create index if not exists readyroute_staff_audit_log_staff_idx
  on public.readyroute_staff_audit_log (staff_user_id, created_at desc);

create table if not exists public.account_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_month date not null,
  estimated_revenue_cents integer not null default 0,
  cloud_run_cents integer not null default 0,
  database_cents integer not null default 0,
  storage_cents integer not null default 0,
  email_cents integer not null default 0,
  maps_cents integer not null default 0,
  support_cents integer not null default 0,
  other_cents integer not null default 0,
  total_cost_cents integer not null default 0,
  notes text,
  created_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_cost_snapshots_cents_nonnegative check (
    estimated_revenue_cents >= 0
    and cloud_run_cents >= 0
    and database_cents >= 0
    and storage_cents >= 0
    and email_cents >= 0
    and maps_cents >= 0
    and support_cents >= 0
    and other_cents >= 0
    and total_cost_cents >= 0
  )
);

create unique index if not exists account_cost_snapshots_account_period_uidx
  on public.account_cost_snapshots (account_id, period_month);

create index if not exists account_cost_snapshots_period_idx
  on public.account_cost_snapshots (period_month desc, account_id);

alter table public.readyroute_staff_invites enable row level security;
alter table public.readyroute_staff_audit_log enable row level security;
alter table public.account_cost_snapshots enable row level security;
