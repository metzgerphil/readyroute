const fs=require('node:fs'),assert=require('node:assert/strict');
async function main(){
 assert.ok(process.env.SUPABASE_ACCESS_TOKEN,'Existing management credential required');
 const sql=fs.readFileSync(__dirname+'/schema.sql','utf8');
 const tables=['reviews','expected','requests','interactions'];
 const preservation=tables.map(t=>`SELECT '${t}' AS name,count(*) AS rows,md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) AS digest FROM rr_staff_answers.${t} x`).concat(["SELECT 'staff_budget',count(*),md5(string_agg(to_jsonb(x)::text,'')) FROM rr_ai_control.scopes x WHERE id='staff-live-20260906'"]).join(' UNION ALL ');
 const query=sql.replace('BEGIN;',()=>`BEGIN;\nLOCK TABLE ${tables.map(t=>'rr_staff_answers.'+t).join(',')},rr_ai_control.scopes IN SHARE MODE;\nCREATE TEMP TABLE rr_before ON COMMIT DROP AS ${preservation};`).replace('COMMIT;',()=>`CREATE TEMP TABLE rr_after ON COMMIT DROP AS ${preservation};\nDO $$ BEGIN IF EXISTS(SELECT * FROM rr_before EXCEPT SELECT * FROM rr_after) THEN RAISE EXCEPTION 'PRESERVATION_FAILED'; END IF; END $$;\nSELECT jsonb_build_object('preserved',true,'tables',(SELECT jsonb_agg(to_jsonb(x)) FROM rr_after x)) AS verification;\nCOMMIT;`);
 const r=await fetch('https://api.supabase.com/v1/projects/xtzbjlmizmdfqelvhhwx/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000),redirect:'error'});
 assert.ok(r.ok,'Staging review migration failed HTTP '+r.status);const result=await r.json();
 // A successful transaction includes the preservation assertion, even if the management API omits SELECT rows before COMMIT.
 const verify=await fetch('https://api.supabase.com/v1/projects/xtzbjlmizmdfqelvhhwx/database/query',{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:"SELECT to_regprocedure('public.rr_staff_review_queue(jsonb)') IS NOT NULL AS installed, (SELECT relrowsecurity FROM pg_class WHERE oid='rr_staff_answers.review_events'::regclass) AS private, (SELECT ceiling_nano FROM rr_ai_control.scopes WHERE id='staff-live-20260906') AS ceiling_nano"}),signal:AbortSignal.timeout(30000)});
 assert.ok(verify.ok);const checks=await verify.json();assert.equal(checks[0].installed,true);assert.equal(checks[0].private,true);assert.equal(checks[0].ceiling_nano,5000000000);
 fs.mkdirSync('staff-review-evidence',{recursive:true});fs.writeFileSync('staff-review-evidence/result.json',JSON.stringify({at:new Date().toISOString(),project:'xtzbjlmizmdfqelvhhwx',preservation_assertion_passed:true,result,checks},null,2)+'\n');
 console.log('Additive staff workflow installed. Original reviews, expectations, requests, interactions and staff budget preserved.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
