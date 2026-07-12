const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createAuthMiddleware } = require('./auth');
const {
  SESSION_SUBJECT_TYPES,
  buildCredentialSessionClaims
} = require('../services/credentialSession');

function createDriverSupabase(driver) {
  return {
    from(table) {
      assert.equal(table, 'drivers');
      return {
        select() { return this; },
        eq(column, value) {
          assert.equal(column, 'id');
          assert.equal(value, driver.id);
          return this;
        },
        async maybeSingle() {
          return { data: { ...driver }, error: null };
        }
      };
    }
  };
}

function signDriverToken(driver, credentialHash = driver.pin) {
  return jwt.sign({
    driver_id: driver.id,
    account_id: driver.account_id,
    name: 'Driver One',
    role: 'driver',
    ...buildCredentialSessionClaims({
      subjectType: SESSION_SUBJECT_TYPES.DRIVER,
      subjectId: driver.id,
      credentialHash
    })
  }, 'session-test-secret', { expiresIn: '12h' });
}

function createDriverApp(driver) {
  const app = express();
  const { requireDriver } = createAuthMiddleware({
    supabase: createDriverSupabase(driver),
    jwtSecret: 'session-test-secret',
    enforceSessionValidation: true
  });
  app.get('/private', requireDriver, (req, res) => res.status(200).json(req.driver));
  return app;
}

test('credential session accepts the current active driver PIN version', async () => {
  const driver = { id: 'driver-1', account_id: 'acct-1', pin: 'hash-current', is_active: true };
  const response = await request(createDriverApp(driver))
    .get('/private')
    .set('Authorization', `Bearer ${signDriverToken(driver)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.driver_id, 'driver-1');
});

test('credential session ends immediately after the driver PIN hash changes', async () => {
  const driver = { id: 'driver-1', account_id: 'acct-1', pin: 'hash-new', is_active: true };
  const response = await request(createDriverApp(driver))
    .get('/private')
    .set('Authorization', `Bearer ${signDriverToken(driver, 'hash-old')}`);

  assert.equal(response.status, 401);
  assert.match(response.body.error, /sign in again/i);
});

test('credential session ends immediately when the driver is disabled', async () => {
  const driver = { id: 'driver-1', account_id: 'acct-1', pin: 'hash-current', is_active: false };
  const response = await request(createDriverApp(driver))
    .get('/private')
    .set('Authorization', `Bearer ${signDriverToken(driver)}`);

  assert.equal(response.status, 401);
});
