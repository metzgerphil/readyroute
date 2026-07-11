create table if not exists public.readyroute_staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  password_hash text,
  role text not null default 'support',
  is_active boolean not null default true,
  invited_by_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint readyroute_staff_users_role_check check (role in ('owner', 'admin', 'support', 'read_only'))
);

create unique index if not exists readyroute_staff_users_lower_email_uidx
  on public.readyroute_staff_users (lower(email));

create index if not exists readyroute_staff_users_role_idx
  on public.readyroute_staff_users (role, is_active);

create table if not exists public.account_internal_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  lifecycle_status text not null default 'lead',
  onboarding_stage text,
  internal_owner_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_internal_profiles_lifecycle_status_check
    check (lifecycle_status in ('lead', 'trial', 'onboarding', 'active', 'at_risk', 'canceled'))
);

create index if not exists account_internal_profiles_lifecycle_idx
  on public.account_internal_profiles (lifecycle_status, updated_at desc);

alter table public.support_tickets
  add column if not exists assigned_staff_user_id uuid references public.readyroute_staff_users(id) on delete set null;

create index if not exists support_tickets_assigned_staff_idx
  on public.support_tickets (assigned_staff_user_id, status, created_at desc);
