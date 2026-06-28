insert into storage.buckets (id, name, public)
values ('vehicle-inspection-photos', 'vehicle-inspection-photos', true)
on conflict (id) do update
set public = excluded.public;
