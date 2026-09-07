BEGIN;
-- Additive, staff-only optimization. No existing function, source row or review is replaced.
DO $$ BEGIN
 IF to_regnamespace('rr_staff_answers') IS NULL THEN RAISE EXCEPTION 'Initialize private staff storage first'; END IF;
 IF to_regclass('rr_staff_answers.knowledge_revision') IS NOT NULL THEN RAISE EXCEPTION 'Speed storage exists; preserve it'; END IF;
END $$;
LOCK TABLE rr_pilot_20260906.driver_help_knowledge_records IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE rr_staff_answers.knowledge_revision (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO rr_staff_answers.knowledge_revision(singleton) VALUES(true);
ALTER TABLE rr_staff_answers.knowledge_revision ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION rr_staff_answers.invalidate_knowledge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
BEGIN
 UPDATE rr_staff_answers.knowledge_revision SET version=gen_random_uuid() WHERE singleton;
 RETURN NULL;
END $$;
CREATE TRIGGER rr_staff_knowledge_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON rr_pilot_20260906.driver_help_knowledge_records FOR EACH STATEMENT
EXECUTE FUNCTION rr_staff_answers.invalidate_knowledge();

CREATE FUNCTION public.rr_staff_speed_snapshot(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
DECLARE v uuid; rows jsonb;
BEGIN
 -- The revision and rows must describe the same committed snapshot.
 LOCK TABLE rr_pilot_20260906.driver_help_knowledge_records IN SHARE MODE;
 SELECT version INTO STRICT v FROM rr_staff_answers.knowledge_revision WHERE singleton;
 IF p->>'known_version'=v::text THEN RETURN jsonb_build_object('version',v); END IF;
 SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(k,coalesce(to_jsonb(x)->k,'null'::jsonb))
  FROM unnest(ARRAY['knowledge_id','version','status','is_published','source_ids','adjudication_id','approved_by','approval_date','canonical_schema_version','canonical_situation','normalized_description','taxonomy_paths','applicability','conditions','exceptions','authoritative_rule','required_procedure','required_documentation','prohibited_actions','escalation_requirements','clarification_requirements','related_knowledge_ids','driver_question_variants','driver_question_patterns','images','concise_answer','more_info_answer']::text[]) k)), '[]'::jsonb) INTO rows
 FROM rr_pilot_20260906.driver_help_knowledge_records x;
 RETURN jsonb_build_object('version',v,'records',rows);
END $$;

CREATE FUNCTION public.rr_staff_speed_request(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
DECLARE guards jsonb; v text; expected text; ids jsonb;
BEGIN
 PERFORM rr_staff_answers.authorize(p,false);
 IF p->>'op'='prepare' AND p->'data' ? 'sourceVersion' THEN
  LOCK TABLE rr_pilot_20260906.driver_help_knowledge_records IN SHARE MODE;
  SELECT version::text INTO STRICT v FROM rr_staff_answers.knowledge_revision WHERE singleton;
  IF p->'data'->>'sourceVersion' IS DISTINCT FROM v THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
  ids=p->'data'->'sourceGuardIds';
  IF jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_SOURCE_IDS'; END IF;
  SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(k,coalesce(to_jsonb(x)->k,'null'::jsonb))
   FROM unnest(ARRAY['knowledge_id','version','status','is_published','source_ids','adjudication_id','approved_by','approval_date','canonical_schema_version','canonical_situation','normalized_description','taxonomy_paths','applicability','conditions','exceptions','authoritative_rule','required_procedure','required_documentation','prohibited_actions','escalation_requirements','clarification_requirements','related_knowledge_ids','driver_question_variants','driver_question_patterns','images','concise_answer','more_info_answer']::text[]) k)), '[]'::jsonb) INTO guards
  FROM (SELECT DISTINCT ON (z.knowledge_id) z.* FROM rr_pilot_20260906.driver_help_knowledge_records z
   WHERE z.knowledge_id IN (SELECT jsonb_array_elements_text(ids)) ORDER BY z.knowledge_id,z.version DESC) x;
  IF jsonb_array_length(guards)<>jsonb_array_length(ids) THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
  p=jsonb_set(p,'{data}',((p->'data')-'sourceGuardIds')||jsonb_build_object('sourceGuards',guards));
 ELSIF p->>'op'='commit' THEN
  SELECT prepared->>'sourceVersion' INTO expected FROM rr_staff_answers.requests
   WHERE account_id=p->>'accountId' AND actor_type=p->>'actorType' AND actor_id=p->>'actorId'
   AND request_id=p->>'requestId' AND claim_token::text=p->>'token';
  IF expected IS NOT NULL THEN
   LOCK TABLE rr_pilot_20260906.driver_help_knowledge_records IN SHARE MODE;
   SELECT version::text INTO STRICT v FROM rr_staff_answers.knowledge_revision WHERE singleton;
   IF expected IS DISTINCT FROM v THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
  END IF;
 END IF;
 -- Preserve the original durable state machine, full source guards and atomic save.
 RETURN public.rr_staff_answers_request(p);
END $$;
REVOKE ALL ON TABLE rr_staff_answers.knowledge_revision FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION rr_staff_answers.invalidate_knowledge() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rr_staff_speed_snapshot(jsonb),public.rr_staff_speed_request(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rr_staff_speed_snapshot(jsonb),public.rr_staff_speed_request(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
