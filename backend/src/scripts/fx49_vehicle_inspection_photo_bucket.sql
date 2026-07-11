insert into storage.buckets (id, name, public)
values ('vehicle-inspection-photos', 'vehicle-inspection-photos', false)
on conflict (id) do update
set public = false;
