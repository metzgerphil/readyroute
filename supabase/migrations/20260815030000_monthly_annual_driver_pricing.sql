alter table public.early_access_signups
  add column if not exists billing_interval text not null default 'monthly';

alter table public.early_access_signups
  drop constraint if exists early_access_signups_billing_interval_check;

alter table public.early_access_signups
  add constraint early_access_signups_billing_interval_check check (
    billing_interval in ('monthly', 'annual')
  );

alter table public.accounts
  add column if not exists billing_interval text not null default 'monthly';

alter table public.accounts
  drop constraint if exists accounts_billing_interval_check;

alter table public.accounts
  add constraint accounts_billing_interval_check check (
    billing_interval in ('monthly', 'annual')
  );

alter table public.driver_month_activation_charges
  alter column unit_amount_cents set default 1000;

alter table public.driver_month_activation_charges
  drop constraint if exists driver_month_activation_amount_check;

-- Preserve historical $5 ledger rows while requiring the current $10 rate for
-- newly accrued rows through the updated application default.
alter table public.driver_month_activation_charges
  add constraint driver_month_activation_amount_check check (
    unit_amount_cents in (500, 1000)
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260815030000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
