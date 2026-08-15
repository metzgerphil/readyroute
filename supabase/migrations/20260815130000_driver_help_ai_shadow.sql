begin;

alter table public.driver_help_interactions
  add column if not exists interpretation_mode text not null default 'DETERMINISTIC',
  add column if not exists interpretation_result jsonb not null default '{}'::jsonb;

alter table public.driver_help_interactions
  drop constraint if exists driver_help_interpretation_mode_check;

alter table public.driver_help_interactions
  add constraint driver_help_interpretation_mode_check check (
    interpretation_mode in (
      'DETERMINISTIC',
      'DETERMINISTIC_FALLBACK',
      'GROUNDED_AI',
      'AI_SHADOW',
      'AI_SHADOW_FALLBACK'
    )
  );

insert into public.readyroute_schema_state (id, version, applied_at)
values (true, '20260815130000', now())
on conflict (id) do update
set version = excluded.version,
    applied_at = excluded.applied_at;

commit;
