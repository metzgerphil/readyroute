alter table public.accounts
  alter column driver_starter_pin set default '1234';

update public.accounts
set driver_starter_pin = '1234'
where driver_starter_pin is null;
