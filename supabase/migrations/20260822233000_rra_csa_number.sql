alter table public.early_access_signups
  add column if not exists csa_number text;

alter table public.accounts
  add column if not exists rra_csa_number text;

comment on column public.early_access_signups.csa_number is
  'Contracted service area identifier entered during company signup; not a phone number.';

comment on column public.accounts.rra_csa_number is
  'Company contracted service area identifier; not a phone number.';

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260822233000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
