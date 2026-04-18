create table if not exists public.manager_users (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  full_name text,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manager_users_email_uidx on public.manager_users(lower(email));
create index if not exists manager_users_account_id_idx on public.manager_users(account_id);

insert into public.manager_users (account_id, email, full_name, password_hash, is_active)
select
  id as account_id,
  lower(manager_email) as email,
  null as full_name,
  manager_password_hash as password_hash,
  true as is_active
from public.accounts
where manager_email is not null
  and manager_password_hash is not null
  and not exists (
    select 1
    from public.manager_users mu
    where lower(mu.email) = lower(accounts.manager_email)
  );
