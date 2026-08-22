const test = require('node:test');
const assert = require('node:assert/strict');

const { loadDriverQuickActions, presentReferenceCode } = require('./rraQuickActions');

test('presents source-verified delivery and pickup records as concise list rows', () => {
  assert.deepEqual(presentReferenceCode({
    knowledge_id: 'DELIVERY_STATUS:02',
    canonical_situation: 'Delivery status 02 — Incorrect recipient address'
  }), { code: '02', label: 'Incorrect recipient address', type: 'delivery' });
});

test('loads company signup contacts without creating a second contact schema', async () => {
  const supabase = {
    from(table) {
      assert.equal(table, 'accounts');
      return {
        select(columns) {
          assert.match(columns, /rra_cxpc_phone_number/);
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'id');
          assert.equal(value, 'account-1');
          return this;
        },
        async maybeSingle() {
          return { data: {
            rra_cxpc_phone_number: '(800) 888-8888',
            rra_primary_manager_name: 'Vlad Fed',
            rra_primary_manager_phone_number: '619-999-0000'
          }, error: null };
        }
      };
    }
  };
  assert.deepEqual(await loadDriverQuickActions(supabase, 'account-1'), {
    cxpc: { phone: '8008888888' },
    manager: { name: 'Vlad Fed', phone: '6199990000' }
  });
});
