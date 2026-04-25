-- Normalize FCC work area labels into ReadyRoute's canonical 3-digit route codes.
-- Example: "OCEA - 823 RAMIREZCASTELLANOS, BRAYANT - Available" becomes "823".

with route_codes as (
  select
    id,
    account_id,
    date,
    work_area_name,
    substring(work_area_name from '\m[0-9]{3}\M') as route_code
  from routes
  where work_area_name is not null
)
update routes
set work_area_name = route_codes.route_code
from route_codes
where routes.id = route_codes.id
  and route_codes.route_code is not null
  and routes.work_area_name <> route_codes.route_code
  and not exists (
    select 1
    from routes existing
    where existing.id <> routes.id
      and existing.account_id = route_codes.account_id
      and existing.date = route_codes.date
      and existing.work_area_name = route_codes.route_code
      and existing.archived_at is null
  );
