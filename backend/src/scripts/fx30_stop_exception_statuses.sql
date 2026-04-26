alter table public.stops drop constraint if exists stops_status_check;

alter table public.stops
  add constraint stops_status_check
  check (status in (
    'pending',
    'delivered',
    'complete',
    'attempted',
    'pickup_complete',
    'pickup_attempted',
    'incomplete'
  ));
