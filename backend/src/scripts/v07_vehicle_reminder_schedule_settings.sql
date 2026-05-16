alter table public.vehicle_check_requirement_settings
  add column if not exists maintenance_warning_miles integer not null default 1000,
  add column if not exists maintenance_warning_days integer not null default 14,
  add column if not exists document_warning_days integer not null default 30;

alter table public.vehicle_check_requirement_settings
  drop constraint if exists vehicle_check_requirement_warning_miles_check,
  add constraint vehicle_check_requirement_warning_miles_check
    check (maintenance_warning_miles >= 0);

alter table public.vehicle_check_requirement_settings
  drop constraint if exists vehicle_check_requirement_warning_days_check,
  add constraint vehicle_check_requirement_warning_days_check
    check (maintenance_warning_days >= 0);

alter table public.vehicle_check_requirement_settings
  drop constraint if exists vehicle_check_requirement_document_warning_days_check,
  add constraint vehicle_check_requirement_document_warning_days_check
    check (document_warning_days >= 0);
