-- Remove legacy FCC/MyBizAccount credentials from ReadyRoute.
-- Safe to run multiple times.
update public.fedex_accounts
set
  fcc_username = null,
  fcc_password_encrypted = null,
  fcc_password_updated_at = null,
  updated_at = now()
where fcc_username is not null
   or fcc_password_encrypted is not null
   or fcc_password_updated_at is not null;
