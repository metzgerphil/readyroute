BEGIN;
-- Additive workflow. Original reviews, answers, approvals and AI ledger stay intact.
CREATE TABLE IF NOT EXISTS rr_staff_answers.review_events (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES rr_staff_answers.reviews(id),
 actor jsonb NOT NULL, status text NOT NULL CHECK(status IN
 ('IN_REVIEW','NEEDS_CLARIFICATION','FIXED_TESTED','READY_TO_RETEST','VERIFIED','REOPENED')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 5000),
 evidence text NOT NULL DEFAULT '', release text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(status NOT IN ('FIXED_TESTED','READY_TO_RETEST','VERIFIED') OR (length(btrim(evidence))>0 AND length(btrim(release))>0))
);
CREATE INDEX IF NOT EXISTS review_events_by_review ON rr_staff_answers.review_events(review_id,created_at,id);
ALTER TABLE rr_staff_answers.review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rr_staff_answers.review_events FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rr_staff_review_queue(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
DECLARE result jsonb; previous rr_staff_answers.review_events%ROWTYPE;
BEGIN
 -- The service supplies identity after authentication; only service_role can call.
 IF nullif(p->>'staff_id','') IS NULL THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 IF p->>'op'='list' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at DESC,id DESC) FROM (
   SELECT r.*,i.record->>'question' AS question,i.record AS interaction,
    (SELECT q.response FROM rr_staff_answers.requests q WHERE q.actor_id=r.staff_id AND q.response->>'interaction_id'=r.case_id LIMIT 1) AS response,
    coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM rr_staff_answers.review_events e WHERE e.review_id=r.id),'[]'::jsonb) AS events
   FROM rr_staff_answers.reviews r LEFT JOIN rr_staff_answers.interactions i ON i.id::text=r.case_id AND i.actor_id=r.staff_id AND r.kind='live'
   WHERE (r.staff_id=p->>'staff_id' OR p->>'staff_role' IN ('owner','admin','review_operator'))
    AND (p->>'before' IS NULL OR (r.created_at,r.id)<((p->>'before')::timestamptz,(p->>'before_id')::uuid))
   ORDER BY r.created_at DESC,r.id DESC LIMIT 100
  ) x),'[]'::jsonb);
 ELSIF p->>'op'='event' THEN
  IF coalesce(p->>'staff_role','') NOT IN ('owner','admin','review_operator') THEN RAISE EXCEPTION 'REVIEW_MANAGEMENT_REQUIRED'; END IF;
  IF jsonb_typeof(p->'actor') IS DISTINCT FROM 'object' OR nullif(p->'actor'->>'name','') IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  -- Idempotent retries must not alter or impersonate a previously recorded event.
  INSERT INTO rr_staff_answers.review_events(id,review_id,actor,status,note,evidence,release)
   VALUES((p->>'id')::uuid,(p->>'review_id')::uuid,p->'actor',p->>'status',p->>'note',coalesce(p->>'evidence',''),coalesce(p->>'release','')) ON CONFLICT DO NOTHING;
  SELECT * INTO previous FROM rr_staff_answers.review_events WHERE id=(p->>'id')::uuid;
  IF previous.review_id IS DISTINCT FROM (p->>'review_id')::uuid OR previous.actor IS DISTINCT FROM p->'actor'
   OR previous.status IS DISTINCT FROM p->>'status' OR previous.note IS DISTINCT FROM p->>'note'
   OR previous.evidence IS DISTINCT FROM coalesce(p->>'evidence','') OR previous.release IS DISTINCT FROM coalesce(p->>'release','')
   THEN RAISE EXCEPTION 'EVENT_ID_REUSED'; END IF;
  RETURN to_jsonb(previous);
 END IF;
 RAISE EXCEPTION 'INVALID_REVIEW_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.rr_staff_review_queue(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rr_staff_review_queue(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
