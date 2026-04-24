create table if not exists public.fedex_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nickname text not null,
  account_number text not null,
  billing_contact_name text,
  billing_company_name text,
  billing_address_line1 text not null,
  billing_address_line2 text,
  billing_city text not null,
  billing_state_or_province text not null,
  billing_postal_code text not null,
  billing_country_code text not null default 'US',
  connection_status text not null default 'not_started',
  connection_reference text,
  last_verified_at timestamptz,
  is_default boolean not null default false,
  created_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  constraint fedex_accounts_connection_status_check check (
    connection_status in ('not_started', 'pending_mfa', 'connected', 'failed', 'disconnected')
  ),
  constraint fedex_accounts_account_number_length check (char_length(trim(account_number)) >= 5)
);

create index if not exists fedex_accounts_account_id_idx on public.fedex_accounts(account_id);
create index if not exists fedex_accounts_status_idx on public.fedex_accounts(account_id, connection_status);
create unique index if not exists fedex_accounts_default_uidx on public.fedex_accounts(account_id)
where is_default = true and disconnected_at is null;
create unique index if not exists fedex_accounts_account_number_uidx on public.fedex_accounts(account_id, account_number)
where disconnected_at is null;

alter table public.fedex_accounts enable row level security;

drop policy if exists fedex_accounts_by_account on public.fedex_accounts;
create policy fedex_accounts_by_account
on public.fedex_accounts
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
