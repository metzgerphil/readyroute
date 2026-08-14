update storage.buckets
set file_size_limit = 12582912
where id = 'driver-help-images';

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260814204500', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
