alter table public.vehicles
  add column if not exists vehicle_status text not null default 'active';

update public.vehicles
set vehicle_status = case
  when is_active = false and (vehicle_status is null or vehicle_status = 'active') then 'out_of_service'
  else coalesce(vehicle_status, 'active')
end;

alter table public.vehicles
  drop constraint if exists vehicles_vehicle_status_check;

alter table public.vehicles
  add constraint vehicles_vehicle_status_check
  check (vehicle_status in ('active', 'out_of_service', 'at_the_shop', 'not_on_schedule_b', 'needs_repair'));
