create table if not exists public.driver_month_activation_charges (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  billing_month date not null,
  unit_amount_cents integer not null default 500,
  currency text not null default 'usd',
  first_activated_at timestamptz not null,
  charge_status text not null default 'accrued',
  provider_invoice_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_month_activation_amount_check check (unit_amount_cents = 500),
  constraint driver_month_activation_currency_check check (currency = 'usd'),
  constraint driver_month_activation_status_check check (
    charge_status in ('accrued', 'invoiced', 'paid', 'voided')
  ),
  constraint driver_month_activation_month_check check (
    billing_month = date_trunc('month', billing_month)::date
  ),
  unique (account_id, driver_id, billing_month)
);

create index if not exists driver_month_activation_account_month_idx
  on public.driver_month_activation_charges (account_id, billing_month, charge_status);

create or replace function public.readyroute_accrue_driver_month(
  p_account_id uuid,
  p_driver_id uuid,
  p_activated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.driver_month_activation_charges (
    account_id,
    driver_id,
    billing_month,
    first_activated_at
  ) values (
    p_account_id,
    p_driver_id,
    date_trunc('month', p_activated_at at time zone 'UTC')::date,
    p_activated_at
  )
  on conflict (account_id, driver_id, billing_month) do nothing;
end;
$$;

create or replace function public.readyroute_accrue_active_driver_month(p_billing_month date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  normalized_month date := date_trunc('month', p_billing_month)::date;
begin
  insert into public.driver_month_activation_charges (
    account_id,
    driver_id,
    billing_month,
    first_activated_at
  )
  select
    d.account_id,
    d.id,
    normalized_month,
    normalized_month::timestamptz
  from public.drivers d
  where d.is_active = true
  on conflict (account_id, driver_id, billing_month) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.readyroute_driver_activation_charge_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active = true and (tg_op = 'INSERT' or old.is_active is distinct from true) then
    perform public.readyroute_accrue_driver_month(new.account_id, new.id, now());
  end if;
  return new;
end;
$$;

revoke all on function public.readyroute_accrue_driver_month(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.readyroute_accrue_active_driver_month(date) from public, anon, authenticated;
revoke all on function public.readyroute_driver_activation_charge_trigger() from public, anon, authenticated;

drop trigger if exists readyroute_driver_activation_charge on public.drivers;
create trigger readyroute_driver_activation_charge
after insert or update of is_active on public.drivers
for each row execute function public.readyroute_driver_activation_charge_trigger();

alter table public.driver_month_activation_charges enable row level security;

select public.readyroute_accrue_active_driver_month(current_date);

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260810181000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
