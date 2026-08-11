alter table public.drivers
  add column if not exists username text,
  add column if not exists password_hash text,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_accepted_at timestamptz;

create unique index if not exists drivers_account_username_unique_idx
  on public.drivers (account_id, lower(username))
  where username is not null;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260810183000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
