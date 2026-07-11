alter table public.vehicles
  add column if not exists readiness_source_type text,
  add column if not exists readiness_source_id uuid;

alter table public.vehicles
  drop constraint if exists vehicles_readiness_source_type_check;

alter table public.vehicles
  add constraint vehicles_readiness_source_type_check
  check (readiness_source_type is null or readiness_source_type in ('inspection'));

create index if not exists vehicles_readiness_source_idx
  on public.vehicles (account_id, readiness_source_type, readiness_source_id)
  where readiness_source_id is not null;
