create table if not exists public.property_intel (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  normalized_address text not null,
  display_address text,
  property_name text,
  property_type text,
  building text,
  access_note text,
  parking_note text,
  entry_note text,
  business_hours text,
  shared_note text,
  warning_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_intel add column if not exists display_address text;
alter table public.property_intel add column if not exists property_name text;
alter table public.property_intel add column if not exists property_type text;
alter table public.property_intel add column if not exists building text;
alter table public.property_intel add column if not exists access_note text;
alter table public.property_intel add column if not exists parking_note text;
alter table public.property_intel add column if not exists entry_note text;
alter table public.property_intel add column if not exists business_hours text;
alter table public.property_intel add column if not exists shared_note text;
alter table public.property_intel add column if not exists warning_flags text[] not null default '{}';
alter table public.property_intel add column if not exists created_at timestamptz not null default now();
alter table public.property_intel add column if not exists updated_at timestamptz not null default now();

create index if not exists property_intel_account_id_idx
  on public.property_intel(account_id);

create index if not exists property_intel_normalized_address_idx
  on public.property_intel(normalized_address);

create unique index if not exists property_intel_account_address_uidx
  on public.property_intel(account_id, normalized_address);

alter table public.property_intel enable row level security;

drop policy if exists property_intel_by_account on public.property_intel;

create policy property_intel_by_account
on public.property_intel
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());
