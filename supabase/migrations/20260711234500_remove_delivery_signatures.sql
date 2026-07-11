-- Atomically replaces a manifest route's stops/packages after the backend has
-- parsed, merged, and validated the incoming manifest bundle.
--
-- This keeps the old live route rows intact until the new route, stops, and
-- packages can all be written successfully in one database transaction.

create or replace function public.replace_manifest_route_atomic(
  p_account_id uuid,
  p_route_id uuid,
  p_existing_route_id uuid,
  p_replace_existing boolean,
  p_route jsonb,
  p_stops jsonb,
  p_packages jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route_id uuid := p_route_id;
  v_missing_package_stops integer := 0;
  v_stop_count integer := 0;
  v_package_count integer := 0;
begin
  if p_replace_existing then
    select id
      into v_route_id
      from public.routes
      where id = p_existing_route_id
        and account_id = p_account_id
      for update;

    if v_route_id is null then
      raise exception 'Existing route % was not found for this account', p_existing_route_id
        using errcode = 'P0002';
    end if;

    delete from public.packages
      where stop_id in (
        select id from public.stops where route_id = v_route_id
      );

    delete from public.stops
      where route_id = v_route_id;

    update public.routes
      set driver_id = nullif(p_route->>'driver_id', '')::uuid,
          vehicle_id = nullif(p_route->>'vehicle_id', '')::uuid,
          work_area_name = p_route->>'work_area_name',
          status = coalesce(p_route->>'status', status),
          dispatch_state = coalesce(p_route->>'dispatch_state', dispatch_state),
          dispatched_at = nullif(p_route->>'dispatched_at', '')::timestamptz,
          dispatched_by_manager_user_id = nullif(p_route->>'dispatched_by_manager_user_id', '')::uuid,
          sync_state = coalesce(p_route->>'sync_state', sync_state),
          last_manifest_sync_at = nullif(p_route->>'last_manifest_sync_at', '')::timestamptz,
          last_manifest_change_at = nullif(p_route->>'last_manifest_change_at', '')::timestamptz,
          manifest_stop_count = coalesce((p_route->>'manifest_stop_count')::integer, manifest_stop_count),
          manifest_package_count = coalesce((p_route->>'manifest_package_count')::integer, manifest_package_count),
          manifest_fingerprint = p_route->>'manifest_fingerprint',
          last_manifest_sync_error = nullif(p_route->>'last_manifest_sync_error', ''),
          source = p_route->>'source',
          sa_number = p_route->>'sa_number',
          contractor_name = p_route->>'contractor_name',
          total_stops = coalesce((p_route->>'total_stops')::integer, total_stops),
          completed_stops = coalesce((p_route->>'completed_stops')::integer, completed_stops),
          completed_at = nullif(p_route->>'completed_at', '')::timestamptz
      where id = v_route_id
        and account_id = p_account_id;
  else
    insert into public.routes (
      id,
      account_id,
      driver_id,
      vehicle_id,
      work_area_name,
      date,
      status,
      dispatch_state,
      dispatched_at,
      dispatched_by_manager_user_id,
      sync_state,
      last_manifest_sync_at,
      last_manifest_change_at,
      manifest_stop_count,
      manifest_package_count,
      manifest_fingerprint,
      last_manifest_sync_error,
      source,
      sa_number,
      contractor_name,
      total_stops,
      completed_stops,
      completed_at
    )
    values (
      v_route_id,
      p_account_id,
      nullif(p_route->>'driver_id', '')::uuid,
      nullif(p_route->>'vehicle_id', '')::uuid,
      p_route->>'work_area_name',
      (p_route->>'date')::date,
      coalesce(p_route->>'status', 'pending'),
      coalesce(p_route->>'dispatch_state', 'staged'),
      nullif(p_route->>'dispatched_at', '')::timestamptz,
      nullif(p_route->>'dispatched_by_manager_user_id', '')::uuid,
      coalesce(p_route->>'sync_state', 'sync_pending'),
      nullif(p_route->>'last_manifest_sync_at', '')::timestamptz,
      nullif(p_route->>'last_manifest_change_at', '')::timestamptz,
      coalesce((p_route->>'manifest_stop_count')::integer, 0),
      coalesce((p_route->>'manifest_package_count')::integer, 0),
      p_route->>'manifest_fingerprint',
      nullif(p_route->>'last_manifest_sync_error', ''),
      p_route->>'source',
      p_route->>'sa_number',
      p_route->>'contractor_name',
      coalesce((p_route->>'total_stops')::integer, 0),
      coalesce((p_route->>'completed_stops')::integer, 0),
      nullif(p_route->>'completed_at', '')::timestamptz
    );
  end if;

  create temporary table if not exists pg_temp.manifest_atomic_stop_ids (
    sequence_order integer primary key,
    id uuid not null
  ) on commit drop;

  truncate table pg_temp.manifest_atomic_stop_ids;

  with inserted as (
    insert into public.stops (
      route_id,
      sequence_order,
      address,
      address_line2,
      contact_name,
      business_name,
      company_name,
      primary_phone,
      alternate_phone,
      email,
      customer_instructions,
      delivery_instructions,
      consignee,
      shipper,
      contact_source,
      contact_last_imported_at,
      raw_contact_metadata,
      lat,
      lng,
      status,
      is_pickup,
      is_business,
      has_note,
      sid,
      ready_time,
      close_time,
      has_time_commit,
      stop_type,
      has_pickup,
      has_delivery,
      geocode_source,
      geocode_accuracy,
      exception_code,
      delivery_type_code,
      pod_photo_url,
      scanned_at,
      completed_at,
      notes
    )
    select
      v_route_id,
      s.sequence_order,
      s.address,
      s.address_line2,
      s.contact_name,
      s.business_name,
      s.company_name,
      s.primary_phone,
      s.alternate_phone,
      s.email,
      s.customer_instructions,
      s.delivery_instructions,
      s.consignee,
      s.shipper,
      s.contact_source,
      s.contact_last_imported_at,
      s.raw_contact_metadata,
      s.lat,
      s.lng,
      coalesce(s.status, 'pending'),
      coalesce(s.is_pickup, false),
      coalesce(s.is_business, false),
      coalesce(s.has_note, false),
      s.sid,
      s.ready_time,
      s.close_time,
      coalesce(s.has_time_commit, false),
      s.stop_type,
      coalesce(s.has_pickup, false),
      coalesce(s.has_delivery, true),
      s.geocode_source,
      s.geocode_accuracy,
      s.exception_code,
      s.delivery_type_code,
      s.pod_photo_url,
      s.scanned_at,
      s.completed_at,
      s.notes
    from jsonb_to_recordset(coalesce(p_stops, '[]'::jsonb)) as s(
      sequence_order integer,
      address text,
      address_line2 text,
      contact_name text,
      business_name text,
      company_name text,
      primary_phone text,
      alternate_phone text,
      email text,
      customer_instructions text,
      delivery_instructions text,
      consignee text,
      shipper text,
      contact_source text,
      contact_last_imported_at timestamptz,
      raw_contact_metadata jsonb,
      lat numeric,
      lng numeric,
      status text,
      is_pickup boolean,
      is_business boolean,
      has_note boolean,
      sid text,
      ready_time text,
      close_time text,
      has_time_commit boolean,
      stop_type text,
      has_pickup boolean,
      has_delivery boolean,
      geocode_source text,
      geocode_accuracy text,
      exception_code text,
      delivery_type_code text,
      pod_photo_url text,
      scanned_at timestamptz,
      completed_at timestamptz,
      notes text
    )
    returning sequence_order, id
  )
  insert into pg_temp.manifest_atomic_stop_ids(sequence_order, id)
  select sequence_order, id from inserted;

  select count(*)
    into v_missing_package_stops
    from jsonb_to_recordset(coalesce(p_packages, '[]'::jsonb)) as p(route_stop_sequence integer)
    left join pg_temp.manifest_atomic_stop_ids s
      on s.sequence_order = p.route_stop_sequence
    where s.id is null;

  if v_missing_package_stops > 0 then
    raise exception '% package rows referenced a missing manifest stop sequence', v_missing_package_stops
      using errcode = '23503';
  end if;

  insert into public.packages (
    stop_id,
    tracking_number,
    service_code,
    hazmat
  )
  select
    s.id,
    p.tracking_number,
    p.service_code,
    coalesce(p.hazmat, false)
  from jsonb_to_recordset(coalesce(p_packages, '[]'::jsonb)) as p(
    route_stop_sequence integer,
    tracking_number text,
    service_code text,
    hazmat boolean
  )
  join pg_temp.manifest_atomic_stop_ids s
    on s.sequence_order = p.route_stop_sequence;

  select count(*) into v_stop_count from pg_temp.manifest_atomic_stop_ids;
  select jsonb_array_length(coalesce(p_packages, '[]'::jsonb)) into v_package_count;

  return jsonb_build_object(
    'route_id', v_route_id,
    'inserted_stop_count', v_stop_count,
    'inserted_package_count', v_package_count,
    'stop_ids', (
      select coalesce(
        jsonb_agg(jsonb_build_object('sequence_order', sequence_order, 'id', id) order by sequence_order),
        '[]'::jsonb
      )
      from pg_temp.manifest_atomic_stop_ids
    )
  );
end;
$$;

revoke all on function public.replace_manifest_route_atomic(uuid, uuid, uuid, boolean, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.replace_manifest_route_atomic(uuid, uuid, uuid, boolean, jsonb, jsonb, jsonb) to service_role;

alter table public.stops
  drop column if exists signer_name,
  drop column if exists signature_url,
  drop column if exists age_confirmed,
  drop column if exists pod_signature_url;

alter table public.packages
  drop column if exists requires_signature,
  drop column if exists requires_adult_signature;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260711234500', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
