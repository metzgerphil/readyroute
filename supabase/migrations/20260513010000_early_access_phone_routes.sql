alter table public.early_access_signups
  add column if not exists phone_number text,
  add column if not exists route_count integer;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_route_count_nonnegative;

alter table public.early_access_signups
  add constraint early_access_signups_route_count_nonnegative
  check (route_count is null or route_count >= 0);
