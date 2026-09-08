// One-time owner-authorized staff allowance adjustment. No ledger reset.
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  assert.equal(process.env.STAFF_ALLOWANCE_ACTION, 'raise-to-five');
  assert.ok(process.env.SUPABASE_ACCESS_TOKEN, 'Existing management credential required');
  const query = `
WITH locked AS MATERIALIZED (
  SELECT * FROM rr_ai_control.scopes
  WHERE id = 'staff-live-20260906' AND ceiling_nano IN (1000000000,5000000000)
  FOR UPDATE
), changed AS (
  UPDATE rr_ai_control.scopes s SET ceiling_nano = 5000000000
  FROM locked previous WHERE s.id = previous.id
  RETURNING to_jsonb(s) AS after
)
SELECT (SELECT to_jsonb(previous) FROM locked previous) AS before,
       changed.after,
       (SELECT count(*) FROM rr_ai_control.calls WHERE scope='staff-live-20260906') AS preserved_call_count
FROM changed;
`;
  const response = await fetch('https://api.supabase.com/v1/projects/xtzbjlmizmdfqelvhhwx/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30000),
    redirect: 'error'
  });
  assert.ok(response.ok, 'Staging allowance update failed with HTTP ' + response.status);
  const rows = await response.json();
  assert.equal(rows.length, 1, 'Unexpected allowance state; no matching scope was updated');
  const { before, after, preserved_call_count } = rows[0];
  assert.equal(after.ceiling_nano, 5000000000);
  const withoutCeiling = ({ ceiling_nano, ...rest }) => rest;
  assert.deepEqual(withoutCeiling(after), withoutCeiling(before), 'Other allowance fields changed');
  fs.mkdirSync('staff-allowance-evidence', { recursive: true });
  fs.writeFileSync('staff-allowance-evidence/result.json', JSON.stringify({
    verified_at: new Date().toISOString(), authorization: 'Phillip approved raising the shared staff allowance from $1 to $5 total on September 8, 2026.',
    before, after, preserved_call_count, spending_and_holds_preserved: true,
    other_scopes_changed: false, schema_changed: false
  }, null, 2) + '\n');
  console.log('Shared staff AI allowance verified at $5 total. Prior usage and holds preserved.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
