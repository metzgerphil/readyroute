const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BILLING_POLICY_VERSION,
  createStripeSignupBillingService,
  normalizeBillingAddress,
  normalizeBillingInterval
} = require('./stripeSignupBilling');

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
  }
  select(columns) { this.columns = columns; return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  maybeSingle() { return Promise.resolve(this.db.handle(this)); }
  then(resolve, reject) { return Promise.resolve(this.db.handle(this)).then(resolve, reject); }
}

function createDb(handler) {
  return { from(table) { return new Query(this, table); }, handle: handler };
}

test('normalizeBillingAddress requires a complete US address', () => {
  assert.deepEqual(normalizeBillingAddress({ billing_address_country: 'CA' }), {
    error: 'A complete United States billing address is required.'
  });
  assert.deepEqual(normalizeBillingAddress({
    billing_address_line1: '1 Main St',
    billing_address_city: 'Sacramento',
    billing_address_state: 'CA',
    billing_address_postal_code: '95814'
  }).address, {
    line1: '1 Main St',
    line2: undefined,
    city: 'Sacramento',
    state: 'CA',
    postal_code: '95814',
    country: 'US'
  });
});

test('normalizeBillingInterval accepts only monthly or annual billing', () => {
  assert.equal(normalizeBillingInterval('monthly'), 'monthly');
  assert.equal(normalizeBillingInterval('annual'), 'annual');
  assert.equal(normalizeBillingInterval('weekly'), null);
});

test('prepareSignupPayment creates a customer and off-session SetupIntent without charging', async () => {
  const updates = [];
  const calls = [];
  const db = createDb((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }
    throw new Error(`Unexpected ${query.table}:${query.operation}`);
  });
  const stripe = {
    customers: {
      create: async (payload, options) => { calls.push({ type: 'customer', payload, options }); return { id: 'cus_test' }; },
      update: async () => { throw new Error('Existing customer should not be updated'); }
    },
    setupIntents: {
      create: async (payload, options) => {
        calls.push({ type: 'setup', payload, options });
        return { id: 'seti_test', client_secret: 'seti_secret_test' };
      }
    }
  };
  const service = createStripeSignupBillingService({
    supabase: db,
    stripeClient: stripe,
    publishableKey: 'pk_test_safe',
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    signupEnabled: true
  });
  const result = await service.prepareSignupPayment({
    signup: { id: 'signup-1', email: 'owner@example.com', company_csa: 'ReadyRoute Test', stripe_customer_id: null },
    address: { line1: '1 Main St', city: 'Sacramento', state: 'CA', postal_code: '95814', country: 'US' },
    requestId: '00000000-0000-4000-8000-000000000001',
    ip: '127.0.0.1',
    billingInterval: 'annual'
  });

  assert.equal(result.client_secret, 'seti_secret_test');
  assert.equal(result.billing_policy_version, BILLING_POLICY_VERSION);
  assert.equal(calls[1].payload.usage, 'off_session');
  assert.equal(Object.hasOwn(calls[1].payload, 'payment_method_types'), false);
  assert.equal(updates[0].billing_setup_status, 'processing');
  assert.equal(updates[0].billing_interval, 'annual');
  assert.equal(calls[1].payload.metadata.billing_interval, 'annual');
});

test('createSignupCheckoutSession opens hosted Stripe setup and records the pending enrollment', async () => {
  const updates = [];
  let checkoutPayload;
  const db = createDb((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }
    throw new Error(`Unexpected ${query.table}:${query.operation}`);
  });
  const stripe = {
    customers: {
      create: async () => ({ id: 'cus_checkout' }),
      update: async () => { throw new Error('Existing customer should not be updated'); }
    },
    checkout: {
      sessions: {
        create: async (payload) => {
          checkoutPayload = payload;
          return { id: 'cs_test_signup', url: 'https://checkout.stripe.test/signup' };
        }
      }
    }
  };
  const service = createStripeSignupBillingService({
    supabase: db,
    stripeClient: stripe,
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    signupEnabled: true
  });

  const result = await service.createSignupCheckoutSession({
    signup: { id: 'signup-1', email: 'owner@example.com', company_csa: 'RRA Company', stripe_customer_id: null },
    requestId: '00000000-0000-4000-8000-000000000001',
    ip: '127.0.0.1',
    billingInterval: 'monthly',
    successUrl: 'https://readyroute.org/signup?checkout=success',
    cancelUrl: 'https://readyroute.org/signup?checkout=canceled'
  });

  assert.equal(result.checkout_url, 'https://checkout.stripe.test/signup');
  assert.equal(checkoutPayload.mode, 'setup');
  assert.equal(checkoutPayload.billing_address_collection, 'required');
  assert.equal(checkoutPayload.metadata.readyroute_signup_id, 'signup-1');
  assert.equal(updates[0].stripe_checkout_session_id, 'cs_test_signup');
  assert.equal(updates[0].onboarding_status, 'pending_payment');
});

test('activateSubscription bills only active drivers and leaves Tax off by default', async () => {
  const updates = [];
  const db = createDb((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return { data: {
        id: 'acct-1', stripe_customer_id: 'cus_test', stripe_subscription_id: null,
        stripe_default_payment_method_id: 'pm_test', billing_setup_status: 'succeeded', billing_interval: 'monthly'
      }, error: null };
    }
    if (query.table === 'drivers' && query.operation === 'select') {
      assert.deepEqual(query.filters, [
        { column: 'account_id', value: 'acct-1' },
        { column: 'is_active', value: true }
      ]);
      return { data: [{ id: 'driver-1' }, { id: 'driver-2' }], error: null };
    }
    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }
    throw new Error(`Unexpected ${query.table}:${query.operation}`);
  });
  let subscriptionPayload;
  const service = createStripeSignupBillingService({
    supabase: db,
    stripeClient: { subscriptions: { create: async (payload) => {
      subscriptionPayload = payload;
      return { id: 'sub_test', status: 'incomplete', items: { data: [{ id: 'si_test' }] } };
    } } },
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    liveBillingApproved: true,
    taxEnabled: false
  });

  const result = await service.activateSubscription('acct-1');
  assert.equal(result.active_driver_count, 2);
  assert.deepEqual(subscriptionPayload.items, [{ price: 'price_monthly_1000', quantity: 2 }]);
  assert.equal(Object.hasOwn(subscriptionPayload, 'automatic_tax'), false);
  assert.equal(updates.at(-1).billed_driver_count, 2);
});

test('activateSubscription refuses to bill a complimentary account', async () => {
  const db = createDb((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          rra_billing_treatment: 'complimentary',
          stripe_customer_id: 'cus_test',
          stripe_subscription_id: null,
          stripe_default_payment_method_id: 'pm_test',
          billing_setup_status: 'succeeded',
          billing_interval: 'monthly'
        },
        error: null
      };
    }
    throw new Error(`Unexpected ${query.table}:${query.operation}`);
  });
  const service = createStripeSignupBillingService({
    supabase: db,
    stripeClient: { subscriptions: { create: async () => { throw new Error('Stripe must not be called'); } } },
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    liveBillingApproved: true
  });

  await assert.rejects(() => service.activateSubscription('acct-1'), { code: 'COMPLIMENTARY_ACCOUNT' });
});

test('activateSubscription cannot charge until live billing is explicitly approved', async () => {
  const service = createStripeSignupBillingService({
    supabase: createDb(() => { throw new Error('Database must not be called'); }),
    stripeClient: { subscriptions: { create: async () => ({}) } },
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    liveBillingApproved: false
  });
  await assert.rejects(() => service.activateSubscription('acct-1'), { code: 'LIVE_BILLING_NOT_APPROVED' });
});

test('activateSubscription refuses Tax before registrations are confirmed', async () => {
  const service = createStripeSignupBillingService({
    supabase: createDb(() => { throw new Error('Database must not be called'); }),
    stripeClient: { subscriptions: { create: async () => ({}) } },
    monthlyPriceId: 'price_monthly_1000',
    annualPriceId: 'price_annual_10000',
    liveBillingApproved: true,
    taxEnabled: true,
    taxRegistrationsConfirmed: false
  });
  await assert.rejects(() => service.activateSubscription('acct-1'), { code: 'STRIPE_TAX_NOT_READY' });
});
