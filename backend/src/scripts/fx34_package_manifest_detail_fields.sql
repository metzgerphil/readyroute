alter table public.packages
  add column if not exists service_code text;

alter table public.packages
  add column if not exists requires_adult_signature boolean not null default false;
