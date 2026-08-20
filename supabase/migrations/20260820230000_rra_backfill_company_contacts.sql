with latest_signup as (
  select distinct on (account_id)
    account_id,
    cxpc_phone_number,
    csa_phone_number,
    coalesce(nullif(btrim(manager_name), ''), nullif(btrim(name), '')) as manager_name,
    coalesce(nullif(btrim(manager_phone_number), ''), nullif(btrim(phone_number), '')) as manager_phone_number
  from public.early_access_signups
  where account_id is not null
  order by account_id, updated_at desc nulls last, created_at desc nulls last
)
update public.accounts as account
set
  rra_cxpc_phone_number = coalesce(
    nullif(btrim(account.rra_cxpc_phone_number), ''),
    nullif(btrim(signup.cxpc_phone_number), '')
  ),
  rra_csa_phone_number = coalesce(
    nullif(btrim(account.rra_csa_phone_number), ''),
    nullif(btrim(signup.csa_phone_number), '')
  ),
  rra_primary_manager_name = coalesce(
    nullif(btrim(account.rra_primary_manager_name), ''),
    signup.manager_name
  ),
  rra_primary_manager_phone_number = coalesce(
    nullif(btrim(account.rra_primary_manager_phone_number), ''),
    signup.manager_phone_number
  )
from latest_signup as signup
where account.id = signup.account_id
  and (
    nullif(btrim(account.rra_cxpc_phone_number), '') is null
    or nullif(btrim(account.rra_csa_phone_number), '') is null
    or nullif(btrim(account.rra_primary_manager_name), '') is null
    or nullif(btrim(account.rra_primary_manager_phone_number), '') is null
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260820230000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
