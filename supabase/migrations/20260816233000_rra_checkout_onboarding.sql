alter table public.early_access_signups
  add column if not exists stripe_checkout_session_id text,
  add column if not exists onboarding_status text not null default 'pending_payment',
  add column if not exists onboarding_invite_sent_at timestamptz,
  add column if not exists onboarding_email_provider_id text,
  add column if not exists onboarding_error text;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_onboarding_status_check;

alter table public.early_access_signups
  add constraint early_access_signups_onboarding_status_check check (
    onboarding_status in ('pending_payment', 'payment_complete', 'provisioned', 'email_sent', 'email_failed')
  );

create unique index if not exists early_access_signups_checkout_session_uidx
  on public.early_access_signups (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

alter table public.accounts
  drop constraint if exists accounts_manager_email_key;

create index if not exists accounts_manager_email_idx
  on public.accounts (lower(manager_email));

create unique index if not exists accounts_stripe_customer_uidx
  on public.accounts (stripe_customer_id)
  where stripe_customer_id is not null;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816233000', now())
on conflict (id) do update
set version = excluded.version, applied_at = excluded.applied_at;
