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
    if (this.operation === 'insert' || this.operation === 'update') {
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
      role: 'manager',
      manager_role: overrides.manager_role || 'owner'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer({ supabase, now }) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    now,
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

test('GET /api/vedr/settings returns an empty shape when no record exists', async () => {
  const supabase = new MockSupabase((query) => {
    assert.equal(query.table, 'vedr_settings');
    assert.equal(query.operation, 'select');
    return { data: null, error: null };
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      provider: null,
      connection_status: 'not_started',
      provider_selected_at: null,
      connection_started_at: null,
      connection_verified_at: null,
      setup_completed_at: null
    });
  } finally {
    await server.close();
  }
});

test('PUT /api/vedr/settings creates settings and moves the account into waiting_for_login', async () => {
  const now = () => new Date('2026-04-17T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vedr_settings' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'vedr_settings' && query.operation === 'insert') {
      assert.deepEqual(query.payload, {
        account_id: 'acct-1',
        provider: 'groundcloud',
        connection_status: 'waiting_for_login',
        provider_selected_at: '2026-04-17T18:00:00.000Z',
        connection_started_at: '2026-04-17T18:00:00.000Z',
        connection_verified_at: null,
        setup_completed_at: null
      });

      return {
        data: {
          id: 'vedr-1',
          account_id: 'acct-1',
          provider: 'groundcloud',
          connection_status: 'waiting_for_login',
          provider_selected_at: '2026-04-17T18:00:00.000Z',
          connection_started_at: '2026-04-17T18:00:00.000Z',
          connection_verified_at: null,
          setup_completed_at: null,
          created_at: '2026-04-17T18:00:00.000Z',
          updated_at: '2026-04-17T18:00:00.000Z'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'groundcloud' })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      provider: 'groundcloud',
      connection_status: 'waiting_for_login',
      provider_selected_at: '2026-04-17T18:00:00.000Z',
      connection_started_at: '2026-04-17T18:00:00.000Z',
      connection_verified_at: null,
      setup_completed_at: null,
      id: 'vedr-1',
      account_id: 'acct-1',
      created_at: '2026-04-17T18:00:00.000Z',
      updated_at: '2026-04-17T18:00:00.000Z'
    });
  } finally {
    await server.close();
  }
});

test('PUT /api/vedr/settings preserves verified timestamps while re-entering waiting_for_login on provider change', async () => {
  const now = () => new Date('2026-04-17T19:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vedr_settings' && query.operation === 'select') {
      return {
        data: {
          id: 'vedr-1',
          account_id: 'acct-1',
          provider: 'groundcloud',
          connection_status: 'connected',
          provider_selected_at: '2026-04-17T18:00:00.000Z',
          connection_started_at: '2026-04-17T18:00:00.000Z',
          connection_verified_at: '2026-04-17T18:10:00.000Z',
          setup_completed_at: '2026-04-17T18:00:00.000Z',
          created_at: '2026-04-17T18:00:00.000Z',
          updated_at: '2026-04-17T18:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'vedr_settings' && query.operation === 'update') {
      assert.deepEqual(query.payload, {
        provider: 'velocitor',
        connection_status: 'waiting_for_login',
        provider_selected_at: '2026-04-17T18:00:00.000Z',
        connection_started_at: '2026-04-17T19:00:00.000Z',
        connection_verified_at: '2026-04-17T18:10:00.000Z',
        setup_completed_at: '2026-04-17T18:00:00.000Z',
        updated_at: '2026-04-17T19:00:00.000Z'
      });

      return {
        data: {
          id: 'vedr-1',
          account_id: 'acct-1',
          provider: 'velocitor',
          connection_status: 'waiting_for_login',
          provider_selected_at: '2026-04-17T18:00:00.000Z',
          connection_started_at: '2026-04-17T19:00:00.000Z',
          connection_verified_at: '2026-04-17T18:10:00.000Z',
          setup_completed_at: '2026-04-17T18:00:00.000Z',
          created_at: '2026-04-17T18:00:00.000Z',
          updated_at: '2026-04-17T19:00:00.000Z'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'velocitor' })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      provider: 'velocitor',
      connection_status: 'waiting_for_login',
      provider_selected_at: '2026-04-17T18:00:00.000Z',
      connection_started_at: '2026-04-17T19:00:00.000Z',
      connection_verified_at: '2026-04-17T18:10:00.000Z',
      setup_completed_at: '2026-04-17T18:00:00.000Z',
      id: 'vedr-1',
      account_id: 'acct-1',
      created_at: '2026-04-17T18:00:00.000Z',
      updated_at: '2026-04-17T19:00:00.000Z'
    });
  } finally {
    await server.close();
  }
});

test('POST /api/vedr/settings/mark-connected marks the provider as connected', async () => {
  const now = () => new Date('2026-04-17T18:15:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vedr_settings' && query.operation === 'select') {
      return {
        data: {
          id: 'vedr-1',
          account_id: 'acct-1',
          provider: 'groundcloud',
          connection_status: 'waiting_for_login',
          provider_selected_at: '2026-04-17T18:00:00.000Z',
          connection_started_at: '2026-04-17T18:00:00.000Z',
          connection_verified_at: null,
          setup_completed_at: null,
          created_at: '2026-04-17T18:00:00.000Z',
          updated_at: '2026-04-17T18:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'vedr_settings' && query.operation === 'update') {
      assert.deepEqual(query.payload, {
        connection_status: 'connected',
        connection_verified_at: '2026-04-17T18:15:00.000Z',
        setup_completed_at: '2026-04-17T18:15:00.000Z',
        updated_at: '2026-04-17T18:15:00.000Z'
      });

      return {
        data: {
          id: 'vedr-1',
          account_id: 'acct-1',
          provider: 'groundcloud',
          connection_status: 'connected',
          provider_selected_at: '2026-04-17T18:00:00.000Z',
          connection_started_at: '2026-04-17T18:00:00.000Z',
          connection_verified_at: '2026-04-17T18:15:00.000Z',
          setup_completed_at: '2026-04-17T18:15:00.000Z',
          created_at: '2026-04-17T18:00:00.000Z',
          updated_at: '2026-04-17T18:15:00.000Z'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings/mark-connected`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      provider: 'groundcloud',
      connection_status: 'connected',
      provider_selected_at: '2026-04-17T18:00:00.000Z',
      connection_started_at: '2026-04-17T18:00:00.000Z',
      connection_verified_at: '2026-04-17T18:15:00.000Z',
      setup_completed_at: '2026-04-17T18:15:00.000Z',
      id: 'vedr-1',
      account_id: 'acct-1',
      created_at: '2026-04-17T18:00:00.000Z',
      updated_at: '2026-04-17T18:15:00.000Z'
    });
  } finally {
    await server.close();
  }
});

test('PUT /api/vedr/settings rejects invalid providers', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Supabase should not be called for invalid input');
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'other' })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Invalid VEDR settings',
      details: {
        provider: 'provider must be one of: groundcloud, velocitor'
      }
    });
  } finally {
    await server.close();
  }
});

test('GET /api/vedr/settings requires admin or owner manager role', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Supabase should not be called for forbidden requests');
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/api/vedr/settings`, {
      headers: {
        Authorization: `Bearer ${signManagerToken({ manager_role: 'viewer' })}`
      }
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Admin or owner access required'
    });
  } finally {
    await server.close();
  }
});
