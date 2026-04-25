const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { createApp } = require('../app');

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
