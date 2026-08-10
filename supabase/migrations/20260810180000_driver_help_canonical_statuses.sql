alter table public.driver_help_knowledge_records
  drop constraint if exists driver_help_knowledge_publish_check;

alter table public.driver_help_knowledge_records
  drop constraint if exists driver_help_knowledge_status_check;

update public.driver_help_knowledge_records
set status = case status
  when 'VERIFIED' then 'SOURCE_VERIFIED'
  when 'UNRESOLVED' then 'INSUFFICIENT_EVIDENCE'
  when 'CONFLICT' then 'PENDING_REVIEW'
  when 'HUMAN_REVIEW_REQUIRED' then 'PENDING_REVIEW'
  else status
end;

alter table public.driver_help_knowledge_records
  add column if not exists source_ids text[] not null default '{}'::text[],
  add column if not exists adjudication_id text,
  add column if not exists approved_by text,
  add column if not exists approval_date date,
  add column if not exists source_research_status text,
  add column if not exists canonical_schema_version text;

alter table public.driver_help_knowledge_records
  add constraint driver_help_knowledge_status_check check (
    status in (
      'SOURCE_VERIFIED',
      'READY_ROUTE_APPROVED',
      'PENDING_REVIEW',
      'POTENTIALLY_OUTDATED',
      'INSUFFICIENT_EVIDENCE'
    )
  ),
  add constraint driver_help_knowledge_publish_check check (
    is_published = false or status in ('SOURCE_VERIFIED', 'READY_ROUTE_APPROVED')
  );

alter table public.driver_help_interactions
  add column if not exists canonical_trace jsonb not null default '[]'::jsonb,
  add column if not exists escalation_details jsonb not null default '[]'::jsonb,
  add column if not exists response_latency_ms integer;

alter table public.driver_help_interactions
  add constraint driver_help_interaction_latency_check check (
    response_latency_ms is null or response_latency_ms >= 0
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260810180000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;
