const fs=require('node:fs'),assert=require('node:assert/strict');
const sql=`BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE rr_ai_control.scopes IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE rr_limit_before ON COMMIT DROP AS SELECT to_jsonb(s) value FROM rr_ai_control.scopes s;
DO $guard$ BEGIN
 IF (SELECT count(*) FROM rr_limit_before WHERE value->>'id'='driver-live-20260907')<>1 OR (SELECT (value->>'ceiling_nano')::bigint FROM rr_limit_before WHERE value->>'id'='driver-live-20260907') NOT IN (6000000000,7000000000) THEN RAISE EXCEPTION 'Unexpected current limit'; END IF;
END $guard$;
UPDATE rr_ai_control.scopes SET ceiling_nano=7000000000 WHERE id='driver-live-20260907';
DO $guard$ BEGIN
 IF (SELECT jsonb_agg(CASE WHEN value->>'id'='driver-live-20260907' THEN value-'ceiling_nano' ELSE value END ORDER BY value->>'id') FROM rr_limit_before)
 IS DISTINCT FROM (SELECT jsonb_agg(CASE WHEN s.id='driver-live-20260907' THEN to_jsonb(s)-'ceiling_nano' ELSE to_jsonb(s) END ORDER BY s.id) FROM rr_ai_control.scopes s) THEN RAISE EXCEPTION 'Other usage, holds or configuration changed'; END IF;
END $guard$;
SELECT jsonb_build_object('prior',(SELECT value FROM rr_limit_before WHERE value->>'id'='driver-live-20260907'),'after',to_jsonb(s),'other_fields_and_scopes_preserved',true) result FROM rr_ai_control.scopes s WHERE id='driver-live-20260907';
COMMIT;`;
(async()=>{assert.ok(process.env.SUPABASE_ACCESS_TOKEN);const r=await fetch('https://api.supabase.com/v1/projects/pdhnfbrsbpxkmetjkknb/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('Limit update failed HTTP '+r.status);const rows=await r.json(),result=rows.find(x=>x.result)?.result;assert.equal(result?.after?.ceiling_nano,7000000000);assert.equal(result.other_fields_and_scopes_preserved,true);fs.mkdirSync('allowance-evidence',{recursive:true});fs.writeFileSync('allowance-evidence/result.json',JSON.stringify({owner:'Phillip',authorization:'Yes raise the limit. And then run the tests',scope:'driver-live-20260907',...result},null,2));console.log('Authorized driver limit is $7; prior usage, holds and other scopes preserved.');})().catch(e=>{console.error(e.message);process.exitCode=1});
