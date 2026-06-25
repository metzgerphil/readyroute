const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const axios = require('axios');

process.env.JWT_SECRET = 'test-secret';
process.env.GOOGLE_MAPS_API_KEY = '';

const { createApp } = require('../app');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
      orders: [],
      columns: null
    };
  }

  select(columns) {
    this.operation = 'select';
    this.state.columns = columns;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  order(column, options = {}) {
    this.state.orders.push({ column, options });
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.supabase.execute({
      table: this.table,
      operation: this.operation,
      ...this.state
    })).then(resolve, reject);
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

function signDriverToken(overrides = {}) {
  return jwt.sign(
    {
      driver_id: overrides.driver_id || 'driver-1',
      account_id: overrides.account_id || 'acct-1',
      name: 'Driver One',
      role: 'driver'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer(supabase, now = () => new Date('2026-01-02T08:00:00.000Z')) {
  const app = createApp({ supabase, jwtSecret: process.env.JWT_SECRET, now, enforceBilling: false });
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

test('GET /safety-focuses/today rotates active safety focuses by calendar day', async () => {
  const supabase = new MockSupabase((query) => {
    assert.equal(query.table, 'safety_focuses');
    assert.deepEqual(query.filters, [{ op: 'eq', column: 'is_active', value: true }]);

    return {
      data: [
        {
          id: 'focus-1',
          slug: 'pretrip',
          title: 'Pre-trip finds problems before the road does',
          source: 'Driver Safety Guidebook',
          bullets: ['Check brakes.', 'Check tires.'],
          takeaway: 'Fix it before leaving.',
          sort_order: 10
        },
        {
          id: 'focus-2',
          slug: 'parking-brake',
          title: 'Set the parking brake every time',
          source: 'Employee Safety and Operation Handbook',
          bullets: ['Use it at every stop.'],
          takeaway: null,
          sort_order: 20
        }
      ],
      error: null
    };
  });
  const server = await startTestServer(supabase, () => new Date('2026-01-02T08:00:00.000Z'));

  try {
    const response = await axios.get(`${server.baseUrl}/safety-focuses/today`, {
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data.safety_focus, {
      id: 'parking-brake',
      title: 'Set the parking brake every time',
      source: 'Employee Safety and Operation Handbook',
      bullets: ['Use it at every stop.'],
      takeaway: null
    });
  } finally {
    await server.close();
  }
});

test('GET /safety-focuses/today returns null focus when the safety table is not installed yet', async () => {
  const supabase = new MockSupabase(() => ({
    data: null,
    error: {
      code: '42P01',
      message: 'relation "safety_focuses" does not exist'
    }
  }));
  const server = await startTestServer(supabase);

  try {
    const response = await axios.get(`${server.baseUrl}/safety-focuses/today`, {
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { safety_focus: null });
  } finally {
    await server.close();
  }
});

test('GET /safety-focuses/today requires driver authentication', async () => {
  const supabase = new MockSupabase(() => ({ data: [], error: null }));
  const server = await startTestServer(supabase);

  try {
    await assert.rejects(
      axios.get(`${server.baseUrl}/safety-focuses/today`),
      (error) => {
        assert.equal(error.response.status, 401);
        return true;
      }
    );
  } finally {
    await server.close();
  }
});
