const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-secret';

const { createApp } = require('../app');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = { table, payload: undefined, upsertOptions: undefined, columns: null };
  }

  upsert(payload, options = {}) {
    this.operation = 'upsert';
    this.state.payload = payload;
    this.state.upsertOptions = options;
    return this;
  }

  select(columns) { this.state.columns = columns; return this; }
  single() { return this.execute('single'); }
  execute(mode) { return Promise.resolve(this.supabase.execute({ table: this.table, operation: this.operation, mode, ...this.state })); }
}

class MockSupabase {
  constructor(handler) { this.handler = handler; this.calls = []; }
  from(table) { return new MockQueryBuilder(this, table); }
  execute(query) { this.calls.push(query); return this.handler(query, this.calls); }
}

async function startTestServer(supabase, options = {}) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    enforceBilling: false,
    ...options
  });
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
}

test('POST /waitlist/early-access stores signup details and automatically creates the company', async () => {
  const onboarded = [];
  const signup = {
    id: 'signup-1',
    name: 'Phillip',
    email: 'phil@example.com',
    company_csa: 'Ready Route CSA',
    role: 'Owner',
    driver_count: 12,
    account_id: null,
    billing_interval: 'annual'
  };
  const supabase = new MockSupabase((query) => {
    assert.equal(query.table, 'early_access_signups');
    assert.equal(query.operation, 'upsert');
    assert.equal(query.upsertOptions.onConflict, 'email');
    assert.equal(query.payload.name, 'Phillip');
    assert.equal(query.payload.email, 'phil@example.com');
    assert.equal(query.payload.phone_number, '555-123-4567');
    assert.equal(query.payload.company_csa, 'Ready Route CSA');
    assert.equal(query.payload.role, 'Owner');
    assert.equal(query.payload.route_count, null);
    assert.equal(query.payload.driver_count, 12);
    assert.equal(query.payload.csa_count, 2);
    assert.equal(query.payload.current_routing_tool, 'GroundCloud');
    assert.equal(query.payload.interested_in_beta, true);
    assert.equal(query.payload.billing_interval, 'annual');
    return { data: signup, error: null };
  });
  const server = await startTestServer(supabase, {
    companySignupOnboarding: {
      onboardSignup: async (row) => {
        onboarded.push(row);
        return { account: { id: 'acct-1' }, already_onboarded: false, invitation: { email_delivery: 'sent' } };
      }
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/waitlist/early-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phillip', email: 'PHIL@example.com', phone: '555-123-4567', company: 'Ready Route CSA',
        role: 'Owner', drivers: '12', csas: '2', tool: 'GroundCloud', beta: 'Yes', billing_interval: 'annual'
      })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      ok: true,
      account_created: true,
      account_id: 'acct-1',
      already_onboarded: false,
      invitation: { email_delivery: 'sent' }
    });
    assert.deepEqual(onboarded, [signup]);
  } finally {
    await server.close();
  }
});

test('POST /waitlist/early-access validates required fields', async () => {
  const supabase = new MockSupabase(() => { throw new Error('Supabase should not be called for invalid payloads'); });
  const server = await startTestServer(supabase, {
    companySignupOnboarding: { onboardSignup: async () => { throw new Error('Onboarding should not run'); } }
  });
  try {
    const response = await fetch(`${server.baseUrl}/waitlist/early-access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '', email: 'bad-email' })
    });
    assert.equal(response.status, 400);
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('POST /waitlist/early-access permits only owner or business contact roles', async () => {
  const supabase = new MockSupabase(() => { throw new Error('Supabase should not be called for a disallowed role'); });
  const server = await startTestServer(supabase, {
    companySignupOnboarding: { onboardSignup: async () => { throw new Error('Onboarding should not run'); } }
  });
  try {
    const response = await fetch(`${server.baseUrl}/waitlist/early-access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Taylor', email: 'taylor@example.com', phone: '555-0100', company: 'Taylor Transport', role: 'Manager', drivers: 10 })
    });
    assert.equal(response.status, 400);
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('POST /waitlist/feedback sends contractor feedback to ReadyRoute', async () => {
  const supabase = new MockSupabase(() => { throw new Error('Supabase should not be called for feedback emails'); });
  const sentFeedback = [];
  const server = await startTestServer(supabase, {
    companySignupOnboarding: { onboardSignup: async () => ({}) },
    sendFeedbackEmail: async (payload) => {
      sentFeedback.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });
  try {
    const response = await fetch(`${server.baseUrl}/waitlist/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taylor Driver', email: 'TAYLOR@example.com', position: 'FedEx BC',
        feedback: 'The driver map should make apartments easier to sort.', source_page: 'https://www.readyroute.org/mvp'
      })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(sentFeedback.length, 1);
    assert.equal(sentFeedback[0].name, 'Taylor Driver');
    assert.equal(sentFeedback[0].email, 'taylor@example.com');
    assert.equal(sentFeedback[0].fedexPosition, 'FedEx BC');
    assert.match(sentFeedback[0].feedback, /apartments/);
  } finally {
    await server.close();
  }
});

test('POST /waitlist/feedback validates required fields', async () => {
  const supabase = new MockSupabase(() => { throw new Error('Supabase should not be called for invalid feedback'); });
  const server = await startTestServer(supabase, {
    companySignupOnboarding: { onboardSignup: async () => ({}) },
    sendFeedbackEmail: async () => { throw new Error('Email should not be sent for invalid feedback'); }
  });
  try {
    const response = await fetch(`${server.baseUrl}/waitlist/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', email: 'bad-email', position: '', feedback: 'short' })
    });
    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});
