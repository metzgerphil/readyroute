const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createRequestObservability } = require('./observability');

function buildApp(logs) {
  const app = express();
  let clock = 0n;
  app.use(createRequestObservability({
    log: (record) => logs.push(record),
    randomUUID: () => 'generated-request-id',
    now: () => {
      clock += 5_000_000n;
      return clock;
    }
  }));
  app.get('/ok', (req, res) => {
    req.account = { account_id: 'account-1', manager_user_id: 'manager-1', role: 'manager' };
    res.status(200).json({ ok: true });
  });
  app.post('/routes/position', (_req, res) => res.status(200).json({ ok: true }));
  app.post('/routes/position/fail', (_req, res) => res.status(503).json({ ok: false }));
  return app;
}

test('request observability returns a stable request id and structured identity', async () => {
  const logs = [];
  const response = await request(buildApp(logs)).get('/ok').set('X-Request-ID', 'client-request-123');

  assert.equal(response.headers['x-request-id'], 'client-request-123');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].request_id, 'client-request-123');
  assert.equal(logs[0].account_id, 'account-1');
  assert.equal(logs[0].manager_user_id, 'manager-1');
  assert.equal(logs[0].httpRequest.requestUrl, '/ok');
  assert.equal(logs[0].httpRequest.status, 200);
  assert.equal(Object.hasOwn(logs[0], 'body'), false);
});

test('invalid inbound request ids are replaced', async () => {
  const logs = [];
  const response = await request(buildApp(logs)).get('/ok').set('X-Request-ID', 'contains spaces');

  assert.equal(response.headers['x-request-id'], 'generated-request-id');
  assert.equal(logs[0].request_id, 'generated-request-id');
});

test('successful position updates are not logged but position failures are', async () => {
  const logs = [];
  const app = buildApp(logs);

  await request(app).post('/routes/position').send({ latitude: 1, longitude: 2 });
  await request(app).post('/routes/position/fail').send({ latitude: 1, longitude: 2 });

  assert.equal(logs.length, 1);
  assert.equal(logs[0].severity, 'ERROR');
  assert.equal(logs[0].httpRequest.requestUrl, '/routes/position/fail');
  assert.equal(Object.hasOwn(logs[0], 'latitude'), false);
});
