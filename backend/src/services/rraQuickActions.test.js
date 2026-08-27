const test = require('node:test');
const assert = require('node:assert/strict');

const { getIsoWeekday, loadDriverQuickActions, presentReferenceCode } = require('./rraQuickActions');

test('presents source-verified delivery and pickup records as concise list rows', () => {
  assert.deepEqual(presentReferenceCode({
    knowledge_id: 'DELIVERY_STATUS:02',
    canonical_situation: 'Delivery status 02 — Incorrect recipient address'
  }), { code: '02', label: 'Incorrect recipient address', type: 'delivery' });
});

test('resolves ISO weekdays in the company timezone', () => {
  const instant = new Date('2026-08-28T04:30:00.000Z');
  assert.equal(getIsoWeekday(instant, 'America/Los_Angeles'), 4);
  assert.equal(getIsoWeekday(instant, 'America/New_York'), 5);
});

test('loads the manager scheduled for the company-local weekday', async () => {
  const supabase = {
    from(table) {
      let filters = [];
      return {
        select(columns) {
          if (table === 'accounts') assert.match(columns, /operations_timezone/);
          return this;
        },
        eq(column, value) {
          filters.push([column, value]);
          return this;
        },
        async maybeSingle() {
          if (table === 'accounts') return { data: {
            operations_timezone: 'America/Los_Angeles',
            rra_cxpc_phone_number: '(800) 888-8888',
            rra_primary_manager_name: 'Fallback Manager',
            rra_primary_manager_phone_number: '619-999-0000'
          }, error: null };
          if (table === 'rra_manager_weekly_schedule') {
            assert.deepEqual(filters.at(-1), ['iso_weekday', 4]);
            return { data: { manager_user_id: 'manager-2' }, error: null };
          }
          if (table === 'manager_users') return { data: { full_name: 'Thursday Manager', phone: '415-555-0100' }, error: null };
          throw new Error(`Unexpected table ${table}`);
        }
      };
    }
  };
  assert.deepEqual(await loadDriverQuickActions(supabase, 'account-1', new Date('2026-08-27T18:00:00.000Z')), {
    cxpc: { phone: '8008888888' },
    manager: { name: 'Thursday Manager', phone: '4155550100' }
  });
});
