alter table public.packages
  add column if not exists floor_load boolean not null default false;

create index if not exists packages_floor_load_idx
  on public.packages(floor_load)
  where floor_load = true;
