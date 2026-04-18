create table if not exists public.vedr_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vedr_settings_provider_check check (provider in ('groundcloud', 'velocitor') or provider is null)
);

alter table public.vedr_settings add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.vedr_settings add column if not exists provider text;
alter table public.vedr_settings add column if not exists setup_completed_at timestamptz;
alter table public.vedr_settings add column if not exists created_at timestamptz not null default now();
alter table public.vedr_settings add column if not exists updated_at timestamptz not null default now();

drop index if exists vedr_settings_organization_id_uidx;

create unique index if not exists vedr_settings_account_id_uidx
  on public.vedr_settings(account_id);

alter table public.vedr_settings
  drop constraint if exists vedr_settings_provider_check;

alter table public.vedr_settings
  add constraint vedr_settings_provider_check
  check (provider in ('groundcloud', 'velocitor') or provider is null);

alter table public.vedr_settings enable row level security;

drop policy if exists vedr_settings_by_account on public.vedr_settings;

create policy vedr_settings_by_account
on public.vedr_settings
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
