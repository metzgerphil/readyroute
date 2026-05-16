-- Remove legacy global tracking-number uniqueness that blocks manifest
-- refreshes and uploads when archived route package rows still exist.

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
