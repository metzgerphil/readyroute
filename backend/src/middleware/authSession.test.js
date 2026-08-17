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

function createDriverSupabase(driver, deviceSession = null) {
  return {
    from(table) {
      assert.ok(['drivers', 'driver_authorized_devices'].includes(table));
      const row = table === 'drivers' ? driver : deviceSession;
      return {
        select() { return this; },
        eq(column, value) {
          if (column === 'id') {
            assert.equal(value, row?.id);
          }
          return this;
        },
        async maybeSingle() {
          return { data: row ? { ...row } : null, error: null };
        }
      };
    }
  };
}

function signDriverToken(driver, credentialHash = driver.pin, deviceSession = null) {
  return jwt.sign({
    driver_id: driver.id,
    account_id: driver.account_id,
    name: 'Driver One',
    role: 'driver',
    ...(deviceSession ? {
      device_session_id: deviceSession.id,
      device_hash: deviceSession.device_hash
    } : {}),
    ...buildCredentialSessionClaims({
      subjectType: SESSION_SUBJECT_TYPES.DRIVER,
      subjectId: driver.id,
      credentialHash
    })
  }, 'session-test-secret', { expiresIn: '12h' });
}

function createDriverApp(driver, deviceSession = null) {
  const app = express();
  const { requireDriver } = createAuthMiddleware({
    supabase: createDriverSupabase(driver, deviceSession),
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
  assert.equal(response.body.driver_mode_source, 'driver');
  assert.equal(response.body.auth_subject_id, 'driver-1');
  assert.equal(response.body.auth_subject_type, SESSION_SUBJECT_TYPES.DRIVER);
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

test('driver session remains valid only for the currently authorized phone', async () => {
  const driver = { id: 'driver-1', account_id: 'acct-1', pin: 'hash-current', is_active: true };
  const deviceSession = {
    id: 'device-session-1',
    account_id: 'acct-1',
    driver_id: 'driver-1',
    device_hash: 'device-hash-1',
    revoked_at: null
  };
  const response = await request(createDriverApp(driver, deviceSession))
    .get('/private')
    .set('Authorization', `Bearer ${signDriverToken(driver, driver.pin, deviceSession)}`);

  assert.equal(response.status, 200);
});

test('signing in on a new phone ends the revoked phone session', async () => {
  const driver = { id: 'driver-1', account_id: 'acct-1', pin: 'hash-current', is_active: true };
  const revokedDeviceSession = {
    id: 'device-session-old',
    account_id: 'acct-1',
    driver_id: 'driver-1',
    device_hash: 'device-hash-old',
    revoked_at: '2026-08-16T20:00:00.000Z'
  };
  const response = await request(createDriverApp(driver, revokedDeviceSession))
    .get('/private')
    .set('Authorization', `Bearer ${signDriverToken(driver, driver.pin, revokedDeviceSession)}`);

  assert.equal(response.status, 401);
  assert.match(response.body.error, /sign in again/i);
});
