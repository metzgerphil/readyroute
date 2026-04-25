create extension if not exists pgcrypto;

create or replace function public.readyroute_jwt_claims()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create or replace function public.readyroute_account_id()
returns uuid
language sql
stable
as $$
  select nullif(public.readyroute_jwt_claims() ->> 'account_id', '')::uuid;
$$;

create or replace function public.readyroute_driver_id()
returns uuid
language sql
stable
as $$
  select nullif(public.readyroute_jwt_claims() ->> 'driver_id', '')::uuid;
$$;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  fedex_csp_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  vehicle_count integer not null default 0,
  plan text not null default 'starter',
  driver_starter_pin text default '1234',
  operations_timezone text not null default 'America/Los_Angeles',
  dispatch_window_start_hour integer not null default 6,
  dispatch_window_end_hour integer not null default 11,
  manifest_sync_interval_minutes integer not null default 15,
  manager_email text unique,
  manager_password_hash text,
  created_at timestamptz not null default now(),
  constraint accounts_vehicle_count_nonnegative check (vehicle_count >= 0),
  constraint accounts_plan_check check (plan in ('starter', 'pro', 'active', 'suspended')),
  constraint accounts_driver_starter_pin_check check (driver_starter_pin is null or driver_starter_pin ~ '^[0-9]{4}$'),
  constraint accounts_dispatch_window_start_hour_check check (dispatch_window_start_hour >= 0 and dispatch_window_start_hour <= 23),
  constraint accounts_dispatch_window_end_hour_check check (dispatch_window_end_hour >= 1 and dispatch_window_end_hour <= 23),
  constraint accounts_dispatch_window_order_check check (dispatch_window_end_hour > dispatch_window_start_hour),
  constraint accounts_manifest_sync_interval_check check (manifest_sync_interval_minutes in (5, 10, 15, 20, 30, 60))
);

create table if not exists public.manager_users (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  full_name text,
  password_hash text,
  is_active boolean not null default true,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_link_codes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  code text not null unique,
  created_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_account_id uuid references public.accounts(id) on delete set null
);

create table if not exists public.fedex_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  nickname text not null,
  account_number text not null,
  billing_contact_name text,
  billing_company_name text,
  billing_address_line1 text not null,
  billing_address_line2 text,
  billing_city text not null,
  billing_state_or_province text not null,
  billing_postal_code text not null,
  billing_country_code text not null default 'US',
  connection_status text not null default 'not_started',
  connection_reference text,
  fcc_username text,
  fcc_password_encrypted text,
  fcc_password_updated_at timestamptz,
  last_verified_at timestamptz,
  is_default boolean not null default false,
  created_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  constraint fedex_accounts_connection_status_check check (
    connection_status in ('not_started', 'pending_mfa', 'connected', 'failed', 'disconnected')
  ),
  constraint fedex_accounts_account_number_length check (char_length(trim(account_number)) >= 5)
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  hourly_rate numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  pin text not null,
  created_at timestamptz not null default now(),
  constraint drivers_hourly_rate_nonnegative check (hourly_rate >= 0)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  truck_type text,
  custom_truck_type text,
  make text,
  model text,
  year integer,
  plate text,
  registration_expiration date,
  current_mileage integer not null default 0,
  last_service_date date,
  last_service_mileage integer,
  next_service_mileage integer,
  notes text,
  is_active boolean not null default true,
  constraint vehicles_current_mileage_nonnegative check (current_mileage >= 0)
);

create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  service_date date not null,
  service_type text,
  description text not null,
  condition_notes text,
  cost numeric(10, 2),
  mileage_at_service integer,
  next_service_mileage integer,
  next_service_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_maintenance_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  service_type text not null,
  is_enabled boolean not null default true,
  default_interval_miles integer,
  default_interval_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  work_area_name text not null,
  date date not null,
  status text not null default 'pending',
  dispatch_state text not null default 'staged',
  dispatched_at timestamptz,
  dispatched_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  sync_state text not null default 'sync_pending',
  last_manifest_sync_at timestamptz,
  last_manifest_change_at timestamptz,
  manifest_stop_count integer not null default 0,
  manifest_package_count integer not null default 0,
  manifest_fingerprint text,
  last_manifest_sync_error text,
  source text,
  sa_number text,
  contractor_name text,
  total_stops integer not null default 0,
  completed_stops integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  constraint routes_total_stops_nonnegative check (total_stops >= 0),
  constraint routes_completed_stops_nonnegative check (completed_stops >= 0),
  constraint routes_manifest_stop_count_nonnegative check (manifest_stop_count >= 0),
  constraint routes_manifest_package_count_nonnegative check (manifest_package_count >= 0),
  constraint routes_completed_stops_lte_total_stops check (completed_stops <= total_stops),
  constraint routes_status_check check (status in ('pending', 'ready', 'in_progress', 'complete')),
  constraint routes_dispatch_state_check check (dispatch_state in ('staged', 'dispatched')),
  constraint routes_sync_state_check check (sync_state in ('sync_pending', 'syncing', 'staged_changed', 'staged_stable', 'dispatch_blocked', 'changed_after_dispatch', 'needs_attention', 'sync_failed'))
);

create table if not exists public.route_sync_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  work_date date not null,
  event_type text not null,
  event_status text not null default 'info',
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint route_sync_events_type_check check (event_type in ('manifest_staged', 'manifest_updated', 'route_assignment_updated', 'routes_dispatched', 'post_dispatch_change', 'fcc_progress_synced')),
  constraint route_sync_events_status_check check (event_status in ('info', 'warning', 'urgent'))
);

create table if not exists public.fedex_sync_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  fedex_account_id uuid references public.fedex_accounts(id) on delete set null,
  work_date date not null,
  trigger_source text not null default 'manual',
  run_status text not null default 'queued',
  sync_window_state text,
  initiated_by_manager_user_id uuid references public.manager_users(id) on delete set null,
  manifest_count integer not null default 0,
  changed_route_count integer not null default 0,
  error_summary text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fedex_sync_runs_trigger_source_check check (trigger_source in ('manual', 'scheduled', 'progress_sync')),
  constraint fedex_sync_runs_status_check check (
    run_status in ('queued', 'running', 'completed', 'completed_with_changes', 'skipped', 'failed')
  ),
  constraint fedex_sync_runs_window_state_check check (
    sync_window_state is null or sync_window_state in ('before_window', 'active_window', 'after_window', 'historical', 'scheduled')
  ),
  constraint fedex_sync_runs_manifest_count_nonnegative check (manifest_count >= 0),
  constraint fedex_sync_runs_changed_route_count_nonnegative check (changed_route_count >= 0)
);

create table if not exists public.stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  sequence_order integer not null,
  address text not null,
  address_line2 text,
  contact_name text,
  lat numeric(10, 6),
  lng numeric(10, 6),
  status text not null default 'pending',
  is_pickup boolean not null default false,
  is_business boolean not null default false,
  has_note boolean not null default false,
  sid text,
  ready_time text,
  close_time text,
  has_time_commit boolean not null default false,
  stop_type text,
  has_pickup boolean not null default false,
  has_delivery boolean not null default true,
  geocode_source text,
  geocode_accuracy text,
  exception_code text,
  delivery_type_code text,
  signer_name text,
  signature_url text,
  age_confirmed boolean not null default false,
  pod_photo_url text,
  pod_signature_url text,
  scanned_at timestamptz,
  completed_at timestamptz,
  notes text,
  constraint stops_sequence_order_positive check (sequence_order > 0),
  constraint stops_status_check check (status in ('pending', 'delivered', 'complete'))
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.stops(id) on delete cascade,
  tracking_number text not null,
  weight numeric(10, 2),
  requires_signature boolean not null default false,
  hazmat boolean not null default false,
  constraint packages_weight_nonnegative check (weight is null or weight >= 0)
);

create table if not exists public.road_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lat_start numeric(10, 6),
  lng_start numeric(10, 6),
  lat_end numeric(10, 6),
  lng_end numeric(10, 6),
  flag_type text not null,
  notes text,
  created_by uuid references public.drivers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.stop_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  address_hash text not null,
  normalized_address text,
  unit_number text,
  display_address text,
  note_text text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.apartment_units (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  normalized_address text not null,
  display_address text,
  unit_number text not null,
  floor integer,
  confidence text not null default 'low',
  source text not null default 'predicted',
  verified boolean not null default false,
  confirmation_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apartment_units_floor_positive check (floor is null or floor > 0),
  constraint apartment_units_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint apartment_units_source_check check (source in ('predicted', 'pattern', 'verified'))
);

create table if not exists public.location_corrections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  normalized_address text not null,
  unit_number text,
  display_address text,
  corrected_lat numeric(10, 6) not null,
  corrected_lng numeric(10, 6) not null,
  source text not null default 'driver_verified',
  label text,
  updated_by_driver_id uuid references public.drivers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_corrections_source_check check (source in ('driver_verified', 'manager_verified'))
);

create table if not exists public.property_intel (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  normalized_address text not null,
  display_address text,
  property_name text,
  property_type text,
  building text,
  access_note text,
  parking_note text,
  entry_note text,
  business_hours text,
  shared_note text,
  warning_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vedr_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text,
  provider_login_url text,
  provider_username_hint text,
  connection_status text not null default 'not_started',
  provider_selected_at timestamptz,
  connection_started_at timestamptz,
  connection_verified_at timestamptz,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vedr_settings_provider_check check (provider in ('groundcloud', 'velocitor') or provider is null),
  constraint vedr_settings_connection_status_check check (connection_status in ('not_started', 'provider_selected', 'waiting_for_login', 'connected'))
);

create table if not exists public.timecards (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  clock_in timestamptz,
  clock_out timestamptz,
  hours_worked numeric(10, 2),
  manager_adjusted boolean not null default false,
  constraint timecards_hours_worked_nonnegative check (hours_worked is null or hours_worked >= 0)
);

create table if not exists public.timecard_breaks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  timecard_id uuid not null references public.timecards(id) on delete cascade,
  break_type text not null default 'rest',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.daily_labor_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  work_date date not null,
  finalized_at timestamptz not null default now(),
  finalized_by_system boolean not null default true,
  driver_count integer not null default 0,
  shift_count integer not null default 0,
  total_worked_hours numeric(10, 2) not null default 0,
  total_payable_hours numeric(10, 2) not null default 0,
  total_break_minutes integer not null default 0,
  total_lunch_minutes integer not null default 0,
  estimated_payroll numeric(10, 2) not null default 0
);

create table if not exists public.daily_driver_labor (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.daily_labor_snapshots(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  work_date date not null,
  hourly_rate numeric(10, 2) not null default 0,
  shift_count integer not null default 0,
  worked_hours numeric(10, 2) not null default 0,
  payable_hours numeric(10, 2) not null default 0,
  break_minutes integer not null default 0,
  lunch_minutes integer not null default 0,
  estimated_pay numeric(10, 2) not null default 0
);

create table if not exists public.labor_adjustments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  manager_user_id uuid references public.manager_users(id) on delete set null,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_id uuid references public.routes(id) on delete set null,
  timecard_id uuid references public.timecards(id) on delete set null,
  work_date date not null,
  adjustment_reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_positions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  lat numeric(10, 6) not null,
  lng numeric(10, 6) not null,
  timestamp timestamptz not null default now(),
  is_online boolean not null default true
);

-- compatibility migrations for existing projects
alter table public.accounts add column if not exists manager_email text;
alter table public.accounts add column if not exists manager_password_hash text;
alter table public.accounts add column if not exists stripe_subscription_id text;
alter table public.accounts add column if not exists subscription_status text;
alter table public.accounts add column if not exists vehicle_count integer not null default 0;
alter table public.accounts add column if not exists driver_starter_pin text default '1234';
alter table public.accounts add column if not exists operations_timezone text not null default 'America/Los_Angeles';
alter table public.accounts add column if not exists dispatch_window_start_hour integer not null default 6;
alter table public.accounts add column if not exists dispatch_window_end_hour integer not null default 11;
alter table public.accounts add column if not exists manifest_sync_interval_minutes integer not null default 15;

update public.accounts
set driver_starter_pin = '1234'
where driver_starter_pin is null;
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

alter table public.routes add column if not exists work_area_name text;
alter table public.routes add column if not exists created_at timestamptz not null default now();
alter table public.routes add column if not exists sa_number text;
alter table public.routes add column if not exists contractor_name text;
alter table public.routes add column if not exists total_stops integer not null default 0;
alter table public.routes add column if not exists completed_stops integer not null default 0;
alter table public.routes add column if not exists started_at timestamptz;
alter table public.routes add column if not exists completed_at timestamptz;
alter table public.routes add column if not exists archived_at timestamptz;
alter table public.routes add column if not exists archived_reason text;

alter table public.stops add column if not exists address_line2 text;
alter table public.stops add column if not exists contact_name text;
alter table public.stops add column if not exists is_pickup boolean not null default false;
alter table public.stops add column if not exists is_business boolean not null default false;
alter table public.stops add column if not exists has_note boolean not null default false;
alter table public.stops add column if not exists sid text;
alter table public.stops add column if not exists ready_time text;
alter table public.stops add column if not exists close_time text;
alter table public.stops add column if not exists has_time_commit boolean not null default false;
alter table public.stops add column if not exists stop_type text;
alter table public.stops add column if not exists has_pickup boolean not null default false;
alter table public.stops add column if not exists has_delivery boolean not null default true;
alter table public.stops add column if not exists geocode_source text;
alter table public.stops add column if not exists geocode_accuracy text;
alter table public.stops add column if not exists delivery_type_code text;
alter table public.stops add column if not exists signer_name text;
alter table public.stops add column if not exists signature_url text;
alter table public.stops add column if not exists age_confirmed boolean not null default false;
alter table public.stops add column if not exists pod_photo_url text;
alter table public.stops add column if not exists pod_signature_url text;
alter table public.stops add column if not exists scanned_at timestamptz;
alter table public.stops add column if not exists completed_at timestamptz;
alter table public.stops add column if not exists notes text;

alter table public.road_rules add column if not exists created_by uuid references public.drivers(id) on delete cascade;

alter table public.stop_notes add column if not exists updated_at timestamptz not null default now();
alter table public.stop_notes add column if not exists normalized_address text;
alter table public.stop_notes add column if not exists unit_number text;
alter table public.stop_notes add column if not exists display_address text;
alter table public.apartment_units add column if not exists display_address text;
alter table public.apartment_units add column if not exists floor integer;
alter table public.apartment_units add column if not exists confidence text not null default 'low';
alter table public.apartment_units add column if not exists source text not null default 'predicted';
alter table public.apartment_units add column if not exists verified boolean not null default false;
alter table public.apartment_units add column if not exists confirmation_count integer not null default 0;
alter table public.apartment_units add column if not exists created_at timestamptz not null default now();
alter table public.apartment_units add column if not exists updated_at timestamptz not null default now();
alter table public.location_corrections add column if not exists unit_number text;
alter table public.location_corrections add column if not exists display_address text;
alter table public.location_corrections add column if not exists corrected_lat numeric(10, 6);
alter table public.location_corrections add column if not exists corrected_lng numeric(10, 6);
alter table public.location_corrections add column if not exists source text not null default 'driver_verified';
alter table public.location_corrections add column if not exists label text;
alter table public.location_corrections add column if not exists updated_by_driver_id uuid references public.drivers(id) on delete set null;
alter table public.location_corrections add column if not exists created_at timestamptz not null default now();
alter table public.location_corrections add column if not exists updated_at timestamptz not null default now();
alter table public.property_intel add column if not exists display_address text;
alter table public.property_intel add column if not exists property_name text;
alter table public.property_intel add column if not exists property_type text;
alter table public.property_intel add column if not exists building text;
alter table public.property_intel add column if not exists access_note text;
alter table public.property_intel add column if not exists parking_note text;
alter table public.property_intel add column if not exists entry_note text;
alter table public.property_intel add column if not exists business_hours text;
alter table public.property_intel add column if not exists shared_note text;
alter table public.property_intel add column if not exists warning_flags text[] not null default '{}';
alter table public.property_intel add column if not exists created_at timestamptz not null default now();
alter table public.property_intel add column if not exists updated_at timestamptz not null default now();
alter table public.vedr_settings add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.vedr_settings add column if not exists provider text;
alter table public.vedr_settings add column if not exists provider_login_url text;
alter table public.vedr_settings add column if not exists provider_username_hint text;
alter table public.vedr_settings add column if not exists connection_status text not null default 'not_started';
alter table public.vedr_settings add column if not exists provider_selected_at timestamptz;
alter table public.vedr_settings add column if not exists connection_started_at timestamptz;
alter table public.vedr_settings add column if not exists connection_verified_at timestamptz;
alter table public.vedr_settings add column if not exists setup_completed_at timestamptz;
alter table public.vedr_settings add column if not exists created_at timestamptz not null default now();
alter table public.vedr_settings add column if not exists updated_at timestamptz not null default now();

alter table public.timecards add column if not exists clock_in timestamptz;
alter table public.timecards add column if not exists clock_out timestamptz;
alter table public.timecards add column if not exists hours_worked numeric(10, 2);
alter table public.timecards add column if not exists manager_adjusted boolean not null default false;
alter table public.timecard_breaks add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.timecard_breaks add column if not exists driver_id uuid references public.drivers(id) on delete cascade;
alter table public.timecard_breaks add column if not exists route_id uuid references public.routes(id) on delete set null;
alter table public.timecard_breaks add column if not exists timecard_id uuid references public.timecards(id) on delete cascade;
alter table public.timecard_breaks add column if not exists break_type text not null default 'rest';
alter table public.timecard_breaks add column if not exists started_at timestamptz not null default now();
alter table public.timecard_breaks add column if not exists ended_at timestamptz;
alter table public.daily_labor_snapshots add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.daily_labor_snapshots add column if not exists work_date date;
alter table public.daily_labor_snapshots add column if not exists finalized_at timestamptz not null default now();
alter table public.daily_labor_snapshots add column if not exists finalized_by_system boolean not null default true;
alter table public.daily_labor_snapshots add column if not exists driver_count integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists shift_count integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_worked_hours numeric(10, 2) not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_payable_hours numeric(10, 2) not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_break_minutes integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists total_lunch_minutes integer not null default 0;
alter table public.daily_labor_snapshots add column if not exists estimated_payroll numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists batch_id uuid references public.daily_labor_snapshots(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists driver_id uuid references public.drivers(id) on delete cascade;
alter table public.daily_driver_labor add column if not exists work_date date;
alter table public.daily_driver_labor add column if not exists hourly_rate numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists shift_count integer not null default 0;
alter table public.daily_driver_labor add column if not exists worked_hours numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists payable_hours numeric(10, 2) not null default 0;
alter table public.daily_driver_labor add column if not exists break_minutes integer not null default 0;
alter table public.daily_driver_labor add column if not exists lunch_minutes integer not null default 0;
alter table public.daily_driver_labor add column if not exists estimated_pay numeric(10, 2) not null default 0;

alter table public.driver_positions add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.driver_positions add column if not exists timestamp timestamptz not null default now();
alter table public.driver_positions add column if not exists is_online boolean not null default true;
alter table public.vehicles add column if not exists last_service_date date;
alter table public.vehicles add column if not exists last_service_mileage integer;
alter table public.vehicles add column if not exists next_service_mileage integer;
alter table public.vehicles add column if not exists notes text;
alter table public.vehicles add column if not exists is_active boolean not null default true;

create index if not exists drivers_account_id_idx on public.drivers(account_id);
create index if not exists vehicles_account_id_idx on public.vehicles(account_id);
create index if not exists vehicle_maintenance_vehicle_id_idx on public.vehicle_maintenance(vehicle_id);
create index if not exists vehicle_maintenance_account_id_idx on public.vehicle_maintenance(account_id);
create index if not exists vehicle_maintenance_service_date_idx on public.vehicle_maintenance(service_date desc);
create index if not exists manager_users_account_id_idx on public.manager_users(account_id);
alter table public.manager_users drop constraint if exists manager_users_email_key;
drop index if exists public.manager_users_email_uidx;
drop index if exists public.manager_users_lower_email_uidx;
create unique index if not exists manager_users_account_email_uidx on public.manager_users(account_id, lower(email));
create index if not exists account_link_codes_account_id_idx on public.account_link_codes(account_id);
create index if not exists account_link_codes_expires_at_idx on public.account_link_codes(expires_at desc);
create index if not exists fedex_accounts_account_id_idx on public.fedex_accounts(account_id);
create index if not exists fedex_accounts_status_idx on public.fedex_accounts(account_id, connection_status);
create unique index if not exists fedex_accounts_default_uidx on public.fedex_accounts(account_id) where is_default = true and disconnected_at is null;
create unique index if not exists fedex_accounts_account_number_uidx on public.fedex_accounts(account_id, account_number) where disconnected_at is null;
create index if not exists routes_account_id_idx on public.routes(account_id);
create index if not exists routes_driver_id_idx on public.routes(driver_id);
create index if not exists routes_vehicle_id_idx on public.routes(vehicle_id);
create index if not exists routes_date_idx on public.routes(date);
create index if not exists routes_work_area_name_idx on public.routes(work_area_name);
create index if not exists routes_archived_at_idx on public.routes(archived_at);
create unique index if not exists routes_work_area_date_account on public.routes(account_id, work_area_name, date) where archived_at is null;
create index if not exists stops_route_id_idx on public.stops(route_id);
create index if not exists stops_status_idx on public.stops(status);
create index if not exists packages_stop_id_idx on public.packages(stop_id);
create index if not exists road_rules_account_id_idx on public.road_rules(account_id);
create index if not exists road_rules_created_by_idx on public.road_rules(created_by);
create index if not exists stop_notes_account_id_idx on public.stop_notes(account_id);
create index if not exists stop_notes_address_hash_idx on public.stop_notes(address_hash);
create index if not exists stop_notes_normalized_address_idx on public.stop_notes(normalized_address);
create unique index if not exists stop_notes_account_address_hash_uidx on public.stop_notes(account_id, address_hash);
create unique index if not exists stop_notes_account_address_unit_uidx on public.stop_notes(account_id, normalized_address, coalesce(unit_number, ''));
create index if not exists apartment_units_account_id_idx on public.apartment_units(account_id);
create index if not exists apartment_units_normalized_address_idx on public.apartment_units(normalized_address);
create unique index if not exists apartment_units_account_address_unit_uidx on public.apartment_units(account_id, normalized_address, unit_number);
create index if not exists location_corrections_account_id_idx on public.location_corrections(account_id);
create index if not exists location_corrections_normalized_address_idx on public.location_corrections(normalized_address);
create unique index if not exists location_corrections_account_address_unit_uidx on public.location_corrections(account_id, normalized_address, coalesce(unit_number, ''));
create index if not exists property_intel_account_id_idx on public.property_intel(account_id);
create index if not exists property_intel_normalized_address_idx on public.property_intel(normalized_address);
create unique index if not exists property_intel_account_address_uidx on public.property_intel(account_id, normalized_address);
create unique index if not exists vedr_settings_account_id_uidx on public.vedr_settings(account_id);
create index if not exists timecards_driver_id_idx on public.timecards(driver_id);
create index if not exists timecard_breaks_timecard_id_idx on public.timecard_breaks(timecard_id);
create index if not exists timecard_breaks_driver_id_idx on public.timecard_breaks(driver_id);
create index if not exists timecard_breaks_started_at_idx on public.timecard_breaks(started_at desc);
create index if not exists daily_labor_snapshots_account_date_idx on public.daily_labor_snapshots(account_id, work_date desc);
create unique index if not exists daily_labor_snapshots_account_date_uidx on public.daily_labor_snapshots(account_id, work_date);
create index if not exists route_sync_events_route_created_idx on public.route_sync_events(route_id, created_at desc);
create index if not exists route_sync_events_account_work_date_idx on public.route_sync_events(account_id, work_date desc, created_at desc);
create index if not exists fedex_sync_runs_account_work_date_idx on public.fedex_sync_runs(account_id, work_date desc, created_at desc);
create index if not exists fedex_sync_runs_status_idx on public.fedex_sync_runs(run_status, created_at desc);
create index if not exists daily_driver_labor_batch_id_idx on public.daily_driver_labor(batch_id);
create unique index if not exists daily_driver_labor_batch_driver_uidx on public.daily_driver_labor(batch_id, driver_id);
create index if not exists labor_adjustments_account_date_idx on public.labor_adjustments(account_id, work_date desc);
create index if not exists labor_adjustments_driver_id_idx on public.labor_adjustments(driver_id, created_at desc);
create index if not exists timecards_route_id_idx on public.timecards(route_id);
create index if not exists driver_positions_driver_id_idx on public.driver_positions(driver_id);
create index if not exists driver_positions_route_id_idx on public.driver_positions(route_id);
create index if not exists driver_positions_account_id_idx on public.driver_positions(account_id);
create index if not exists driver_positions_timestamp_idx on public.driver_positions(timestamp);

alter table public.accounts enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_maintenance enable row level security;
alter table public.routes enable row level security;
alter table public.stops enable row level security;
alter table public.packages enable row level security;
alter table public.road_rules enable row level security;
alter table public.stop_notes enable row level security;
alter table public.property_intel enable row level security;
alter table public.vedr_settings enable row level security;
alter table public.fedex_accounts enable row level security;
alter table public.fedex_accounts add column if not exists fcc_username text;
alter table public.fedex_accounts add column if not exists fcc_password_encrypted text;
alter table public.fedex_accounts add column if not exists fcc_password_updated_at timestamptz;
alter table public.fedex_sync_runs enable row level security;
alter table public.timecards enable row level security;
alter table public.driver_positions enable row level security;

drop policy if exists accounts_by_account on public.accounts;
create policy accounts_by_account
on public.accounts
for all
using (id = public.readyroute_account_id())
with check (id = public.readyroute_account_id());

drop policy if exists drivers_by_account on public.drivers;
create policy drivers_by_account
on public.drivers
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists vehicles_by_account on public.vehicles;
create policy vehicles_by_account
on public.vehicles
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists vehicle_maintenance_by_account on public.vehicle_maintenance;
create policy vehicle_maintenance_by_account
on public.vehicle_maintenance
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists routes_by_account on public.routes;
create policy routes_by_account
on public.routes
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists stops_by_account on public.stops;
create policy stops_by_account
on public.stops
for all
using (
  exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.account_id = public.readyroute_account_id()
  )
)
with check (
  exists (
    select 1
    from public.routes
    where routes.id = stops.route_id
      and routes.account_id = public.readyroute_account_id()
  )
);

drop policy if exists packages_by_account on public.packages;
create policy packages_by_account
on public.packages
for all
using (
  exists (
    select 1
    from public.stops
    join public.routes on routes.id = stops.route_id
    where stops.id = packages.stop_id
      and routes.account_id = public.readyroute_account_id()
  )
)
with check (
  exists (
    select 1
    from public.stops
    join public.routes on routes.id = stops.route_id
    where stops.id = packages.stop_id
      and routes.account_id = public.readyroute_account_id()
  )
);

drop policy if exists road_rules_by_account on public.road_rules;
create policy road_rules_by_account
on public.road_rules
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists stop_notes_by_account on public.stop_notes;
create policy stop_notes_by_account
on public.stop_notes
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists property_intel_by_account on public.property_intel;
create policy property_intel_by_account
on public.property_intel
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists vedr_settings_by_account on public.vedr_settings;
create policy vedr_settings_by_account
on public.vedr_settings
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists fedex_accounts_by_account on public.fedex_accounts;
create policy fedex_accounts_by_account
on public.fedex_accounts
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists fedex_sync_runs_by_account on public.fedex_sync_runs;
create policy fedex_sync_runs_by_account
on public.fedex_sync_runs
for all
using (account_id = public.readyroute_account_id())
with check (account_id = public.readyroute_account_id());

drop policy if exists timecards_by_account on public.timecards;
create policy timecards_by_account
on public.timecards
for all
using (
  exists (
    select 1
    from public.routes
    where routes.id = timecards.route_id
      and routes.account_id = public.readyroute_account_id()
  )
)
with check (
  exists (
    select 1
    from public.routes
    where routes.id = timecards.route_id
      and routes.account_id = public.readyroute_account_id()
  )
);

drop policy if exists driver_positions_by_account on public.driver_positions;
create policy driver_positions_by_account
on public.driver_positions
for all
using (
  coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid) = public.readyroute_account_id()
  or exists (
    select 1
    from public.routes
    where routes.id = driver_positions.route_id
      and routes.account_id = public.readyroute_account_id()
  )
)
with check (
  coalesce(account_id, public.readyroute_account_id()) = public.readyroute_account_id()
  and exists (
    select 1
    from public.routes
    where routes.id = driver_positions.route_id
      and routes.account_id = public.readyroute_account_id()
  )
);
