const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { hashSignupAccessNonce } = require('../services/stripeSignupBilling');

process.env.JWT_SECRET = 'test-secret';

const { createApp } = require('../app');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
      payload: undefined,
      columns: null
    };
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert') {
      this.state.returning = columns;
      return this;
    }

    this.operation = 'select';
    this.state.columns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  upsert(payload, options = {}) {
    this.operation = 'upsert';
    this.state.payload = payload;
    this.state.options = options;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  limit(value) {
    this.state.limit = value;
    return this;
  }

  maybeSingle() {
    return this.execute('maybeSingle');
  }

  single() {
    return this.execute('single');
  }

  then(resolve, reject) {
    return this.execute('all').then(resolve, reject);
  }

  execute(mode) {
    return Promise.resolve(
      this.supabase.execute({
        table: this.table,
        operation: this.operation,
        mode,
        ...this.state
      })
    );
  }
}

class MockSupabase {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }

  execute(query) {
    this.calls.push(query);
    return this.handler(query, this.calls);
  }
}

function signManagerToken(overrides = {}) {
  return jwt.sign(
    {
      account_id: overrides.account_id || 'acct-1',
      role: 'manager'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer({
  supabase,
  stripeClient,
  webhookSecret,
  stripePriceId,
  stripeMonthlyPriceId,
  stripeAnnualPriceId,
  stripeSignupEnabled,
  signupReturnUrl,
  sendRraCompanyReadyEmail,
  enforceBilling = false
}) {
  const app = createApp({
    supabase,
    stripeClient,
    webhookSecret,
    stripePriceId,
    stripeMonthlyPriceId,
    stripeAnnualPriceId,
    stripeSignupEnabled,
    signupReturnUrl,
    sendRraCompanyReadyEmail,
    jwtSecret: process.env.JWT_SECRET,
    enforceBilling
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

test('GET /billing/subscription-summary reports active-driver pricing without route billing', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return { data: {
        id: 'acct-1', billing_setup_status: 'succeeded', billing_activation_status: 'ready',
        billing_access_status: 'not_provisioned', billing_interval: 'annual', billed_driver_count: 0,
        subscription_status: 'incomplete', stripe_customer_id: 'cus-1', stripe_default_payment_method_id: 'pm-1',
        stripe_subscription_id: null
      }, error: null };
    }
    if (query.table === 'drivers' && query.operation === 'select') {
      return { data: [{ id: 'driver-1' }, { id: 'driver-2' }, { id: 'driver-3' }], error: null };
    }
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const server = await startTestServer({ supabase });
  try {
    const response = await fetch(`${server.baseUrl}/billing/subscription-summary`, {
      headers: { Authorization: `Bearer ${signManagerToken()}` }
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.billing.active_driver_count, 3);
    assert.equal(payload.billing.billing_interval, 'annual');
    assert.equal(payload.billing.unit_amount_cents, 10000);
    assert.equal(payload.billing.estimated_total_cents, 30000);
    assert.equal(payload.billing.payment_method_ready, true);
  } finally {
    await server.close();
  }
});

test('company managers cannot activate the first live subscription', async () => {
  const server = await startTestServer({ supabase: new MockSupabase(() => ({ data: null, error: null })) });
  try {
    const response = await fetch(`${server.baseUrl}/billing/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signManagerToken()}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/checkout-session redirects a valid RRA company signup to hosted Stripe', async () => {
  const updates = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'upsert') {
      return {
        data: { id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', company_csa: 'Taylor Transport', stripe_customer_id: null },
        error: null
      };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  let checkoutPayload;
  const stripeClient = {
    customers: { create: async () => ({ id: 'cus_signup' }) },
    checkout: { sessions: { create: async (payload) => {
      checkoutPayload = payload;
      return { id: 'cs_signup', url: 'https://checkout.stripe.test/cs_signup' };
    } } }
  };
  const server = await startTestServer({
    supabase,
    stripeClient,
    stripeMonthlyPriceId: 'price_monthly',
    stripeAnnualPriceId: 'price_annual',
    stripeSignupEnabled: true,
    signupReturnUrl: 'https://readyroute.org/signup'
  });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taylor Owner',
        email: 'owner@example.com',
        phone: '555-0100',
        manager_name: 'Casey Manager',
        manager_phone_number: '555-0199',
        cxpc_phone_number: '555-0101',
        csa_number: 'CSA-0102',
        company: 'Taylor Transport',
        role: 'Authorized officer',
        drivers: 5,
        billing_interval: 'monthly',
        billing_consent: true,
        ai_processing_authorized: true,
        ai_processing_policy_version: '2026-08-20',
        request_id: '00000000-0000-4000-8000-000000000001'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.checkout_url, 'https://checkout.stripe.test/cs_signup');
    assert.equal(checkoutPayload.currency, 'usd');
    assert.match(checkoutPayload.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.equal(
      checkoutPayload.metadata.readyroute_access_nonce_hash,
      hashSignupAccessNonce('00000000-0000-4000-8000-000000000001')
    );
    assert.equal(updates[0].onboarding_status, 'pending_payment');
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/complete creates the first manager password without requiring email', async () => {
  const updates = [];
  const accessNonce = '00000000-0000-4000-8000-000000000002';
  const supabase = new MockSupabase((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'select') {
      return { data: {
        id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', phone_number: '555-0100',
        manager_name: 'Casey Manager', manager_phone_number: '555-0199',
        company_csa: 'Taylor Transport', role: 'Owner', driver_count: 5, billing_interval: 'monthly',
        billing_policy_version: '2026-08-15-v2', billing_consent_at: '2026-08-16T12:00:00.000Z',
        account_id: 'acct-new', onboarding_status: 'email_sent'
      }, error: null };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') return { data: null, error: null };
    if (query.table === 'accounts' && query.operation === 'select') {
      return { data: { id: 'acct-new', company_name: 'Taylor Transport' }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'select') {
      return { data: { id: 'manager-new', email: 'owner@example.com', full_name: 'Taylor Owner', password_hash: null }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'update') {
      updates.push({ table: query.table, ...query.payload });
      return { data: null, error: null };
    }
    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push({ table: query.table, ...query.payload });
      return { data: null, error: null };
    }
    if (query.table === 'account_internal_profiles' && query.operation === 'upsert') return { data: null, error: null };
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => ({
      id: 'cs_signup', mode: 'setup', status: 'complete', customer: 'cus_signup',
      metadata: {
        readyroute_signup_id: 'signup-1',
        readyroute_access_nonce_hash: hashSignupAccessNonce(accessNonce)
      },
      setup_intent: { id: 'seti_signup', payment_method: { id: 'pm_signup' } }
    }) } }
  };
  const server = await startTestServer({ supabase, stripeClient });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'cs_signup', access_nonce: accessNonce, password: 'new-password-123' })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.password_created, true);
    assert.equal(payload.email_delivered, true);
    assert.equal(updates[0].table, 'manager_users');
    assert.match(updates[0].accepted_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(await bcrypt.compare('new-password-123', updates[0].password_hash), true);
    assert.equal(updates[1].table, 'accounts');
    assert.equal(await bcrypt.compare('new-password-123', updates[1].manager_password_hash), true);
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/complete rejects password creation without the browser signup key', async () => {
  const accessNonce = '00000000-0000-4000-8000-000000000003';
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => ({
      id: 'cs_signup', mode: 'setup', status: 'complete', customer: 'cus_signup',
      metadata: {
        readyroute_signup_id: 'signup-1',
        readyroute_access_nonce_hash: hashSignupAccessNonce(accessNonce)
      },
      setup_intent: { id: 'seti_signup', payment_method: { id: 'pm_signup' } }
    }) } }
  };
  const server = await startTestServer({
    supabase: new MockSupabase(() => { throw new Error('Database should not be reached'); }),
    stripeClient
  });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'cs_signup', access_nonce: 'wrong-key', password: 'new-password-123' })
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /secure password-setup session/i);
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/complete provisions the company and sends the RRA portal link', async () => {
  const inserts = [];
  const updates = [];
  let sentEmail;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'select') {
      return { data: {
        id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', phone_number: '555-0100',
        manager_name: 'Casey Manager', manager_phone_number: '555-0199',
        company_csa: 'Taylor Transport', role: 'Owner', driver_count: 5, billing_interval: 'monthly',
        billing_policy_version: '2026-08-15-v2', billing_consent_at: '2026-08-16T12:00:00.000Z',
        account_id: null, onboarding_status: 'pending_payment'
      }, error: null };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }
    if (query.table === 'accounts' && query.operation === 'select') return { data: null, error: null };
    if (query.table === 'manager_users' && query.operation === 'select') return { data: null, error: null };
    if (query.table === 'accounts' && query.operation === 'insert') {
      inserts.push(query.payload);
      return { data: { id: 'acct-new', company_name: 'Taylor Transport' }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'insert') {
      inserts.push(query.payload);
      return { data: { id: 'manager-new', email: 'owner@example.com', full_name: 'Taylor Owner', password_hash: null }, error: null };
    }
    if (query.table === 'account_internal_profiles' && query.operation === 'upsert') return { data: null, error: null };
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => ({
      id: 'cs_signup', mode: 'setup', status: 'complete', customer: 'cus_signup',
      metadata: { readyroute_signup_id: 'signup-1' },
      setup_intent: { id: 'seti_signup', payment_method: { id: 'pm_signup' } }
    }) } }
  };
  const server = await startTestServer({
    supabase,
    stripeClient,
    sendRraCompanyReadyEmail: async (message) => {
      sentEmail = message;
      return { delivered: true, provider_id: 'email-1' };
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'cs_signup' })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.account_id, 'acct-new');
    assert.equal(payload.email_delivered, true);
    assert.equal(inserts[0].rra_billing_treatment, 'standard');
    assert.equal(inserts[0].rra_primary_manager_name, 'Casey Manager');
    assert.equal(inserts[0].rra_primary_manager_phone_number, '555-0199');
    assert.equal(inserts[1].full_name, 'Taylor Owner');
    assert.match(sentEmail.accessUrl, /^https:\/\/readyroute\.org\/portal\?invite=/);
    assert.equal(updates.at(-1).onboarding_status, 'email_sent');
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/complete honors the password entered for a returning manager email', async () => {
  const accessNonce = '00000000-0000-4000-8000-000000000004';
  const oldPasswordHash = await bcrypt.hash('old-password-123', 10);
  let insertedManager;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'select') {
      return { data: {
        id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', phone_number: '555-0100',
        manager_name: 'Taylor Owner', manager_phone_number: '555-0100',
        cxpc_phone_number: '555-0101', csa_number: 'CSA-0102',
        company_csa: 'New Company', role: 'Owner', driver_count: 5, billing_interval: 'monthly',
        billing_policy_version: '2026-08-15-v2', billing_consent_at: '2026-08-16T12:00:00.000Z',
        account_id: null, onboarding_status: 'pending_payment'
      }, error: null };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') return { data: null, error: null };
    if (query.table === 'accounts' && query.operation === 'select') return { data: null, error: null };
    if (query.table === 'manager_users' && query.operation === 'select') {
      return { data: { password_hash: oldPasswordHash }, error: null };
    }
    if (query.table === 'accounts' && query.operation === 'insert') {
      return { data: { id: 'acct-new', company_name: 'New Company' }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'insert') {
      insertedManager = query.payload;
      return { data: { id: 'manager-new', ...query.payload }, error: null };
    }
    if (query.table === 'account_internal_profiles' && query.operation === 'upsert') return { data: null, error: null };
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => ({
      id: 'cs_signup', mode: 'setup', status: 'complete', customer: 'cus_signup',
      metadata: {
        readyroute_signup_id: 'signup-1',
        readyroute_access_nonce_hash: hashSignupAccessNonce(accessNonce)
      },
      setup_intent: { id: 'seti_signup', payment_method: { id: 'pm_signup' } }
    }) } }
  };
  const server = await startTestServer({ supabase, stripeClient });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'cs_signup',
        access_nonce: accessNonce,
        password: 'new-password-123'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.password_created, true);
    assert.equal(payload.password_already_set, false);
    assert.equal(await bcrypt.compare('new-password-123', insertedManager.password_hash), true);
    assert.equal(await bcrypt.compare('old-password-123', insertedManager.password_hash), false);
  } finally {
    await server.close();
  }
});

test('POST /billing/signup/complete replaces a stale password when completion is retried securely', async () => {
  const accessNonce = '00000000-0000-4000-8000-000000000005';
  const oldPasswordHash = await bcrypt.hash('old-password-123', 10);
  const updates = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'early_access_signups' && query.operation === 'select') {
      return { data: {
        id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', phone_number: '555-0100',
        manager_name: 'Taylor Owner', manager_phone_number: '555-0100',
        cxpc_phone_number: '555-0101', csa_number: 'CSA-0102',
        company_csa: 'New Company', role: 'Owner', driver_count: 5, billing_interval: 'monthly',
        billing_policy_version: '2026-08-15-v2', billing_consent_at: '2026-08-16T12:00:00.000Z',
        account_id: 'acct-new', onboarding_status: 'email_sent'
      }, error: null };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') return { data: null, error: null };
    if (query.table === 'accounts' && query.operation === 'select') {
      return { data: { id: 'acct-new', company_name: 'New Company' }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'select') {
      return { data: {
        id: 'manager-new', email: 'owner@example.com', full_name: 'Taylor Owner', password_hash: oldPasswordHash
      }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'update') {
      updates.push({ table: query.table, ...query.payload });
      return { data: null, error: null };
    }
    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push({ table: query.table, ...query.payload });
      return { data: null, error: null };
    }
    if (query.table === 'account_internal_profiles' && query.operation === 'upsert') return { data: null, error: null };
    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    checkout: { sessions: { retrieve: async () => ({
      id: 'cs_signup', mode: 'setup', status: 'complete', customer: 'cus_signup',
      metadata: {
        readyroute_signup_id: 'signup-1',
        readyroute_access_nonce_hash: hashSignupAccessNonce(accessNonce)
      },
      setup_intent: { id: 'seti_signup', payment_method: { id: 'pm_signup' } }
    }) } }
  };
  const server = await startTestServer({ supabase, stripeClient });

  try {
    const response = await fetch(`${server.baseUrl}/billing/signup/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'cs_signup',
        access_nonce: accessNonce,
        password: 'new-password-123'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.password_created, true);
    assert.equal(await bcrypt.compare('new-password-123', updates[0].password_hash), true);
    assert.equal(await bcrypt.compare('new-password-123', updates[1].manager_password_hash), true);
  } finally {
    await server.close();
  }
});

test('POST /billing/setup creates a Stripe customer and subscription', async () => {
  let accountSelectCount = 0;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      accountSelectCount += 1;
      return {
        data: {
          id: 'acct-1',
          company_name: 'ReadyRoute',
          manager_email: 'boss@example.com',
          stripe_customer_id: accountSelectCount > 1 ? 'cus_123' : null,
          stripe_subscription_id: null,
          subscription_status: null,
          vehicle_count: 0,
          plan: 'starter'
        },
        error: null
      };
    }

    if (query.table === 'accounts' && query.operation === 'update') {
      return { data: null, error: null };
    }

    if (query.table === 'account_billing_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.committed_route_count, 3);
      assert.equal(query.options.onConflict, 'account_id');
      return {
        data: {
          committed_route_count: 3,
          billing_rate_cents: 1500,
          currency: 'usd',
          free_month_started_on: null,
          free_month_ends_on: null,
          is_billing_exempt: false
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const stripeClient = {
    customers: {
      create: async () => ({ id: 'cus_123' })
    },
    subscriptions: {
      create: async () => ({
        id: 'sub_123',
        status: 'incomplete',
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_secret_123'
          }
        }
      })
    },
    webhooks: {
      constructEvent: () => ({})
    }
  };

  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123'
  });

  try {
    const response = await fetch(`${server.baseUrl}/billing/setup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vehicle_count: 3 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      client_secret: 'pi_secret_123',
      subscription_id: 'sub_123'
    });
  } finally {
    await server.close();
  }
});

test('POST /billing/webhook processes Stripe test events', async () => {
  const updates = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stripe_webhook_events' && query.operation === 'insert') {
      return { data: null, error: null };
    }

    if (query.table === 'stripe_webhook_events' && query.operation === 'update') {
      return { data: null, error: null };
    }

    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const events = [
    {
      id: 'evt_subscription',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          status: 'active',
          items: { data: [{ quantity: 4 }] }
        }
      }
    },
    {
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_123'
        }
      }
    },
    {
      id: 'evt_succeeded',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          customer: 'cus_123'
        }
      }
    }
  ];

  const stripeClient = {
    customers: { create: async () => ({}) },
    subscriptions: { create: async () => ({}) },
    webhooks: {
      constructEvent: () => events.shift()
    }
  };

  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123'
  });

  try {
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${server.baseUrl}/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': 'sig_test'
        },
        body: JSON.stringify({ id: `evt_${index}` })
      });

      assert.equal(response.status, 200);
    }

    assert.deepEqual(updates[0], {
      stripe_subscription_id: 'sub_123',
      stripe_subscription_item_id: null,
      subscription_status: 'active',
      billing_activation_status: 'active',
      billed_driver_count: 4
    });
    assert.deepEqual(updates[1], {
      subscription_status: 'past_due',
      billing_activation_status: 'past_due',
      billing_access_status: 'grace_period'
    });
    assert.deepEqual(updates[2], {
      plan: 'pro',
      subscription_status: 'active',
      billing_activation_status: 'active',
      billing_access_status: 'provisioned',
      paid_through_at: null
    });
  } finally {
    await server.close();
  }
});

test('POST /billing/webhook acknowledges duplicate Stripe events without processing twice', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stripe_webhook_events' && query.operation === 'insert') {
      return { data: null, error: { code: '23505', message: 'duplicate event' } };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    webhooks: {
      constructEvent: () => ({
        id: 'evt_duplicate',
        type: 'invoice.payment_succeeded',
        data: { object: { customer: 'cus_123' } }
      })
    }
  };
  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123'
  });

  try {
    const response = await fetch(`${server.baseUrl}/billing/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'sig_test'
      },
      body: JSON.stringify({ id: 'evt_duplicate' })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true, duplicate: true });
  } finally {
    await server.close();
  }
});

test('suspended accounts get 402 on manager-owned routes', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: { id: 'acct-1', plan: 'suspended' },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const stripeClient = {
    customers: { create: async () => ({}) },
    subscriptions: { create: async () => ({}) },
    webhooks: { constructEvent: () => ({}) }
  };

  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123',
    enforceBilling: true
  });

  try {
    const requests = [
      { path: '/manager/drivers', options: { method: 'GET' } },
      { path: '/routes/pull-fedex', options: { method: 'POST' } },
      { path: '/vehicles', options: { method: 'GET' } }
    ];

    for (const request of requests) {
      const response = await fetch(`${server.baseUrl}${request.path}`, {
        ...request.options,
        headers: {
          Authorization: `Bearer ${signManagerToken()}`
        }
      });

      assert.equal(response.status, 402, request.path);
      assert.deepEqual(await response.json(), {
        error: 'Subscription payment failed. Update payment method.'
      });
    }
  } finally {
    await server.close();
  }
});

test('missing accounts fail closed on subscription-protected routes', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const stripeClient = {
    customers: { create: async () => ({}) },
    subscriptions: { create: async () => ({}) },
    webhooks: { constructEvent: () => ({}) }
  };

  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123',
    enforceBilling: true
  });

  try {
    const response = await fetch(`${server.baseUrl}/vehicles`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Account is not available'
    });
  } finally {
    await server.close();
  }
});

test('retained accounts are read-only on subscription-protected routes', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          plan: 'pro',
          account_status: 'retained',
          service_ends_at: '2026-07-01T00:00:00.000Z',
          retention_ends_at: '2026-09-01T00:00:00.000Z'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const stripeClient = {
    customers: { create: async () => ({}) },
    subscriptions: { create: async () => ({}) },
    webhooks: { constructEvent: () => ({}) }
  };
  const server = await startTestServer({
    supabase,
    stripeClient,
    webhookSecret: 'whsec_test',
    stripePriceId: 'price_123',
    enforceBilling: true
  });

  try {
    const response = await fetch(`${server.baseUrl}/routes/pull-fedex`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${signManagerToken()}` }
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'This ReadyRoute workspace is in its data-retention period and is read-only.',
      account_status: 'retained',
      retention_ends_at: '2026-09-01T00:00:00.000Z'
    });
  } finally {
    await server.close();
  }
});
