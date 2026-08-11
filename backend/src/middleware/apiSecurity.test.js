const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = 'api-security-test-secret';

const { createApp } = require('../app');
const { createDriverPositionLimiter } = require('./apiSecurity');
const { parseMultipartForm } = require('./multipart');

function createTestApp(options = {}) {
  return createApp({
    supabase: {
      from() {
        throw new Error('Database access was not expected in API security tests.');
      }
    },
    jwtSecret: process.env.JWT_SECRET,
    enforceBilling: false,
    ...options
  });
}

test('API responses include security headers without exposing Express', async () => {
  const response = await request(createTestApp({ rateLimitEnabled: false })).get('/health');

  assert.equal(response.status, 200);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('production CORS rejects unknown origins with a generic response', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const response = await request(createTestApp({ rateLimitEnabled: false }))
      .get('/health')
      .set('Origin', 'https://malicious.example');

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: 'Origin is not allowed.' });
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  } finally {
    if (originalNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test('invalid JSON and oversized ordinary payloads fail with bounded client errors', async () => {
  const app = createTestApp({ rateLimitEnabled: false });
  const invalidJson = await request(app)
    .post('/auth/manager/login')
    .set('Content-Type', 'application/json')
    .send('{invalid');
  const oversized = await request(app)
    .post('/auth/manager/login')
    .send({ email: `${'a'.repeat(1024 * 1024)}@example.com` });

  assert.equal(invalidJson.status, 400);
  assert.deepEqual(invalidJson.body, { error: 'Request body contains invalid JSON.' });
  assert.equal(oversized.status, 413);
  assert.deepEqual(oversized.body, { error: 'Request payload is too large.' });
});

test('inspection photo routes accept payloads above the ordinary limit before authentication', async () => {
  const response = await request(createTestApp({ rateLimitEnabled: false }))
    .post('/routes/inspection-photo')
    .send({ image_base64: 'a'.repeat(2 * 1024 * 1024) });

  assert.equal(response.status, 401);
  assert.notEqual(response.body.error, 'Request payload is too large.');
});

test('multipart uploads reject declared payloads above 12 MB before buffering', async () => {
  const app = express();
  app.post('/upload', parseMultipartForm, (_req, res) => res.status(200).json({ ok: true }));

  const response = await request(app)
    .post('/upload')
    .set('Content-Type', 'multipart/form-data; boundary=readyroute-test')
    .set('Content-Length', String(13 * 1024 * 1024))
    .send('--readyroute-test--');

  assert.equal(response.status, 413);
  assert.deepEqual(response.body, { error: 'Upload must be 12 MB or smaller.' });
});

test('repeated failed logins return a standard rate-limit response', async () => {
  const app = createTestApp({ rateLimits: { login: 2 } });
  const first = await request(app).post('/auth/manager/login').send({});
  const second = await request(app).post('/auth/manager/login').send({});
  const limited = await request(app).post('/auth/manager/login').send({});

  assert.equal(first.status, 400);
  assert.equal(second.status, 400);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.equal(limited.body.limit, 'login');
  assert.ok(limited.headers.ratelimit);
  assert.ok(limited.headers['retry-after']);
});

test('driver password links are rate limited by token without exposing the token', async () => {
  const app = createTestApp({ rateLimits: { passwordReset: 2 } });
  const payload = { token: 'sensitive-driver-invite-token', password: 'ValidPassword!2026' };
  const first = await request(app).post('/auth/driver/accept-invite').send(payload);
  const second = await request(app).post('/auth/driver/accept-invite').send(payload);
  const limited = await request(app).post('/auth/driver/accept-invite').send(payload);

  assert.equal(first.status, 400);
  assert.equal(second.status, 400);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.equal(limited.body.limit, 'password_reset');
  assert.equal(JSON.stringify(limited.body).includes(payload.token), false);
});

test('driver position limits are isolated by verified driver id', async () => {
  const app = express();
  const limiter = createDriverPositionLimiter({ limit: 2 });
  app.use(express.json());
  app.post('/position', (req, _res, next) => {
    req.driver = { driver_id: req.get('x-test-driver') };
    next();
  }, limiter, (_req, res) => res.status(200).json({ ok: true }));

  assert.equal((await request(app).post('/position').set('x-test-driver', 'driver-1')).status, 200);
  assert.equal((await request(app).post('/position').set('x-test-driver', 'driver-1')).status, 200);
  assert.equal((await request(app).post('/position').set('x-test-driver', 'driver-1')).status, 429);
  assert.equal((await request(app).post('/position').set('x-test-driver', 'driver-2')).status, 200);
});
