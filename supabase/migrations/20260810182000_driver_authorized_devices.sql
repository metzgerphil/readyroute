create table if not exists public.driver_authorized_devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  device_hash text not null,
  device_name text,
  authorized_at timestamptz not null default now(),
  last_authenticated_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_authorized_device_hash_check check (device_hash ~ '^[a-f0-9]{64}$'),
  unique (driver_id, device_hash)
);

create unique index if not exists driver_one_active_authorized_device_idx
  on public.driver_authorized_devices (driver_id)
  where revoked_at is null;

create index if not exists driver_authorized_devices_account_idx
  on public.driver_authorized_devices (account_id, driver_id, authorized_at desc);

alter table public.driver_authorized_devices enable row level security;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260810182000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
