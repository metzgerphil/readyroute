alter table public.early_access_signups
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists billing_setup_status text not null default 'not_started',
  add column if not exists billing_legal_name text,
  add column if not exists billing_address_line1 text,
  add column if not exists billing_address_line2 text,
  add column if not exists billing_address_city text,
  add column if not exists billing_address_state text,
  add column if not exists billing_address_postal_code text,
  add column if not exists billing_address_country text,
  add column if not exists billing_policy_version text,
  add column if not exists billing_consent_at timestamptz,
  add column if not exists billing_consent_ip_hash text,
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_billing_setup_status_check;

alter table public.early_access_signups
  add constraint early_access_signups_billing_setup_status_check check (
    billing_setup_status in ('not_started', 'processing', 'succeeded', 'failed', 'replacement_required')
  );

create unique index if not exists early_access_signups_stripe_customer_uidx
  on public.early_access_signups (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists early_access_signups_billing_status_idx
  on public.early_access_signups (billing_setup_status, updated_at desc);

alter table public.accounts
  add column if not exists stripe_default_payment_method_id text,
  add column if not exists stripe_subscription_item_id text,
  add column if not exists billing_setup_status text not null default 'not_started',
  add column if not exists billing_activation_status text not null default 'not_started',
  add column if not exists billing_access_status text not null default 'not_provisioned',
  add column if not exists billing_seat_sync_status text not null default 'in_sync',
  add column if not exists billed_driver_count integer not null default 0,
  add column if not exists next_renewal_driver_count integer,
  add column if not exists paid_through_at timestamptz,
  add column if not exists billing_policy_version text,
  add column if not exists billing_consent_at timestamptz;

alter table public.accounts
  drop constraint if exists accounts_billing_setup_status_check,
  drop constraint if exists accounts_billing_activation_status_check,
  drop constraint if exists accounts_billing_access_status_check,
  drop constraint if exists accounts_billing_seat_sync_status_check,
  drop constraint if exists accounts_billed_driver_count_nonnegative,
  drop constraint if exists accounts_next_renewal_driver_count_nonnegative;

alter table public.accounts
  add constraint accounts_billing_setup_status_check check (
    billing_setup_status in ('not_started', 'processing', 'succeeded', 'failed', 'replacement_required')
  ),
  add constraint accounts_billing_activation_status_check check (
    billing_activation_status in ('not_started', 'ready', 'creating', 'active', 'action_required', 'past_due', 'canceled')
  ),
  add constraint accounts_billing_access_status_check check (
    billing_access_status in ('not_provisioned', 'provisioned', 'grace_period', 'restricted', 'revoked')
  ),
  add constraint accounts_billing_seat_sync_status_check check (
    billing_seat_sync_status in ('in_sync', 'update_pending', 'failed', 'reconciliation_required')
  ),
  add constraint accounts_billed_driver_count_nonnegative check (billed_driver_count >= 0),
  add constraint accounts_next_renewal_driver_count_nonnegative check (
    next_renewal_driver_count is null or next_renewal_driver_count >= 0
  );

create index if not exists accounts_billing_state_idx
  on public.accounts (billing_activation_status, billing_access_status, subscription_status);

alter table public.stripe_webhook_events
  add column if not exists object_created_at timestamptz,
  add column if not exists processing_attempts integer not null default 1,
  add column if not exists error_message text;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_processing_attempts_positive;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_processing_attempts_positive check (processing_attempts > 0);

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260815010000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
