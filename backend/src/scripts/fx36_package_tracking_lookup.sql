-- Package tracking numbers can reappear when a manifest is refreshed or when
-- archived route history is retained. Keep tracking searchable, but do not
-- enforce a stale global uniqueness rule that blocks valid XLS/GPX imports.

alter table public.packages
  drop constraint if exists packages_tracking_number_key;
alter table public.packages
  drop constraint if exists packages_tracking_number_idx;
alter table public.packages
  drop constraint if exists packages_tracking_number_unique;

drop index if exists public.packages_tracking_number_key;
drop index if exists public.packages_tracking_number_idx;

create index if not exists packages_tracking_number_idx
on public.packages(tracking_number);
