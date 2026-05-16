alter table public.stops
  add column if not exists completed_by_driver_id uuid references public.drivers(id) on delete set null;

create index if not exists stops_completed_by_driver_id_idx
  on public.stops(completed_by_driver_id, completed_at desc);
