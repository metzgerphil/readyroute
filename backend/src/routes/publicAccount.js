const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');

function credentialVersion(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function createPublicAccountRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());

  async function findDriver(identifier) {
    const normalized = String(identifier || '').trim().toLowerCase();
    if (!normalized || normalized.length > 254) return null;
    const field = normalized.includes('@') ? 'email' : 'username';
    if (field === 'username' && !/^[a-z0-9._-]{3,40}$/i.test(normalized)) return null;
    const query = supabase
      .from('drivers')
      .select('id, account_id, name, email, username, password_hash, pin, is_active')
    const lookup = field === 'email'
      ? query.eq('email', normalized).maybeSingle()
      : query.ilike('username', normalized.replace(/[\\%_]/g, '\\$&')).limit(2);
    const { data, error } = await lookup;
    if (error) throw error;
    if (field === 'email') return data || null;
    return (Array.isArray(data) ? data : []).find((row) => (
      String(row.username || '').toLowerCase() === normalized
    )) || null;
  }

  router.post('/login', async (req, res) => {
    const identifier = String(req.body?.identifier || '');
    const password = String(req.body?.password || '');
    if (!identifier || !password || password.length > 200) {
      return res.status(400).json({ error: 'Username or email and password are required.' });
    }
    try {
      const driver = await findDriver(identifier);
      const hash = driver?.password_hash || driver?.pin;
      if (!driver || driver.is_active === false || !hash || !(await bcrypt.compare(password, hash))) {
        return res.status(401).json({ error: 'Incorrect username, email, or password.' });
      }
      const token = jwt.sign({
        purpose: 'driver_account_management',
        driver_id: driver.id,
        account_id: driver.account_id,
        credential_version: credentialVersion(hash)
      }, jwtSecret, { expiresIn: '15m' });
      return res.status(200).json({
        token,
        user: { name: driver.name, email: driver.email, username: driver.username }
      });
    } catch (error) {
      console.error('Public account login failed:', error);
      return res.status(500).json({ error: 'Account access is unavailable right now.' });
    }
  });

  async function requireAccountSession(req, res, next) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (payload?.purpose !== 'driver_account_management') throw new Error('invalid purpose');
      const { data: driver, error } = await supabase
        .from('drivers')
        .select('id, account_id, password_hash, pin, is_active')
        .eq('id', payload.driver_id)
        .eq('account_id', payload.account_id)
        .maybeSingle();
      if (error) throw error;
      const hash = driver?.password_hash || driver?.pin;
      if (!driver || driver.is_active === false || credentialVersion(hash) !== payload.credential_version) {
        return res.status(401).json({ error: 'Please sign in again.' });
      }
      req.accountDriver = driver;
      return next();
    } catch (_error) {
      return res.status(401).json({ error: 'Please sign in again.' });
    }
  }

  router.get('/deletion-request', requireAccountSession, async (req, res) => {
    const { data, error } = await supabase
      .from('driver_account_deletion_requests')
      .select('status, requested_at, scheduled_for, canceled_at, completed_at')
      .eq('driver_id', req.accountDriver.id)
      .in('status', ['pending', 'processing'])
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Deletion status could not be loaded.' });
    return res.status(200).json({ request: data || null });
  });

  router.post('/deletion-request', requireAccountSession, async (req, res) => {
    const requestedAt = now();
    const scheduledFor = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from('driver_account_deletion_requests')
      .upsert({
        account_id: req.accountDriver.account_id,
        driver_id: req.accountDriver.id,
        status: 'pending',
        requested_at: requestedAt.toISOString(),
        scheduled_for: scheduledFor.toISOString(),
        canceled_at: null,
        completed_at: null
      }, { onConflict: 'driver_id' })
      .select('status, requested_at, scheduled_for')
      .single();
    if (error) {
      console.error('Driver account deletion request failed:', error);
      return res.status(500).json({ error: 'The deletion request could not be saved.' });
    }
    return res.status(200).json({ request: data });
  });

  router.delete('/deletion-request', requireAccountSession, async (req, res) => {
    const { data, error } = await supabase
      .from('driver_account_deletion_requests')
      .update({ status: 'canceled', canceled_at: now().toISOString() })
      .eq('driver_id', req.accountDriver.id)
      .eq('status', 'pending')
      .select('status, canceled_at')
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'The deletion request could not be canceled.' });
    return res.status(200).json({ request: data || null });
  });

  return router;
}

module.exports = { createPublicAccountRouter, credentialVersion };
