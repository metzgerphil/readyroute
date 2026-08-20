alter table public.early_access_signups
  add column if not exists manager_name text;

comment on column public.early_access_signups.name is
  'Name of the person who completed company enrollment; this person may not be the day-to-day manager.';

comment on column public.early_access_signups.phone_number is
  'Phone number of the person who completed company enrollment.';

comment on column public.early_access_signups.manager_name is
  'Day-to-day operational manager that drivers may need to contact.';

comment on column public.early_access_signups.manager_phone_number is
  'Phone number for the day-to-day operational manager that drivers may need to contact.';

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260820210000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
