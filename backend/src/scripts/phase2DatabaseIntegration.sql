\set ON_ERROR_STOP on

begin;

do $$
declare
  account_one constant uuid := '10000000-0000-4000-8000-000000000001';
  account_two constant uuid := '10000000-0000-4000-8000-000000000002';
  driver_one constant uuid := '20000000-0000-4000-8000-000000000001';
  driver_two constant uuid := '20000000-0000-4000-8000-000000000002';
  charge_count integer;
  active_device_count integer;
begin
  insert into public.accounts (id, company_name, manager_email, manager_password_hash)
  values
    (account_one, 'Phase 2 Company One', 'owner-one@example.test', 'not-a-real-password'),
    (account_two, 'Phase 2 Company Two', 'owner-two@example.test', 'not-a-real-password');

  insert into public.drivers (id, account_id, name, email, pin, is_active, username)
  values
    (driver_one, account_one, 'Driver One', 'driver-one@example.test', 'test-pin-hash', true, 'driver.one'),
    (driver_two, account_two, 'Driver Two', 'driver-two@example.test', 'test-pin-hash', true, 'driver.one');

  select count(*) into charge_count
  from public.driver_month_activation_charges
  where account_id = account_one and driver_id = driver_one;
  if charge_count <> 1 then
    raise exception 'initial activation should accrue exactly one driver-month charge, found %', charge_count;
  end if;

  update public.drivers set is_active = false where id = driver_one;
  update public.drivers set is_active = true where id = driver_one;
  update public.drivers set is_active = false where id = driver_one;
  update public.drivers set is_active = true where id = driver_one;

  select count(*) into charge_count
  from public.driver_month_activation_charges
  where account_id = account_one and driver_id = driver_one;
  if charge_count <> 1 then
    raise exception 'same-month reactivation duplicated a charge, found %', charge_count;
  end if;

  perform public.readyroute_accrue_active_driver_month(
    (date_trunc('month', current_date) + interval '1 month')::date
  );
  perform public.readyroute_accrue_active_driver_month(
    (date_trunc('month', current_date) + interval '1 month')::date
  );
  select count(*) into charge_count
  from public.driver_month_activation_charges
  where account_id = account_one and driver_id = driver_one;
  if charge_count <> 2 then
    raise exception 'duplicate monthly jobs should create exactly one additional charge, found %', charge_count;
  end if;

  update public.drivers set is_active = false where id = driver_two;
  perform public.readyroute_accrue_active_driver_month(
    (date_trunc('month', current_date) + interval '2 months')::date
  );
  select count(*) into charge_count
  from public.driver_month_activation_charges
  where account_id = account_two and driver_id = driver_two;
  if charge_count <> 2 then
    raise exception 'an inactive driver should not accrue a later month, found %', charge_count;
  end if;

  insert into public.driver_authorized_devices (
    account_id, driver_id, device_hash, device_name
  ) values (
    account_one, driver_one, repeat('a', 64), 'First device'
  );

  begin
    insert into public.driver_authorized_devices (
      account_id, driver_id, device_hash, device_name
    ) values (
      account_one, driver_one, repeat('b', 64), 'Second device'
    );
    raise exception 'second active device should violate the one-device constraint';
  exception
    when unique_violation then null;
  end;

  update public.driver_authorized_devices
  set revoked_at = now()
  where driver_id = driver_one and revoked_at is null;
  insert into public.driver_authorized_devices (
    account_id, driver_id, device_hash, device_name
  ) values (
    account_one, driver_one, repeat('b', 64), 'Replacement device'
  );

  select count(*) into active_device_count
  from public.driver_authorized_devices
  where driver_id = driver_one and revoked_at is null;
  if active_device_count <> 1 then
    raise exception 'replacement should leave exactly one active device, found %', active_device_count;
  end if;

  begin
    update public.drivers set username = 'DRIVER.ONE' where id = driver_two;
    update public.drivers set account_id = account_one where id = driver_two;
    raise exception 'case-insensitive duplicate username should fail inside one company';
  exception
    when unique_violation then null;
  end;
end
$$;

insert into public.driver_help_knowledge_records (
  knowledge_id, version, status, is_published, canonical_situation,
  authoritative_rule, concise_answer, production_capture_gate,
  production_trace_gate, record_checksum
) values
  ('KNO-DB-SOURCE', 1, 'SOURCE_VERIFIED', true, 'Source verified test',
   'Use the verified rule.', 'Use the verified step.',
   'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
   'CLAIM_FRAGMENT_TRACE_READY', repeat('1', 64)),
  ('KNO-DB-APPROVED', 1, 'READY_ROUTE_APPROVED', true, 'Approved test',
   'Use the approved rule.', 'Use the approved step.',
   'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
   'CLAIM_FRAGMENT_TRACE_READY', repeat('2', 64));

do $$
begin
  begin
    insert into public.driver_help_knowledge_records (
      knowledge_id, version, status, is_published, canonical_situation,
      authoritative_rule, concise_answer, production_capture_gate,
      production_trace_gate, record_checksum
    ) values (
      'KNO-DB-PENDING', 1, 'PENDING_REVIEW', true, 'Pending test',
      'Do not publish.', 'Do not publish.',
      'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
      'CLAIM_FRAGMENT_TRACE_READY', repeat('3', 64)
    );
    raise exception 'a pending-review record must not be publishable';
  exception
    when check_violation then null;
  end;
end
$$;

grant select on public.drivers to authenticated, anon;
grant select on public.driver_authorized_devices to authenticated, anon;
grant select on public.driver_month_activation_charges to authenticated, anon;
grant select on public.driver_help_knowledge_records to authenticated, anon;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"account_id":"10000000-0000-4000-8000-000000000001","driver_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  visible_drivers integer;
  visible_private_rows integer;
begin
  select count(*) into visible_drivers from public.drivers;
  if visible_drivers <> 1 then
    raise exception 'authenticated company scope should expose one driver, found %', visible_drivers;
  end if;

  select count(*) into visible_private_rows from public.driver_authorized_devices;
  if visible_private_rows <> 0 then
    raise exception 'authorized-device rows must not be directly readable by authenticated clients';
  end if;

  select count(*) into visible_private_rows from public.driver_month_activation_charges;
  if visible_private_rows <> 0 then
    raise exception 'billing rows must not be directly readable by authenticated clients';
  end if;

  select count(*) into visible_private_rows from public.driver_help_knowledge_records;
  if visible_private_rows <> 0 then
    raise exception 'canonical knowledge rows must not be directly readable by authenticated clients';
  end if;

  if has_function_privilege('authenticated', 'public.readyroute_accrue_driver_month(uuid, uuid, timestamptz)', 'EXECUTE') then
    raise exception 'authenticated role must not execute driver-month accrual';
  end if;
end
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  visible_rows integer;
begin
  select count(*) into visible_rows from public.drivers;
  if visible_rows <> 0 then
    raise exception 'anonymous clients must not see drivers';
  end if;

  if has_function_privilege('anon', 'public.readyroute_accrue_active_driver_month(date)', 'EXECUTE') then
    raise exception 'anonymous role must not execute monthly accrual';
  end if;
end
$$;

reset role;
rollback;

select 'phase2 database integration checks passed' as result;
