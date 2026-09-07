BEGIN;
DO $$ BEGIN IF to_regnamespace('rr_staff_answers') IS NOT NULL THEN RAISE EXCEPTION 'Staff testing already exists; do not overwrite'; END IF; END $$;
-- Private candidate storage only. Apply to a disposable/local database first.
-- This does not modify the released sessions, interactions, feedback or corpus.
CREATE SCHEMA IF NOT EXISTS rr_staff_answers;
REVOKE ALL ON SCHEMA rr_staff_answers FROM PUBLIC;
CREATE TABLE IF NOT EXISTS rr_staff_answers.requests (
 account_id text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL,
 request_id text NOT NULL, body_hash text NOT NULL, fingerprint text NOT NULL,
 session_id uuid NOT NULL, expected_revision integer NOT NULL DEFAULT 0,
 state text NOT NULL CHECK(state IN ('RUNNING','PREPARED','COMPLETE','UNCERTAIN','ABANDONED')),
 claim_token uuid NOT NULL, lease_until timestamptz NOT NULL,
 provider_started boolean NOT NULL DEFAULT false, prepared jsonb, response jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(account_id,actor_type,actor_id,request_id)
);
CREATE TABLE IF NOT EXISTS rr_staff_answers.sessions (
 id uuid PRIMARY KEY, account_id text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL,
 revision integer NOT NULL, context jsonb NOT NULL, last_interaction_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS rr_staff_answers.interactions (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES rr_staff_answers.sessions(id),
 account_id text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL,
 record jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS rr_staff_answers.feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), interaction_id uuid NOT NULL REFERENCES rr_staff_answers.interactions(id),
 account_id text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL,
 rating text NOT NULL CHECK(rating IN ('up','down')), reason text, comment text,
 review_status text NOT NULL DEFAULT 'PENDING_REVIEW', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Keep reports append-only: new feedback never rewrites prior evidence.

CREATE TABLE rr_staff_answers.leases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id text NOT NULL, staff_role text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds'
);
CREATE OR REPLACE FUNCTION rr_staff_answers.authorize(p jsonb, needs_ai boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,rr_staff_answers AS $$
BEGIN
 IF p->>'accountId' IS DISTINCT FROM 'staff-test' OR p->>'actorType' IS DISTINCT FROM 'manager'
 OR p->>'authSubjectType' IS DISTINCT FROM 'readyroute_staff'
 OR NOT EXISTS(SELECT 1 FROM rr_staff_answers.leases WHERE id::text=p->>'authVersion'
   AND staff_id=p->>'actorId' AND staff_role IN ('owner','admin','support') AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'ACTOR_UNAVAILABLE'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rr_staff_answers_request(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
DECLARE r rr_staff_answers.requests%ROWTYPE; s rr_staff_answers.sessions%ROWTYPE;
 op text=p->>'op'; token uuid; sid uuid; rev integer=0; data jsonb; g jsonb; actual jsonb; i jsonb;
BEGIN
 PERFORM rr_staff_answers.authorize(p,false);
 IF op='feedback' THEN
  SELECT x.record INTO i FROM rr_staff_answers.interactions x WHERE x.id=(p->>'interactionId')::uuid
   AND x.account_id=p->>'accountId' AND x.actor_type=p->>'actorType' AND x.actor_id=p->>'actorId';
  IF i IS NULL THEN RAISE EXCEPTION 'INTERACTION_UNAVAILABLE'; END IF;
  IF p->>'rating' NOT IN ('up','down') OR length(coalesce(p->>'comment',''))>1000 OR
   (p->>'reason' IS NOT NULL AND p->>'reason' NOT IN ('WRONG_SITUATION','MISSING_STEPS','DID_NOT_ANSWER','UNCLEAR','OTHER'))
  THEN RAISE EXCEPTION 'INVALID_FEEDBACK'; END IF;
  INSERT INTO rr_staff_answers.feedback(interaction_id,account_id,actor_type,actor_id,rating,reason,comment)
   VALUES((p->>'interactionId')::uuid,p->>'accountId',p->>'actorType',p->>'actorId',p->>'rating',p->>'reason',p->>'comment') RETURNING to_jsonb(feedback) INTO data;
  RETURN data;
 END IF;
 IF op='claim' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':',p->>'accountId',p->>'actorType',p->>'actorId'),0));
 END IF;
 SELECT * INTO r FROM rr_staff_answers.requests x WHERE x.account_id=p->>'accountId' AND x.actor_type=p->>'actorType'
 AND x.actor_id=p->>'actorId' AND x.request_id=p->>'requestId' FOR UPDATE;
 IF op='claim' THEN
  IF r.request_id IS NOT NULL THEN
   IF r.body_hash<>p->>'bodyHash' THEN RAISE EXCEPTION 'REQUEST_BODY_CHANGED'; END IF;
   IF r.fingerprint<>p->>'fingerprint' THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
   IF r.state='COMPLETE' THEN
    PERFORM rr_staff_answers.authorize(p,r.provider_started);
    RETURN jsonb_build_object('state','COMPLETE','response',r.response);
   END IF;
   IF r.state='PREPARED' THEN
    RETURN jsonb_build_object('state','PREPARED','token',r.claim_token,'sessionId',r.session_id);
   END IF;
   IF r.state='UNCERTAIN' OR (r.provider_started AND r.lease_until<=clock_timestamp()) THEN
    UPDATE rr_staff_answers.requests SET state='UNCERTAIN' WHERE claim_token=r.claim_token;
    RETURN jsonb_build_object('state','UNCERTAIN');
   END IF;
   IF r.state='RUNNING' AND r.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('state','BUSY'); END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM rr_staff_answers.requests x WHERE x.account_id=p->>'accountId' AND x.actor_type=p->>'actorType' AND x.actor_id=p->>'actorId'
   AND x.request_id<>p->>'requestId' AND x.state IN ('RUNNING','PREPARED') AND x.lease_until>clock_timestamp()
   AND (nullif(p->>'sessionId','') IS NULL OR x.session_id=(p->>'sessionId')::uuid)) THEN RETURN jsonb_build_object('state','BUSY'); END IF;
  IF nullif(p->>'sessionId','') IS NOT NULL THEN
   SELECT * INTO s FROM rr_staff_answers.sessions x WHERE x.id=(p->>'sessionId')::uuid AND x.account_id=p->>'accountId' AND x.actor_type=p->>'actorType' AND x.actor_id=p->>'actorId' FOR UPDATE;
   IF s.id IS NULL OR s.status<>'active' OR s.last_interaction_at<clock_timestamp()-interval '30 minutes' THEN RAISE EXCEPTION 'SESSION_UNAVAILABLE'; END IF;
   sid=s.id;rev=s.revision;
  ELSE sid=gen_random_uuid(); END IF;
  token=gen_random_uuid();
  INSERT INTO rr_staff_answers.requests(account_id,actor_type,actor_id,request_id,body_hash,fingerprint,session_id,expected_revision,state,claim_token,lease_until)
  VALUES(p->>'accountId',p->>'actorType',p->>'actorId',p->>'requestId',p->>'bodyHash',p->>'fingerprint',sid,rev,'RUNNING',token,clock_timestamp()+interval '30 seconds')
  ON CONFLICT(account_id,actor_type,actor_id,request_id) DO UPDATE SET state='RUNNING',claim_token=token,lease_until=clock_timestamp()+interval '30 seconds',session_id=sid,expected_revision=rev,provider_started=false,prepared=NULL;
  RETURN jsonb_build_object('state','RUNNING','token',token,'sessionId',sid,'session',CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) ELSE NULL END);
 END IF;
 IF r.request_id IS NULL OR r.claim_token::text IS DISTINCT FROM p->>'token' THEN RAISE EXCEPTION 'CLAIM_LOST'; END IF;
 IF op='commit' AND r.state='COMPLETE' THEN PERFORM rr_staff_answers.authorize(p,r.provider_started); RETURN r.response; END IF;
 IF op='abandon' THEN
  IF r.state='RUNNING' THEN UPDATE rr_staff_answers.requests SET state=CASE WHEN provider_started THEN 'UNCERTAIN' ELSE 'ABANDONED' END WHERE claim_token=r.claim_token; END IF;
  RETURN '{}'::jsonb;
 END IF;
 IF op='commit' AND r.state='PREPARED' THEN
  -- Prepared output can resume after a worker restart without another model call.
  -- Session revision, current authority and actor checks still apply at commit.
  PERFORM rr_staff_answers.authorize(p,r.provider_started);
  data=r.prepared;
  LOCK TABLE rr_pilot_20260906.driver_help_knowledge_records IN SHARE MODE;
  FOR g IN SELECT value FROM jsonb_array_elements(data->'sourceGuards') LOOP
   SELECT jsonb_object_agg(k,coalesce(to_jsonb(x)->k,'null'::jsonb)) INTO actual
   FROM (SELECT z.* FROM rr_pilot_20260906.driver_help_knowledge_records z WHERE z.knowledge_id=g->>'knowledge_id' ORDER BY z.version DESC LIMIT 1) x,
    jsonb_object_keys(g) k;
   IF actual IS DISTINCT FROM g THEN RAISE EXCEPTION 'SOURCE_CHANGED'; END IF;
   IF EXISTS(SELECT 1 FROM rr_pilot_20260906.driver_help_knowledge_records z WHERE z.knowledge_id=g->>'knowledge_id' AND z.version=(g->>'version')::integer AND
    (SELECT jsonb_object_agg(k,coalesce(to_jsonb(z)->k,'null'::jsonb)) FROM jsonb_object_keys(g) k) IS DISTINCT FROM g) THEN RAISE EXCEPTION 'SOURCE_CONFLICT'; END IF;
  END LOOP;
  SELECT * INTO s FROM rr_staff_answers.sessions x WHERE x.id=r.session_id FOR UPDATE;
  IF r.expected_revision=0 AND s.id IS NULL THEN
   INSERT INTO rr_staff_answers.sessions(id,account_id,actor_type,actor_id,revision,context,last_interaction_at)
   VALUES(r.session_id,r.account_id,r.actor_type,r.actor_id,1,data->'context',clock_timestamp());
  ELSE
   IF s.id IS NULL OR s.account_id<>r.account_id OR s.actor_type<>r.actor_type OR s.actor_id<>r.actor_id OR s.revision<>r.expected_revision OR s.status<>'active'
    OR s.last_interaction_at<clock_timestamp()-interval '30 minutes' THEN RAISE EXCEPTION 'SESSION_REVISION_CHANGED'; END IF;
   UPDATE rr_staff_answers.sessions SET context=data->'context',revision=revision+1,last_interaction_at=clock_timestamp() WHERE id=s.id;
  END IF;
  INSERT INTO rr_staff_answers.interactions(id,session_id,account_id,actor_type,actor_id,record)
  VALUES((data->'row'->>'id')::uuid,r.session_id,r.account_id,r.actor_type,r.actor_id,data->'row');
  UPDATE rr_staff_answers.requests SET state='COMPLETE',response=data->'wire',prepared=NULL WHERE claim_token=r.claim_token;
  RETURN data->'wire';
 END IF;
 IF r.state<>'RUNNING' OR r.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'CLAIM_EXPIRED'; END IF;
 IF op='provider' THEN
  PERFORM rr_staff_answers.authorize(p,true);
  UPDATE rr_staff_answers.requests SET provider_started=true WHERE claim_token=r.claim_token;
 ELSIF op='prepare' THEN
  IF p->'data'->'row'->>'session_id'<>r.session_id::text OR p->'data'->'wire'->>'session_id'<>r.session_id::text
   OR p->'data'->'wire'->>'interaction_id'<>p->'data'->'row'->>'id' OR jsonb_typeof(p->'data'->'sourceGuards') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'INVALID_PREPARED_RESULT'; END IF;
  UPDATE rr_staff_answers.requests SET state='PREPARED',prepared=p->'data' WHERE claim_token=r.claim_token;
 ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA rr_staff_answers FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rr_staff_answers FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rr_staff_answers_request(jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON FUNCTION public.rr_staff_answers_request(jsonb) FROM anon; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON FUNCTION public.rr_staff_answers_request(jsonb) FROM authenticated; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.rr_staff_answers_request(jsonb) TO service_role; END IF;
END $$;

CREATE TABLE rr_staff_answers.expected (
 staff_id text NOT NULL, dataset text NOT NULL, case_id text NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(staff_id,dataset,case_id)
);
CREATE TABLE rr_staff_answers.reviews (
 id uuid PRIMARY KEY, staff_id text NOT NULL, dataset text NOT NULL, case_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('comparison','live')), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON rr_staff_answers.reviews(staff_id,dataset,case_id,created_at);
CREATE FUNCTION public.rr_staff_testing(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,rr_staff_answers AS $$
DECLARE result jsonb; lease uuid; existing rr_staff_answers.reviews%ROWTYPE;
BEGIN
 IF nullif(p->>'staff_id','') IS NULL THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 IF p->>'op'='lease' THEN
  IF p->>'staff_role' NOT IN ('owner','admin','support') THEN RAISE EXCEPTION 'STAFF_WRITE_REQUIRED'; END IF;
  INSERT INTO rr_staff_answers.leases(staff_id,staff_role) VALUES(p->>'staff_id',p->>'staff_role') RETURNING id INTO lease;
  RETURN jsonb_build_object('id',lease);
 ELSIF p->>'op'='expected' THEN
  IF jsonb_typeof(p->'payload') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_EXPECTATION'; END IF;
  INSERT INTO rr_staff_answers.expected(staff_id,dataset,case_id,payload) VALUES(p->>'staff_id',p->>'dataset',p->>'case_id',p->'payload') ON CONFLICT DO NOTHING;
  SELECT to_jsonb(x) INTO result FROM rr_staff_answers.expected x WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset' AND case_id=p->>'case_id';
  IF result->'payload' IS DISTINCT FROM p->'payload' THEN RAISE EXCEPTION 'EXPECTATION_ALREADY_LOCKED'; END IF;
  RETURN result;
 ELSIF p->>'op'='case' THEN
  SELECT jsonb_build_object('expected',(SELECT to_jsonb(x) FROM rr_staff_answers.expected x WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset' AND case_id=p->>'case_id'),
   'reviews',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at) FROM rr_staff_answers.reviews x WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset' AND case_id=p->>'case_id'),'[]'::jsonb)) INTO result;
  RETURN result;
 ELSIF p->>'op'='review' THEN
  IF p->>'kind'='comparison' AND NOT EXISTS(SELECT 1 FROM rr_staff_answers.expected WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset' AND case_id=p->>'case_id') THEN RAISE EXCEPTION 'EXPECTATION_REQUIRED'; END IF;
  IF p->>'kind'='live' AND NOT EXISTS(SELECT 1 FROM rr_staff_answers.interactions WHERE id::text=p->>'case_id' AND actor_id=p->>'staff_id') THEN RAISE EXCEPTION 'INTERACTION_UNAVAILABLE'; END IF;
  INSERT INTO rr_staff_answers.reviews(id,staff_id,dataset,case_id,kind,payload)
   VALUES((p->>'id')::uuid,p->>'staff_id',p->>'dataset',p->>'case_id',p->>'kind',p->'payload') ON CONFLICT DO NOTHING;
  SELECT * INTO existing FROM rr_staff_answers.reviews WHERE id=(p->>'id')::uuid;
  IF existing.staff_id IS DISTINCT FROM p->>'staff_id' OR existing.payload IS DISTINCT FROM p->'payload' OR existing.case_id IS DISTINCT FROM p->>'case_id' OR existing.dataset IS DISTINCT FROM p->>'dataset' OR existing.kind IS DISTINCT FROM p->>'kind'
  THEN RAISE EXCEPTION 'REVIEW_ID_REUSED'; END IF;
  RETURN to_jsonb(existing);
 ELSIF p->>'op'='progress' THEN
  RETURN jsonb_build_object('expected',coalesce((SELECT jsonb_agg(case_id) FROM rr_staff_answers.expected WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset'),'[]'::jsonb),
   'reviewed',coalesce((SELECT jsonb_agg(DISTINCT case_id) FROM rr_staff_answers.reviews WHERE staff_id=p->>'staff_id' AND dataset=p->>'dataset' AND kind='comparison'),'[]'::jsonb));
 ELSIF p->>'op'='history' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT r.request_id,r.session_id,r.response,r.created_at,i.record->>'question' AS question FROM rr_staff_answers.requests r LEFT JOIN rr_staff_answers.interactions i ON i.id::text=r.response->>'interaction_id' AND i.actor_id=r.actor_id WHERE r.actor_id=p->>'staff_id' AND r.state='COMPLETE' AND r.created_at<coalesce((p->>'before')::timestamptz,'infinity'::timestamptz) ORDER BY r.created_at DESC LIMIT 50) x),'[]'::jsonb);
 ELSIF p->>'op'='export' THEN
  RETURN jsonb_build_object('expected',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM rr_staff_answers.expected x WHERE staff_id=p->>'staff_id'),'[]'::jsonb),
   'reviews',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at) FROM rr_staff_answers.reviews x WHERE staff_id=p->>'staff_id'),'[]'::jsonb));
 END IF;
 RAISE EXCEPTION 'INVALID_STAFF_OPERATION';
END $$;
-- Application roles cannot bypass the authenticated service or mutate review history.
REVOKE ALL ON SCHEMA rr_staff_answers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA rr_staff_answers FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rr_staff_answers FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rr_staff_testing(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rr_staff_answers_request(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rr_staff_testing(jsonb), public.rr_staff_answers_request(jsonb) TO service_role;
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rr_staff_answers' LOOP
 EXECUTE format('ALTER TABLE rr_staff_answers.%I ENABLE ROW LEVEL SECURITY',t.tablename);
END LOOP; END $$;
INSERT INTO rr_ai_control.scopes(id,ceiling_nano,interval_ms) VALUES('staff-live-20260906',1000000000,5000);
NOTIFY pgrst,'reload schema';

COMMIT;
