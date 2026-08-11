const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');

const { createApp } = require('../app');
const { createAuthMiddleware } = require('../middleware/auth');
const { getCredentialVersion } = require('../services/credentialSession');

const enabled = process.env.READYROUTE_PHASE2_DB_INTEGRATION === 'true';

test('applied database enforces invite/reset replay and replacement-device revocation', { skip: !enabled }, async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  assert.ok(supabaseUrl && serviceKey, 'Local Supabase URL and service key are required');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const jwtSecret = `phase2-${crypto.randomUUID()}`;
  const accountId = crypto.randomUUID();
  const secondAccountId = crypto.randomUUID();
  const driverId = crypto.randomUUID();
  const email = `phase2-${driverId}@example.test`;
  const invitedAt = new Date().toISOString();
  const pinHash = await bcrypt.hash('2468', 10);

  try {
    let result = await supabase.from('accounts').insert([
      { id: accountId, company_name: 'Phase 2 Database Auth A' },
      { id: secondAccountId, company_name: 'Phase 2 Database Auth B' }
    ]);
    assert.equal(result.error, null);
    result = await supabase.from('drivers').insert({
      id: driverId,
      account_id: accountId,
      name: 'Phase 2 Driver',
      email,
      pin: pinHash,
      invited_at: invitedAt,
      is_active: true
    });
    assert.equal(result.error, null);

    const app = createApp({
      supabase,
      jwtSecret,
      enforceBilling: false,
      enforceSessionValidation: true,
      requireDriverDeviceId: true,
      rateLimitEnabled: false
    });
    const invitePayload = {
      purpose: 'driver_invite', driver_id: driverId, account_id: accountId, email, invited_at: invitedAt
    };
    const oldInvite = jwt.sign(invitePayload, jwtSecret, { expiresIn: '7d' });

    const replacedAt = new Date(Date.now() + 1000).toISOString();
    await supabase.from('drivers').update({ invited_at: replacedAt }).eq('id', driverId);
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: oldInvite, password: 'FirstSecurePassword!2026'
    })).status, 400);

    const crossCompany = jwt.sign({ ...invitePayload, account_id: secondAccountId, invited_at: replacedAt }, jwtSecret, { expiresIn: '7d' });
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: crossCompany, password: 'FirstSecurePassword!2026'
    })).status, 400);

    const expiredInvite = jwt.sign({ ...invitePayload, invited_at: replacedAt }, jwtSecret, { expiresIn: -1 });
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: expiredInvite, password: 'FirstSecurePassword!2026'
    })).status, 400);

    const currentInvite = jwt.sign({ ...invitePayload, invited_at: replacedAt }, jwtSecret, { expiresIn: '7d' });
    const accepted = await request(app).post('/auth/driver/accept-invite').send({
      token: currentInvite, password: 'FirstSecurePassword!2026', username: 'phase2-driver'
    });
    assert.equal(accepted.status, 200);
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: currentInvite, password: 'FirstSecurePassword!2026'
    })).status, 400);

    const { data: acceptedDriver } = await supabase.from('drivers').select('password_hash').eq('id', driverId).single();
    const resetToken = jwt.sign({
      purpose: 'driver_password_reset',
      driver_id: driverId,
      account_id: accountId,
      email,
      pwdv: getCredentialVersion(acceptedDriver.password_hash)
    }, jwtSecret, { expiresIn: '30m' });
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: resetToken, password: 'ReplacementPassword!2026'
    })).status, 200);
    assert.equal((await request(app).post('/auth/driver/accept-invite').send({
      token: resetToken, password: 'ReplacementPassword!2026'
    })).status, 400);

    const firstLogin = await request(app).post('/auth/mobile/login').send({
      email,
      secret: 'ReplacementPassword!2026',
      device_id: 'phase2-device-000000000001'
    });
    assert.equal(firstLogin.status, 200);
    const secondLogin = await request(app).post('/auth/mobile/login').send({
      email,
      secret: 'ReplacementPassword!2026',
      device_id: 'phase2-device-000000000002'
    });
    assert.equal(secondLogin.status, 200);

    const probe = express();
    const { requireDriver } = createAuthMiddleware({ supabase, jwtSecret, enforceSessionValidation: true });
    probe.get('/protected', requireDriver, (_req, res) => res.status(200).json({ ok: true }));
    assert.equal((await request(probe).get('/protected').set('Authorization', `Bearer ${firstLogin.body.driver_token}`)).status, 401);
    assert.equal((await request(probe).get('/protected').set('Authorization', `Bearer ${secondLogin.body.driver_token}`)).status, 200);
  } finally {
    await supabase.from('accounts').delete().in('id', [accountId, secondAccountId]);
  }
});
