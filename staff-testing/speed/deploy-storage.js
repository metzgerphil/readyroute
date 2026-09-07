// Additive speed storage in the existing free staging project only.
// The existing Actions credential stays in Actions. No operational data is published.
const fs=require('node:fs'), crypto=require('node:crypto'), assert=require('node:assert/strict');
const project='xtzbjlmizmdfqelvhhwx', mode=process.env.STAFF_SPEED_STORAGE_MODE, token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token||!['initialize','verify'].includes(mode))throw Error('Configured credential and explicit mode required');
const sql=fs.readFileSync(__dirname+'/schema.sql','utf8'),checksum=crypto.createHash('sha256').update(sql).digest('hex');
const marker='ReadyRoute staff speed SHA256:'+checksum;
async function query(sql){
 const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000),redirect:'error'});
 if(!r.ok)throw Error('Staging management query failed with HTTP '+r.status);
 const result=await r.json();if(!Array.isArray(result))throw Error('Invalid management response');return result;
}
const tables=['public.accounts','public.drivers','public.driver_help_knowledge_records','rr_pilot_20260906.driver_help_knowledge_records','rr_staff_answers.requests','rr_staff_answers.sessions','rr_staff_answers.interactions','rr_staff_answers.expected','rr_staff_answers.reviews','rr_ai_control.scopes'];
const preservation='SELECT jsonb_build_object('+tables.map(t=>`'${t}',(SELECT jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY to_jsonb(x)::text),''))) FROM ${t} x)`).join(',')+') preserved';
async function main(){
 const before=(await query(preservation))[0];
 const preflight=(await query("SELECT to_regclass('rr_staff_answers.knowledge_revision')::text object,obj_description(to_regprocedure('public.rr_staff_speed_snapshot(jsonb)'),'pg_proc') marker"))[0];
 if(mode==='initialize'&&!preflight.object){
  assert.ok(sql.startsWith('BEGIN;')&&sql.trim().endsWith('COMMIT;'));
  await query(sql.trim().slice(0,-7)+`COMMENT ON FUNCTION public.rr_staff_speed_snapshot(jsonb) IS '${marker}';\nCOMMIT;`);
 }else assert.equal(preflight.marker,marker,'Existing speed storage is never overwritten');
 const after=(await query(preservation))[0];
 assert.deepEqual(after,before,'Existing data changed during migration; inspect before proceeding');
 const verified=(await query(`SELECT obj_description(to_regprocedure('public.rr_staff_speed_snapshot(jsonb)'),'pg_proc') marker,
  has_function_privilege('anon','public.rr_staff_speed_snapshot(jsonb)','execute') anon_snapshot,
  has_function_privilege('authenticated','public.rr_staff_speed_snapshot(jsonb)','execute') authenticated_snapshot,
  has_function_privilege('anon','public.rr_staff_speed_request(jsonb)','execute') anon_request,
  has_function_privilege('authenticated','public.rr_staff_speed_request(jsonb)','execute') authenticated_request,
  has_function_privilege('service_role','public.rr_staff_speed_snapshot(jsonb)','execute') service_snapshot,
  has_function_privilege('service_role','public.rr_staff_speed_request(jsonb)','execute') service_request,
  (SELECT count(*)::int FROM rr_staff_answers.knowledge_revision) revision_rows,
  (SELECT tgenabled FROM pg_trigger WHERE tgname='rr_staff_knowledge_changed' AND tgrelid='rr_pilot_20260906.driver_help_knowledge_records'::regclass) trigger_enabled,
  (SELECT relrowsecurity FROM pg_class WHERE oid='rr_staff_answers.knowledge_revision'::regclass) rls_enabled`))[0];
 assert.equal(verified.marker,marker);
 for(const key of ['anon_snapshot','authenticated_snapshot','anon_request','authenticated_request'])assert.equal(verified[key],false,key);
 assert.equal(verified.service_snapshot,true);assert.equal(verified.service_request,true);assert.equal(verified.revision_rows,1);assert.equal(verified.trigger_enabled,'O');assert.equal(verified.rls_enabled,true);
 fs.mkdirSync(__dirname+'/evidence',{recursive:true});
 fs.writeFileSync(__dirname+'/evidence/storage-verification.json',JSON.stringify({project,mode,checksum,preserved_unchanged:true,before,after,verified},null,2)+'\n');
 console.log('Staff speed storage verified. Existing source rows, reviews, histories and allowances are unchanged.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
