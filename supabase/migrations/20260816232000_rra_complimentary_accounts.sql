alter table public.accounts
  add column if not exists rra_billing_treatment text not null default 'standard',
  add column if not exists rra_complimentary_reason text,
  add column if not exists rra_billing_treatment_updated_at timestamptz;

alter table public.accounts
  drop constraint if exists accounts_rra_billing_treatment_check;

alter table public.accounts
  add constraint accounts_rra_billing_treatment_check check (
    rra_billing_treatment in ('standard', 'complimentary')
  );

comment on column public.accounts.rra_billing_treatment is
  'Controls Ready Route Answers per-driver invoicing without changing account access or usage reporting.';

comment on column public.accounts.rra_complimentary_reason is
  'Internal staff explanation for complimentary Ready Route Answers service.';

create or replace function public.readyroute_set_rra_billing_treatment(
  p_account_id uuid,
  p_treatment text,
  p_reason text,
  p_updated_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_treatment not in ('standard', 'complimentary') then
    raise exception 'Invalid Ready Route Answers billing treatment';
  end if;

  update public.accounts
  set rra_billing_treatment = p_treatment,
      rra_complimentary_reason = case when p_treatment = 'complimentary' then nullif(trim(p_reason), '') else null end,
      rra_billing_treatment_updated_at = p_updated_at
  where id = p_account_id;

  if not found then
    raise exception 'Ready Route account not found';
  end if;

  if p_treatment = 'complimentary' then
    update public.driver_month_activation_charges
    set charge_status = 'voided',
        updated_at = p_updated_at
    where account_id = p_account_id
      and charge_status = 'accrued';
  end if;
end;
$$;

revoke all on function public.readyroute_set_rra_billing_treatment(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.readyroute_set_rra_billing_treatment(uuid, text, text, timestamptz)
  to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816232000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
