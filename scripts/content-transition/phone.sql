BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.rr_content_transition_20260909(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE before_state jsonb; after_state jsonb; row_data jsonb; originals jsonb; current_originals jsonb; existing jsonb; inserted integer:=0;
BEGIN
 LOCK TABLE public.driver_help_knowledge_records IN SHARE ROW EXCLUSIVE MODE;
 IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rows')<>2 THEN RAISE EXCEPTION 'EXACT_TWO_ROWS_REQUIRED'; END IF;
 IF (SELECT array_agg(x->>'knowledge_id' ORDER BY x->>'knowledge_id') FROM jsonb_array_elements(p->'rows') x) <> ARRAY['KNO-DEL-SIGNATURE-WAIT-001','KNO-SEC-LOST-BADGE-001'] THEN RAISE EXCEPTION 'UNAUTHORIZED_SCOPE'; END IF;
 before_state=public.rr_driver_v2_snapshot('{"known_version":null}'::jsonb);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) INTO originals FROM public.driver_help_knowledge_records x;
 FOR row_data IN SELECT value FROM jsonb_array_elements(p->'rows') LOOP
  IF row_data->>'version' IS DISTINCT FROM '2' OR row_data->>'status' IS DISTINCT FROM 'READY_ROUTE_APPROVED' OR row_data->>'is_published' IS DISTINCT FROM 'true' OR coalesce(row_data->>'adjudication_id','') NOT LIKE 'ADJ-20260908-VLAD-STAFF-%' THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.driver_help_knowledge_records x WHERE x.knowledge_id=row_data->>'knowledge_id' AND x.version>2) THEN RAISE EXCEPTION 'NEWER_SOURCE_EXISTS'; END IF;
  SELECT jsonb_agg(x) INTO existing FROM jsonb_array_elements(before_state->'records') x WHERE x->>'knowledge_id'=row_data->>'knowledge_id' AND x->>'version'='2';
  IF existing IS NOT NULL THEN
   IF jsonb_array_length(existing)<>1 OR existing->0 IS DISTINCT FROM row_data THEN RAISE EXCEPTION 'EXISTING_SUCCESSOR_CONFLICT'; END IF;
  ELSE
   IF before_state->>'version' IS DISTINCT FROM p->>'expected_version' THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
   IF (SELECT count(*) FROM public.driver_help_knowledge_records x WHERE x.knowledge_id=row_data->>'knowledge_id' AND x.version=1)<>1 THEN RAISE EXCEPTION 'PREDECESSOR_REQUIRED'; END IF;
   INSERT INTO public.driver_help_knowledge_records ("knowledge_id","version","status","is_published","source_ids","adjudication_id","approved_by","approval_date","canonical_schema_version","canonical_situation","normalized_description","taxonomy_paths","applicability","conditions","exceptions","authoritative_rule","required_procedure","required_documentation","prohibited_actions","escalation_requirements","clarification_requirements","related_knowledge_ids","driver_question_variants","driver_question_patterns","images","concise_answer","more_info_answer") SELECT r."knowledge_id",r."version",r."status",r."is_published",r."source_ids",r."adjudication_id",r."approved_by",r."approval_date",r."canonical_schema_version",r."canonical_situation",r."normalized_description",r."taxonomy_paths",r."applicability",r."conditions",r."exceptions",r."authoritative_rule",r."required_procedure",r."required_documentation",r."prohibited_actions",r."escalation_requirements",r."clarification_requirements",r."related_knowledge_ids",r."driver_question_variants",r."driver_question_patterns",r."images",r."concise_answer",r."more_info_answer" FROM jsonb_populate_record(NULL::public.driver_help_knowledge_records,row_data) r;
   inserted=inserted+1;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) INTO current_originals FROM public.driver_help_knowledge_records x
 WHERE NOT (x.knowledge_id IN ('KNO-DEL-SIGNATURE-WAIT-001','KNO-SEC-LOST-BADGE-001') AND x.version=2);
 IF current_originals IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]'::jsonb) FROM jsonb_array_elements(originals) x WHERE NOT (x->>'knowledge_id' IN ('KNO-DEL-SIGNATURE-WAIT-001','KNO-SEC-LOST-BADGE-001') AND x->>'version'='2')) THEN RAISE EXCEPTION 'ORIGINAL_HISTORY_CHANGED'; END IF;
 after_state=public.rr_driver_v2_snapshot('{"known_version":null}'::jsonb);
 RETURN jsonb_build_object('inserted',inserted,'rows',jsonb_array_length(after_state->'records'),'version',after_state->>'version','originals_preserved',true);
END $fn$;
REVOKE ALL ON FUNCTION public.rr_content_transition_20260909(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rr_content_transition_20260909(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
