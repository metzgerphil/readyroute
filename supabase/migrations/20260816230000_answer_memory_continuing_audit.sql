begin;

alter table public.driver_help_answer_memory
  add column if not exists audit_count integer not null default 0,
  add column if not exists audit_agreement_count integer not null default 0,
  add column if not exists audit_disagreement_count integer not null default 0,
  add column if not exists audit_error_count integer not null default 0,
  add column if not exists last_audited_at timestamptz;

alter table public.driver_help_answer_memory
  drop constraint if exists driver_help_answer_memory_audit_counts_check;
alter table public.driver_help_answer_memory
  add constraint driver_help_answer_memory_audit_counts_check check (
    audit_count >= 0
    and audit_agreement_count >= 0
    and audit_disagreement_count >= 0
    and audit_error_count >= 0
    and audit_count = audit_agreement_count + audit_disagreement_count + audit_error_count
  );

create or replace function public.record_driver_help_answer_memory_audit(
  p_route_key text,
  p_outcome text
) returns public.driver_help_answer_memory
language plpgsql
security definer
set search_path = public
as $$
declare
  audited_row public.driver_help_answer_memory;
begin
  if p_outcome not in ('AGREE', 'DISAGREE', 'ERROR') then
    raise exception 'Unsupported answer-memory audit outcome';
  end if;

  update public.driver_help_answer_memory
  set audit_count = audit_count + 1,
      audit_agreement_count = audit_agreement_count + case when p_outcome = 'AGREE' then 1 else 0 end,
      audit_disagreement_count = audit_disagreement_count + case when p_outcome = 'DISAGREE' then 1 else 0 end,
      audit_error_count = audit_error_count + case when p_outcome = 'ERROR' then 1 else 0 end,
      disagreement_count = disagreement_count + case when p_outcome = 'DISAGREE' then 1 else 0 end,
      status = case when p_outcome = 'DISAGREE' then 'SUSPENDED' else status end,
      last_audited_at = now(),
      updated_at = now()
  where route_key = p_route_key
  returning * into audited_row;

  return audited_row;
end;
$$;

revoke all on function public.record_driver_help_answer_memory_audit(text, text) from public;
grant execute on function public.record_driver_help_answer_memory_audit(text, text) to service_role;

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260816230000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
