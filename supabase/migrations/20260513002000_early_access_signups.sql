create table if not exists public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company_csa text,
  role text,
  driver_count integer,
  csa_count integer,
  current_routing_tool text,
  interested_in_beta boolean,
  source_page text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint early_access_signups_email_not_blank check (length(trim(email)) > 0),
  constraint early_access_signups_name_not_blank check (length(trim(name)) > 0),
  constraint early_access_signups_driver_count_nonnegative check (driver_count is null or driver_count >= 0),
  constraint early_access_signups_csa_count_nonnegative check (csa_count is null or csa_count >= 0)
);

create unique index if not exists early_access_signups_lower_email_uidx
  on public.early_access_signups (lower(email));

create index if not exists early_access_signups_created_at_idx
  on public.early_access_signups (created_at desc);

alter table public.early_access_signups enable row level security;
