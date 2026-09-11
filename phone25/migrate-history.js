const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const project='pdhnfbrsbpxkmetjkknb';
async function query(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`Management query HTTP ${r.status}`);const x=await r.json();if(!Array.isArray(x))throw Error('Invalid management result');return x;}
async function main(){
 fs.mkdirSync('phone25/evidence',{recursive:true});
 const before=(await query("select pg_get_functiondef('rr_answers_v2.mirror_interaction()'::regprocedure) definition"))[0].definition;
 fs.writeFileSync('phone25/evidence/mirror-before.sql',before);
 assert.ok(before.includes("'REVIEWED_DIRECT_ANSWER'"),'Expected existing deterministic mapping');
 let next=before;
 if(!next.includes("'DIRECT_APPROVED_25'"))next=next.replace("'REVIEWED_DIRECT_ANSWER'","'REVIEWED_DIRECT_ANSWER','DIRECT_APPROVED_25'");
 if(next.includes("'answering_version','2.0'"))next=next.replace("'answering_version','2.0'","'answering_version',COALESCE(NULLIF(x.interpretation_result->>'answering_version',''),'2.0')");
 assert.ok(next.includes("NULLIF(x.interpretation_result->>'answering_version','')"),'Version preservation missing');
 const tables=['public.driver_help_knowledge_records','public.driver_help_interactions','rr_answers_v2.interactions','rr_answers_v2.sessions','rr_answers_v2.requests'];
 const digest="jsonb_build_object("+tables.map(t=>`'${t}',(select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),''))) from ${t} x)`).join(',')+")";
 const beforeMd5=crypto.createHash('md5').update(before).digest('hex');
 const tx=`BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE ${tables.join(',')} IN SHARE MODE;
 DO $guard$ BEGIN IF md5(pg_get_functiondef('rr_answers_v2.mirror_interaction()'::regprocedure)) <> '${beforeMd5}' THEN RAISE EXCEPTION 'Function changed since preflight'; END IF; END $guard$;
 CREATE TEMP TABLE phone25_preserved ON COMMIT DROP AS SELECT ${digest} AS value;
 ${next};
 DO $guard$ BEGIN IF (SELECT value FROM phone25_preserved) IS DISTINCT FROM ${digest} THEN RAISE EXCEPTION 'Data preservation failed'; END IF; END $guard$;
 COMMIT; SELECT true AS preserved;`;
 await query(tx);
 const after=(await query("select pg_get_functiondef('rr_answers_v2.mirror_interaction()'::regprocedure) definition"))[0].definition;
 assert.ok(after.includes("'DIRECT_APPROVED_25'"));assert.ok(after.includes("NULLIF(x.interpretation_result->>'answering_version','')"));
 fs.writeFileSync('phone25/evidence/mirror-after.sql',after);
 fs.writeFileSync('phone25/evidence/history.json',JSON.stringify({project,applied:next!==before,existing_records_and_history_unchanged:true,version_preserved:true,direct_mode_supported:true,before_sha256:crypto.createHash('sha256').update(before).digest('hex'),after_sha256:crypto.createHash('sha256').update(after).digest('hex')},null,2));
 console.log('Driver history compatibility verified; existing records and histories unchanged.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
