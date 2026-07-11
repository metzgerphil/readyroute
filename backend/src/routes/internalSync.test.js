const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { createApp } = require('../app');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = { filters: [], payload: undefined };
  }

  select() {
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ column, value });
    return this;
  }

  in(column, value) {
    this.state.filters.push({ column, value });
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.supabase.handler({
      table: this.table,
      operation: this.operation,
      ...this.state
    })).then(resolve, reject);
  }
}

class MockSupabase {
  constructor(handler) {
    this.handler = handler;
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }
}

async function startTestServer(appOptions = {}) {
  const app = createApp({
    enforceBilling: false,
    ...appOptions
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

test('POST /internal/fedex-sync rejects requests without the worker secret', async () => {
  const server = await startTestServer({
    fedexSyncWorkerSecret: 'worker-secret',
    fedexSyncService: {
      async runScheduledAutomationCycle() {
        throw new Error('should not run');
      }
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/internal/fedex-sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'auto' })
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Invalid FedEx sync worker secret.' });
  } finally {
    await server.close();
  }
});

test('POST /internal/fedex-sync auto runs the scheduled automation cycle', async () => {
  const calls = [];
  const server = await startTestServer({
    fedexSyncWorkerSecret: 'worker-secret',
    fedexSyncService: {
      async runScheduledAutomationCycle(input) {
        calls.push(input);
        return {
          trigger: 'automation_cycle',
          processed_accounts: 1,
          failed_runs: 0,
          changed_runs: 1,
          manifests: { changed_runs: 1 },
          progress: { changed_runs: 0 }
        };
      }
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/internal/fedex-sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer worker-secret'
      },
      body: JSON.stringify({ mode: 'auto', account_ids: ['acct-1'] })
    });
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.mode, 'auto');
    assert.equal(body.trigger, 'automation_cycle');
    assert.equal(body.changed_runs, 1);
    assert.deepEqual(calls, [{ accountIds: ['acct-1'] }]);
  } finally {
    await server.close();
  }
});

test('GET /internal/fedex-sync can trigger progress mode for cron services', async () => {
  const calls = [];
  const server = await startTestServer({
    fedexSyncWorkerSecret: 'worker-secret',
    fedexSyncService: {
      async runScheduledProgressSync(input) {
        calls.push(input);
        return {
          trigger: 'progress_sync',
          processed_accounts: 1,
          changed_runs: 0
        };
      }
    }
  });

  try {
    const response = await fetch(
      `${server.baseUrl}/internal/fedex-sync?mode=progress&account_ids=acct-1,acct-2`,
      {
        headers: {
          'x-readyroute-worker-secret': 'worker-secret'
        }
      }
    );
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.equal(body.mode, 'progress');
    assert.equal(body.progress.trigger, 'progress_sync');
    assert.deepEqual(calls, [{ accountIds: ['acct-1', 'acct-2'] }]);
  } finally {
    await server.close();
  }
});

test('POST /internal/account-retention-sweep transitions expired cancellations without purging data', async () => {
  const updates = [];
  const events = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'acct-retain',
            account_status: 'canceling',
            service_ends_at: '2026-07-10T00:00:00.000Z',
            retention_ends_at: '2026-09-08T00:00:00.000Z'
          },
          {
            id: 'acct-purge-review',
            account_status: 'retained',
            service_ends_at: '2026-05-01T00:00:00.000Z',
            retention_ends_at: '2026-06-30T00:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'accounts' && query.operation === 'update') {
      updates.push(query);
      return { data: null, error: null };
    }

    if (query.table === 'account_cancellation_events' && query.operation === 'insert') {
      events.push(query.payload);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const server = await startTestServer({
    supabase,
    accountLifecycleWorkerSecret: 'lifecycle-secret',
    now: () => new Date('2026-07-11T00:00:00.000Z'),
    fedexSyncService: {
      async runScheduledAutomationCycle() {
        return {};
      }
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/internal/account-retention-sweep`, {
      method: 'POST',
      headers: { authorization: 'Bearer lifecycle-secret' }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.transitioned_to_retained, 1);
    assert.deepEqual(body.transition_account_ids, ['acct-retain']);
    assert.equal(body.purge_eligible, 1);
    assert.deepEqual(body.purge_eligible_account_ids, ['acct-purge-review']);
    assert.equal(body.automatic_purge_enabled, false);
    assert.equal(updates[0].payload.account_status, 'retained');
    assert.equal(events[0].event_type, 'retained');
  } finally {
    await server.close();
  }
});
