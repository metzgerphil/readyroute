alter table public.manager_users
  alter column password_hash drop not null;

alter table public.manager_users
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz;

update public.manager_users
set accepted_at = coalesce(accepted_at, created_at)
where password_hash is not null
  and accepted_at is null;
