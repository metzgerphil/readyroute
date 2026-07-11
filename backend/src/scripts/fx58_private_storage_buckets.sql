insert into storage.buckets (id, name, public)
values
  ('pod-photos', 'pod-photos', false),
  ('driver-documents', 'driver-documents', false),
  ('vehicle-inspection-photos', 'vehicle-inspection-photos', false)
on conflict (id) do update
set public = false;

update storage.buckets
set public = false
where public is distinct from false;

do $$
declare
  storage_policy record;
begin
  for storage_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', storage_policy.policyname);
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.driver_documents') is not null then
    update public.driver_documents
    set public_url = null
    where public_url is not null;
  end if;
end
$$;
