create table if not exists public.billing_overage_authorizations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  manager_email text,
  status text not null default 'accepted',
  terms_version text not null,
  terms_text text not null,
  committed_route_count integer not null,
  billing_rate_cents integer not null,
  currency text not null default 'usd',
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  request_ip text,
  request_user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint billing_overage_authorizations_status_check check (status in ('accepted', 'revoked')),
  constraint billing_overage_authorizations_committed_count_check check (committed_route_count >= 0),
  constraint billing_overage_authorizations_rate_check check (billing_rate_cents >= 0),
  constraint billing_overage_authorizations_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint billing_overage_authorizations_revocation_check check (
    (status = 'accepted' and revoked_at is null) or
    (status = 'revoked' and revoked_at is not null)
  )
);

alter table public.account_billing_settings
  add column if not exists overage_authorization_status text not null default 'not_requested',
  add column if not exists overage_authorization_id uuid references public.billing_overage_authorizations(id) on delete set null,
  add column if not exists overage_terms_version text,
  add column if not exists overage_authorized_at timestamptz,
  add column if not exists overage_authorized_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  add column if not exists overage_billing_enabled boolean not null default false;

alter table public.account_billing_settings
  drop constraint if exists account_billing_settings_overage_authorization_status_check;

alter table public.account_billing_settings
  add constraint account_billing_settings_overage_authorization_status_check
  check (overage_authorization_status in ('not_requested', 'accepted', 'revoked'));

create index if not exists billing_overage_authorizations_account_idx
  on public.billing_overage_authorizations(account_id, accepted_at desc);

create unique index if not exists billing_overage_authorizations_active_account_uidx
  on public.billing_overage_authorizations(account_id)
  where status = 'accepted' and revoked_at is null;

alter table public.billing_usage_reports
  add column if not exists additional_route_count integer not null default 0,
  add column if not exists overage_amount_cents integer not null default 0,
  add column if not exists overage_authorization_id uuid references public.billing_overage_authorizations(id) on delete set null;

alter table public.billing_usage_reports
  drop constraint if exists billing_usage_reports_overage_counts_check;

alter table public.billing_usage_reports
  add constraint billing_usage_reports_overage_counts_check
  check (additional_route_count >= 0 and overage_amount_cents >= 0);

create unique index if not exists billing_usage_reports_account_period_uidx
  on public.billing_usage_reports(account_id, billing_period_start);

alter table public.billing_overage_authorizations enable row level security;

drop policy if exists billing_overage_authorizations_by_account on public.billing_overage_authorizations;
create policy billing_overage_authorizations_by_account
on public.billing_overage_authorizations
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260712013000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
