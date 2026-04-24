alter table public.accounts
  add column if not exists driver_starter_pin text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_driver_starter_pin_check'
  ) then
    alter table public.accounts
      add constraint accounts_driver_starter_pin_check
      check (driver_starter_pin is null or driver_starter_pin ~ '^[0-9]{4}$');
  end if;
end $$;
