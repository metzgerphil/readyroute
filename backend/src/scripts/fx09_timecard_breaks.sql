create table if not exists public.timecard_breaks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  timecard_id uuid not null references public.timecards(id) on delete cascade,
  break_type text not null default 'rest',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.timecard_breaks add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.timecard_breaks add column if not exists driver_id uuid references public.drivers(id) on delete cascade;
alter table public.timecard_breaks add column if not exists route_id uuid references public.routes(id) on delete set null;
alter table public.timecard_breaks add column if not exists timecard_id uuid references public.timecards(id) on delete cascade;
alter table public.timecard_breaks add column if not exists break_type text not null default 'rest';
alter table public.timecard_breaks add column if not exists started_at timestamptz not null default now();
alter table public.timecard_breaks add column if not exists ended_at timestamptz;

create index if not exists timecard_breaks_timecard_id_idx
  on public.timecard_breaks(timecard_id);

create index if not exists timecard_breaks_driver_id_idx
  on public.timecard_breaks(driver_id);

create index if not exists timecard_breaks_started_at_idx
  on public.timecard_breaks(started_at desc);
