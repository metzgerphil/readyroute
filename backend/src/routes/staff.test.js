const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
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
    this.state.upsertOptions = options;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  order(column, options = {}) {
    this.state.order = { column, options };
    return this;
  }

  limit(value) {
    this.state.limit = value;
    return this;
  }

  single() {
    return this.execute('single');
  }

  maybeSingle() {
    return this.execute('maybeSingle');
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

function signManagerToken() {
  return jwt.sign(
    {
      account_id: 'acct-1',
      manager_user_id: 'manager-1',
      manager_email: 'manager@example.com',
      role: 'manager'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function signStaffToken(overrides = {}) {
  return jwt.sign(
    {
      staff_user_id: overrides.staff_user_id || 'staff-1',
      staff_email: overrides.staff_email || 'admin@readyroute.org',
      staff_name: overrides.staff_name || 'ReadyRoute Admin',
      staff_role: overrides.staff_role || 'owner',
      primary_role: 'readyroute_staff',
      role: 'readyroute_staff'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer({ supabase }) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    now: () => new Date('2026-07-05T16:00:00.000Z'),
    enforceBilling: false
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

test('POST /staff/login returns a ReadyRoute staff token', async () => {
  const passwordHash = await bcrypt.hash('supersecure123', 10);
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true,
          created_at: '2026-07-05T15:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'update') {
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ADMIN@readyroute.org',
        password: 'supersecure123'
      })
    });
    const payload = await response.json();
    const decoded = jwt.verify(payload.token, process.env.JWT_SECRET);

    assert.equal(response.status, 200);
    assert.equal(decoded.role, 'readyroute_staff');
    assert.equal(decoded.staff_role, 'owner');
    assert.equal(payload.user.email, 'admin@readyroute.org');
  } finally {
    await server.close();
  }
});

test('GET /staff/accounts rejects customer manager tokens', async () => {
  const supabase = new MockSupabase(() => ({ data: null, error: null }));
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/accounts`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.error, 'ReadyRoute staff access required');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('GET /staff/accounts returns CRM account summaries for staff', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts') {
      return {
        data: [
          {
            id: 'acct-1',
            company_name: 'Bridge Transportation',
            manager_email: 'owner@example.com',
            subscription_status: 'active',
            plan: 'starter',
            vehicle_count: 12,
            stripe_customer_id: 'cus_123',
            stripe_subscription_id: 'sub_123',
            created_at: '2026-07-01T12:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'account_internal_profiles') {
      return {
        data: [
          {
            account_id: 'acct-1',
            lifecycle_status: 'onboarding',
            onboarding_stage: 'FedEx setup',
            internal_notes: 'Needs route import help.',
            updated_at: '2026-07-05T15:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'manager_users') {
      return { data: [{ account_id: 'acct-1', is_active: true }], error: null };
    }

    if (query.table === 'drivers') {
      return { data: [{ account_id: 'acct-1', is_active: true }, { account_id: 'acct-1', is_active: false }], error: null };
    }

    if (query.table === 'support_tickets') {
      return {
        data: [
          {
            id: 'ticket-1',
            account_id: 'acct-1',
            ticket_reference: 'RR-TEST',
            subject: 'Inspection photo missing',
            status: 'new',
            priority: 'urgent',
            created_at: '2026-07-05T16:00:00.000Z'
          }
        ],
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/accounts`, {
      headers: {
        Authorization: `Bearer ${signStaffToken({ staff_role: 'support' })}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.accounts.length, 1);
    assert.equal(payload.accounts[0].internal_profile.lifecycle_status, 'onboarding');
    assert.equal(payload.accounts[0].counts.active_managers, 1);
    assert.equal(payload.accounts[0].counts.active_drivers, 1);
    assert.equal(payload.accounts[0].counts.open_support_tickets, 1);
    assert.equal(payload.accounts[0].counts.urgent_support_tickets, 1);
  } finally {
    await server.close();
  }
});

test('POST /staff/bootstrap creates the first staff user when the bootstrap secret matches', async () => {
  const originalSecret = process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET;
  process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET = 'bootstrap-secret';

  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'insert') {
      assert.equal(query.payload.email, 'owner@readyroute.org');
      assert.equal(query.payload.role, 'owner');
      assert.ok(query.payload.password_hash);

      return {
        data: {
          id: 'staff-owner',
          email: query.payload.email,
          full_name: query.payload.full_name,
          role: query.payload.role,
          is_active: true,
          invited_at: query.payload.invited_at,
          accepted_at: query.payload.accepted_at,
          created_at: query.payload.created_at,
          updated_at: query.payload.updated_at
        },
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadyRoute-Bootstrap-Secret': 'bootstrap-secret'
      },
      body: JSON.stringify({
        email: 'owner@readyroute.org',
        full_name: 'Owner User',
        password: 'supersecure123',
        role: 'owner'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.staff_user.email, 'owner@readyroute.org');
  } finally {
    if (originalSecret == null) {
      delete process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET;
    } else {
      process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET = originalSecret;
    }
    await server.close();
  }
});
