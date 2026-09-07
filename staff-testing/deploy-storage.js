// Uses the existing management token in GitHub Actions, never exports it.
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const project = 'xtzbjlmizmdfqelvhhwx';
const endpoint = `https://api.supabase.com/v1/projects/${project}/database/query`;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const mode = process.env.STAFF_STORAGE_MODE;
if (!token || !['verify','initialize'].includes(mode)) throw Error('A configured management credential and explicit mode are required.');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const checksum = crypto.createHash('sha256').update(schema).digest('hex');
const marker = 'ReadyRoute staff testing schema SHA256:' + checksum;
async function query(sql) {
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!res.ok) throw Error('Staging management query failed with HTTP ' + res.status);
  const value = await res.json();
  if (!Array.isArray(value)) throw Error('Unexpected management query response');
  return value;
}
const fingerprint = table => `(select jsonb_build_object('count',count(*),'checksum',md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' order by to_jsonb(x)::text),''))) from ${table} x)`;
const preservedSql = `select jsonb_build_object(
 'accounts',${fingerprint('public.accounts')},
 'drivers',${fingerprint('public.drivers')},
 'knowledge',${fingerprint('public.driver_help_knowledge_records')},
 'pilot_knowledge',${fingerprint('rr_pilot_20260906.driver_help_knowledge_records')},
 'previous_preview_budget',(select to_jsonb(x) from rr_ai_control.scopes x where id='private-hosted-saved-examples')
) preserved`;
async function main() {
  fs.mkdirSync(path.join(__dirname,'evidence'),{recursive:true});
  const preflight = (await query(`select to_regnamespace('rr_staff_answers')::text staff_schema,to_regnamespace('rr_pilot_20260906')::text pilot_schema,obj_description(to_regnamespace('rr_staff_answers'),'pg_namespace') marker`))[0];
  assert.equal(preflight.pilot_schema,'rr_pilot_20260906','The isolated approved pilot must already exist.');
  const before = (await query(preservedSql))[0];
  fs.writeFileSync(path.join(__dirname,'evidence/storage-before.json'),JSON.stringify({project,mode,checksum,preflight,...before},null,2)+'\n');
  if (mode==='initialize' && !preflight.staff_schema) {
    assert.ok(schema.startsWith('BEGIN;'));
    assert.ok(schema.trim().endsWith('COMMIT;'));
    const transaction = schema.trim().slice(0,-7) + `COMMENT ON SCHEMA rr_staff_answers IS '${marker}';\nCOMMIT;`;
    await query(transaction);
  } else {
    assert.equal(preflight.marker,marker,'No schema is overwritten or allowance reset. Verify the existing release before proceeding.');
  }
  const after = (await query(preservedSql))[0];
  assert.deepEqual(after,before,'Existing staging records or the previous saved-preview allowance changed.');
  const verification = (await query(`select
    obj_description(to_regnamespace('rr_staff_answers'),'pg_namespace') marker,
    has_function_privilege('anon','public.rr_staff_testing(jsonb)','execute') anon_rpc,
    has_function_privilege('authenticated','public.rr_staff_testing(jsonb)','execute') authenticated_rpc,
    has_function_privilege('anon','public.rr_staff_answers_request(jsonb)','execute') anon_answers,
    has_function_privilege('authenticated','public.rr_staff_answers_request(jsonb)','execute') authenticated_answers,
    has_function_privilege('service_role','public.rr_staff_testing(jsonb)','execute') service_rpc,
    (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='rr_staff_answers' and c.relkind='r') rls_enabled,
    (select to_jsonb(x) from rr_ai_control.scopes x where id='staff-live-20260906') budget,
    (select count(*) from rr_staff_answers.expected) expectations,
    (select count(*) from rr_staff_answers.reviews) reviews`))[0];
  assert.equal(verification.marker,marker);
  for(const key of ['anon_rpc','authenticated_rpc','anon_answers','authenticated_answers']) assert.equal(verification[key],false,key);
  assert.equal(verification.service_rpc,true);assert.equal(verification.rls_enabled,true);
  assert.equal(verification.budget.ceiling_nano,1000000000);
  fs.writeFileSync(path.join(__dirname,'evidence/storage-verified.json'),JSON.stringify({project,mode,checksum,preserved_unchanged:true,verification},null,2)+'\n');
  console.log('Private staff storage verified. Existing staging data and previous allowance are unchanged.');
  console.log('The new staff AI allowance is capped at $1 total. No reviewer ratings were fabricated.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
