begin;

-- Ready Route Answers v2 starts with an intentionally empty corpus. The v1
-- dataset and its interaction history were preserved before this migration.
delete from public.driver_help_feedback;
delete from public.driver_help_unanswered_questions;
delete from public.driver_help_interactions;
delete from public.driver_help_sessions;
delete from public.driver_help_monthly_report_deliveries;
delete from public.driver_help_knowledge_record_sources;
delete from public.driver_help_knowledge_records;
delete from public.driver_help_knowledge_sources;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260815120000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
