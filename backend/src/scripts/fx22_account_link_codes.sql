create table if not exists public.account_link_codes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  code text not null unique,
  created_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_account_id uuid references public.accounts(id) on delete set null
);

create index if not exists account_link_codes_account_id_idx
  on public.account_link_codes(account_id);

create index if not exists account_link_codes_expires_at_idx
  on public.account_link_codes(expires_at desc);
