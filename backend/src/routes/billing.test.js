const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

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

async function startTestServer({ supabase, stripeClient, webhookSecret, stripePriceId, enforceBilling = false }) {
  const app = createApp({
    supabase,
    stripeClient,
    webhookSecret,
    stripePriceId,
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
    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push(query.payload);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const events = [
    {
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
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_123'
        }
      }
    },
    {
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
      subscription_status: 'active',
      vehicle_count: 4
    });
    assert.deepEqual(updates[1], {
      plan: 'suspended',
      subscription_status: 'past_due'
    });
    assert.deepEqual(updates[2], {
      plan: 'pro',
      subscription_status: 'active'
    });
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
