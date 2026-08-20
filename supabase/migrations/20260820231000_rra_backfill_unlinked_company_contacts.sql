with matching_signup as (
  select
    account.id as account_id,
    signup.cxpc_phone_number,
    signup.csa_phone_number,
    coalesce(nullif(btrim(signup.manager_name), ''), nullif(btrim(signup.name), '')) as manager_name,
    coalesce(nullif(btrim(signup.manager_phone_number), ''), nullif(btrim(signup.phone_number), '')) as manager_phone_number
  from public.accounts as account
  join public.early_access_signups as signup
    on lower(btrim(signup.email)) = lower(btrim(account.manager_email))
   and lower(btrim(signup.company_csa)) = lower(btrim(account.company_name))
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
from matching_signup as signup
where account.id = signup.account_id
  and (
    nullif(btrim(account.rra_cxpc_phone_number), '') is null
    or nullif(btrim(account.rra_csa_phone_number), '') is null
    or nullif(btrim(account.rra_primary_manager_name), '') is null
    or nullif(btrim(account.rra_primary_manager_phone_number), '') is null
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260820231000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
