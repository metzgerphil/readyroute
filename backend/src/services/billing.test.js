const test = require('node:test');
const assert = require('node:assert/strict');

const { createBillingService } = require('./billing');

function createAccountSupabase(account) {
  return {
    from(table) {
      assert.equal(table, 'accounts');
      return {
        select() {
          return this;
        },
        eq(column, value) {
          assert.equal(column, 'id');
          assert.equal(value, account.id);
          return this;
        },
        async maybeSingle() {
          return { data: account, error: null };
        }
      };
    }
  };
}

test('scheduleAccountCancellation keeps the Stripe customer and uses period-end cancellation', async () => {
  const subscriptionUpdates = [];
  let customerDeleteCalls = 0;
  const service = createBillingService({
    supabase: createAccountSupabase({
      id: 'acct-1',
      stripe_customer_id: 'cus-1',
      stripe_subscription_id: 'sub-1'
    }),
    stripeClient: {
      subscriptions: {
        async update(subscriptionId, payload) {
          subscriptionUpdates.push({ subscriptionId, payload });
          return {
            id: subscriptionId,
            cancel_at_period_end: true,
            current_period_end: 1785542399
          };
        }
      },
      customers: {
        async del() {
          customerDeleteCalls += 1;
        }
      }
    }
  });

  const result = await service.scheduleAccountCancellation('acct-1', {
    now: new Date('2026-07-11T00:00:00.000Z')
  });

  assert.deepEqual(subscriptionUpdates, [{
    subscriptionId: 'sub-1',
    payload: { cancel_at_period_end: true }
  }]);
  assert.equal(customerDeleteCalls, 0);
  assert.equal(result.subscription_id, 'sub-1');
  assert.equal(result.cancel_at_period_end, true);
  assert.equal(result.service_ends_at, '2026-07-31T23:59:59.000Z');
});
