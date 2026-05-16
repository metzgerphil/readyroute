alter table public.early_access_signups
  add column if not exists email_sent boolean not null default false,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text,
  add column if not exists resend_email_id text,
  add column if not exists thank_you_email_attempts integer not null default 0,
  add column if not exists last_email_attempt_at timestamptz;

alter table public.early_access_signups
  drop constraint if exists early_access_signups_email_attempts_nonnegative;

alter table public.early_access_signups
  add constraint early_access_signups_email_attempts_nonnegative
  check (thank_you_email_attempts >= 0);

create index if not exists early_access_signups_email_idx
  on public.early_access_signups (email);

create unique index if not exists early_access_signups_lower_email_uidx
  on public.early_access_signups (lower(email));
