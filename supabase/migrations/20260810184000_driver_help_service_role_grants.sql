grant all privileges on table public.driver_help_knowledge_sources to service_role;
grant all privileges on table public.driver_help_knowledge_records to service_role;
grant all privileges on table public.driver_help_knowledge_record_sources to service_role;
grant all privileges on table public.driver_help_sessions to service_role;
grant all privileges on table public.driver_help_interactions to service_role;
grant all privileges on table public.driver_help_feedback to service_role;
grant all privileges on table public.driver_help_unanswered_questions to service_role;
grant all privileges on table public.driver_month_activation_charges to service_role;
grant all privileges on table public.driver_authorized_devices to service_role;

grant execute on function public.readyroute_accrue_driver_month(uuid, uuid, timestamptz) to service_role;
grant execute on function public.readyroute_accrue_active_driver_month(date) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260810184000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
