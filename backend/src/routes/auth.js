const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const { createBillingService } = require('../services/billing');
const { sendManagerPasswordResetEmail: defaultSendManagerPasswordResetEmail } = require('../services/managerInviteEmail');

function createAuthRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const billingService = createBillingService({
    supabase,
    stripeClient: options.stripeClient,
    stripePriceId: options.stripePriceId,
    trialDays: options.trialDays
  });
  const sendManagerPasswordResetEmail = options.sendManagerPasswordResetEmail || defaultSendManagerPasswordResetEmail;

  function signToken(payload, expiresIn) {
    if (!jwtSecret) {
      throw new Error('Missing JWT_SECRET environment variable');
    }

    return jwt.sign(payload, jwtSecret, { expiresIn });
  }

  function getManagerPortalBaseUrl() {
    return (
      process.env.MANAGER_PORTAL_URL ||
      process.env.VITE_MANAGER_PORTAL_URL ||
      'http://127.0.0.1:5173'
    );
  }

  function getPasswordVersion(hash) {
    return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
  }

  function buildPasswordResetUrl(token) {
    const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  function buildManagerInviteUrl(token) {
    const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&mode=invite`;
  }

  function buildTrialActivationUrl(token) {
    const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/trial/activate?token=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`;
  }

  function buildTrialCancelUrl(email) {
    const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/start-trial?canceled=1${email ? `&email=${encodeURIComponent(email)}` : ''}`;
  }

  function isStrongEnoughPassword(password) {
    return typeof password === 'string' && password.length >= 10;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());
  }

  async function findManagerIdentityByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();

    const managerUserQuery = await supabase
      .from('manager_users')
      .select('id, account_id, email, password_hash, full_name, is_active')
      .eq('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (
      managerUserQuery.error &&
      !['PGRST116', 'PGRST205', '42P01'].includes(managerUserQuery.error.code)
    ) {
      throw managerUserQuery.error;
    }

    if (managerUserQuery.data) {
      return {
        id: managerUserQuery.data.id,
        account_id: managerUserQuery.data.account_id,
        email: managerUserQuery.data.email,
        password_hash: managerUserQuery.data.password_hash,
        full_name: managerUserQuery.data.full_name,
        is_active: managerUserQuery.data.is_active,
        source: 'manager_user'
      };
    }

    const legacyAccountQuery = await supabase
      .from('accounts')
      .select('id, manager_email, manager_password_hash')
      .eq('manager_email', normalizedEmail)
      .maybeSingle();

    if (legacyAccountQuery.error) {
      throw legacyAccountQuery.error;
    }

    if (!legacyAccountQuery.data) {
      return null;
    }

    return {
      id: legacyAccountQuery.data.id,
      account_id: legacyAccountQuery.data.id,
      email: legacyAccountQuery.data.manager_email,
      password_hash: legacyAccountQuery.data.manager_password_hash,
      full_name: null,
      is_active: true,
      source: 'legacy_account'
    };
  }

  async function findDriverByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { data, error } = await supabase
      .from('drivers')
      .select('id, account_id, name, email, pin, is_active')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function getAccountSummary(accountId) {
    if (!accountId) {
      return null;
    }

    const { data, error } = await supabase
      .from('accounts')
      .select('id, company_name')
      .eq('id', accountId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  function buildDriverAuthPayload(driver, accountSummary = null) {
    return {
      driver_id: driver.id,
      account_id: driver.account_id,
      name: driver.name,
      full_name: driver.name,
      email: driver.email,
      company_name: accountSummary?.company_name || null,
      csa_name: accountSummary?.company_name || null,
      primary_role: 'driver',
      role: 'driver'
    };
  }

  function buildManagerAuthPayload(managerIdentity, accountSummary = null) {
    return {
      account_id: managerIdentity.account_id,
      manager_user_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
      manager_email: managerIdentity.email,
      manager_name: managerIdentity.full_name,
      full_name: managerIdentity.full_name,
      company_name: accountSummary?.company_name || null,
      csa_name: accountSummary?.company_name || null,
      primary_role: 'manager',
      role: 'manager'
    };
  }

  async function updateManagerIdentityPassword(identity, passwordHash, extraUpdates = {}) {
    if (identity.source === 'manager_user') {
      const { error } = await supabase
        .from('manager_users')
        .update({ password_hash: passwordHash, ...extraUpdates })
        .eq('id', identity.id);

      if (error) {
        throw error;
      }

      return;
    }

    const { error } = await supabase
      .from('accounts')
      .update({ manager_password_hash: passwordHash, ...extraUpdates })
      .eq('id', identity.account_id);

    if (error) {
      throw error;
    }
  }

  async function deleteTrialAccount(accountId) {
    await supabase.from('manager_users').delete().eq('account_id', accountId);
    await supabase.from('accounts').delete().eq('id', accountId);
  }

  router.post('/manager/start-trial', async (req, res) => {
    const companyName = String(req.body?.company_name || '').trim();
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const vehicleCount = Number(req.body?.vehicle_count);

    if (!companyName || !fullName || !email || !password) {
      return res.status(400).json({ error: 'company_name, full_name, email, and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    if (!Number.isInteger(vehicleCount) || vehicleCount <= 0) {
      return res.status(400).json({ error: 'vehicle_count must be a positive integer' });
    }

    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }

    try {
      const existingIdentity = await findManagerIdentityByEmail(email);

      if (existingIdentity) {
        return res.status(409).json({ error: 'That email is already attached to a ReadyRoute account' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const createdAt = new Date().toISOString();
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          company_name: companyName,
          manager_email: email,
          manager_password_hash: passwordHash,
          vehicle_count: vehicleCount,
          plan: 'starter',
          driver_starter_pin: '1234'
        })
        .select('id, company_name, manager_email, stripe_customer_id, vehicle_count')
        .single();

      if (accountError || !account) {
        throw accountError || new Error('Failed to create account');
      }

      const { error: managerUserError } = await supabase
        .from('manager_users')
        .insert({
          account_id: account.id,
          email,
          full_name: fullName,
          password_hash: passwordHash,
          is_active: true,
          invited_at: createdAt,
          accepted_at: createdAt
        });

      if (managerUserError) {
        await deleteTrialAccount(account.id);
        throw managerUserError;
      }

      try {
        await billingService.createCustomer(email, companyName, account.id);
        const activationToken = signToken(
          {
            account_id: account.id,
            email,
            purpose: 'manager_trial_activation'
          },
          '24h'
        );

        const checkoutSession = await billingService.createTrialCheckoutSession(account.id, vehicleCount, {
          successUrl: buildTrialActivationUrl(activationToken),
          cancelUrl: buildTrialCancelUrl(email)
        });

        return res.status(200).json({
          checkout_url: checkoutSession.url
        });
      } catch (billingError) {
        await deleteTrialAccount(account.id);
        throw billingError;
      }
    } catch (error) {
      console.error('Manager trial signup failed:', error);
      return res.status(500).json({ error: 'Failed to start free trial' });
    }
  });

  router.post('/manager/complete-trial', async (req, res) => {
    const token = String(req.body?.token || '');
    const sessionId = String(req.body?.session_id || '');

    if (!token || !sessionId) {
      return res.status(400).json({ error: 'token and session_id are required' });
    }

    try {
      let payload;

      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (_error) {
        return res.status(400).json({ error: 'Trial activation link is invalid or expired' });
      }

      if (payload?.purpose !== 'manager_trial_activation' || !payload.account_id || !payload.email) {
        return res.status(400).json({ error: 'Trial activation link is invalid or expired' });
      }

      const managerIdentity = await findManagerIdentityByEmail(payload.email);

      if (!managerIdentity || managerIdentity.account_id !== payload.account_id) {
        return res.status(400).json({ error: 'Trial activation link is invalid or expired' });
      }

      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, stripe_customer_id')
        .eq('id', payload.account_id)
        .maybeSingle();

      if (accountError || !account) {
        throw accountError || new Error('Account not found');
      }

      const stripe = options.stripeClient || (process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null);

      if (!stripe) {
        return res.status(500).json({ error: 'Stripe is not configured' });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription']
      });

      if (session?.status !== 'complete' || session?.mode !== 'subscription') {
        return res.status(400).json({ error: 'Trial checkout is not complete yet' });
      }

      if (account.stripe_customer_id && session.customer !== account.stripe_customer_id) {
        return res.status(400).json({ error: 'Trial checkout does not match this ReadyRoute account' });
      }

      const subscription = session.subscription;
      const subscriptionStatus = subscription?.status || 'trialing';
      const quantity = subscription?.items?.data?.[0]?.quantity || 0;

      const { error: accountUpdateError } = await supabase
        .from('accounts')
        .update({
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: subscription?.id || null,
          subscription_status: subscriptionStatus,
          vehicle_count: quantity,
          plan: ['active', 'trialing'].includes(subscriptionStatus) ? 'pro' : 'starter'
        })
        .eq('id', payload.account_id);

      if (accountUpdateError) {
        throw accountUpdateError;
      }

      const loginToken = signToken(
        {
          account_id: managerIdentity.account_id,
          manager_user_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
          manager_email: managerIdentity.email,
          manager_name: managerIdentity.full_name,
          role: 'manager'
        },
        '24h'
      );

      return res.status(200).json({
        token: loginToken,
        user: {
          account_id: managerIdentity.account_id,
          manager_user_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
          email: managerIdentity.email,
          name: managerIdentity.full_name,
          role: 'manager'
        }
      });
    } catch (error) {
      console.error('Manager trial activation failed:', error);
      return res.status(500).json({ error: 'Failed to activate free trial' });
    }
  });

  router.post('/driver/login', async (req, res) => {
    const { email, pin } = req.body || {};

    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and PIN are required' });
    }

    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be a 4-digit code' });
    }

    try {
      const driver = await findDriverByEmail(email);
      const accountSummary = await getAccountSummary(driver?.account_id);

      if (!driver || !driver.pin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPin = await bcrypt.compare(String(pin), driver.pin);

      if (!isValidPin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = signToken(
        buildDriverAuthPayload(driver, accountSummary),
        '12h'
      );

      return res.status(200).json({
        token,
        user: {
          driver_id: driver.id,
          account_id: driver.account_id,
          name: driver.name,
          email: driver.email,
          company_name: accountSummary?.company_name || null,
          role: 'driver'
        }
      });
    } catch (error) {
      console.error('Driver login failed:', error);
      return res.status(500).json({ error: 'Failed to log in driver' });
    }
  });

  router.post('/manager/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const managerIdentity = await findManagerIdentityByEmail(email);
      const accountSummary = await getAccountSummary(managerIdentity?.account_id);

      if (!managerIdentity || !managerIdentity.password_hash || managerIdentity.is_active === false) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(String(password), managerIdentity.password_hash);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = signToken(
        buildManagerAuthPayload(managerIdentity, accountSummary),
        '24h'
      );

      return res.status(200).json({
        token,
        user: {
          account_id: managerIdentity.account_id,
          manager_user_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
          email: managerIdentity.email,
          name: managerIdentity.full_name,
          company_name: accountSummary?.company_name || null,
          role: 'manager'
        }
      });
    } catch (error) {
      console.error('Manager login failed:', error);
      return res.status(500).json({ error: 'Failed to log in manager' });
    }
  });

  router.post('/mobile/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const secret = String(req.body?.secret || '').trim();

    if (!email || !secret) {
      return res.status(400).json({ error: 'Email and PIN or password are required' });
    }

    try {
      const [driver, managerIdentity] = await Promise.all([
        findDriverByEmail(email),
        findManagerIdentityByEmail(email)
      ]);
      const accountSummary = await getAccountSummary(driver?.account_id || managerIdentity?.account_id);

      let hasDriverAccess = false;
      let hasManagerAccess = false;

      if (driver?.pin) {
        hasDriverAccess = await bcrypt.compare(secret, driver.pin);
      }

      if (managerIdentity?.password_hash && managerIdentity.is_active !== false) {
        hasManagerAccess = await bcrypt.compare(secret, managerIdentity.password_hash);
      }

      if (!hasDriverAccess && !hasManagerAccess) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const linkedDriverAccess = Boolean(
        driver &&
        driver.account_id &&
        managerIdentity &&
        managerIdentity.account_id === driver.account_id &&
        managerIdentity.is_active !== false
      );

      const linkedManagerAccess = Boolean(
        managerIdentity &&
        managerIdentity.account_id &&
        driver &&
        driver.account_id === managerIdentity.account_id &&
        driver.pin
      );

      const grantDriverAccess = hasDriverAccess || (hasManagerAccess && linkedDriverAccess);
      const grantManagerAccess = hasManagerAccess || (hasDriverAccess && linkedManagerAccess);

      const driverToken = grantDriverAccess && driver
        ? signToken(buildDriverAuthPayload(driver, accountSummary), '12h')
        : null;
      const managerToken = grantManagerAccess && managerIdentity
        ? signToken(buildManagerAuthPayload(managerIdentity, accountSummary), '24h')
        : null;

      const portals = [
        ...(driverToken ? ['driver'] : []),
        ...(managerToken ? ['manager'] : [])
      ];

      return res.status(200).json({
        driver_token: driverToken,
        manager_token: managerToken,
        portals,
        user: {
          account_id: driver?.account_id || managerIdentity?.account_id || null,
          email,
          name: driver?.name || managerIdentity?.full_name || null,
          company_name: accountSummary?.company_name || null
        }
      });
    } catch (error) {
      console.error('Mobile login failed:', error);
      return res.status(500).json({ error: 'Failed to log in' });
    }
  });

  router.post('/manager/request-password-reset', async (req, res) => {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    try {
      const managerIdentity = await findManagerIdentityByEmail(email);

      const responsePayload = {
        message: 'If that email exists, a password reset link has been prepared.'
      };

      if (!managerIdentity || !managerIdentity.password_hash || managerIdentity.is_active === false) {
        return res.status(200).json(responsePayload);
      }

      const token = signToken(
        {
          account_id: managerIdentity.account_id,
          manager_user_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
          email: managerIdentity.email,
          purpose: 'manager_password_reset',
          pwdv: getPasswordVersion(managerIdentity.password_hash)
        },
        '30m'
      );

      const resetUrl = buildPasswordResetUrl(token);
      console.log(`Manager password reset link for ${managerIdentity.email}: ${resetUrl}`);

      const accountQuery = await supabase
        .from('accounts')
        .select('company_name')
        .eq('id', managerIdentity.account_id)
        .maybeSingle();

      if (accountQuery.error) {
        throw accountQuery.error;
      }

      const emailDelivery = await sendManagerPasswordResetEmail({
        to: managerIdentity.email,
        fullName: managerIdentity.full_name,
        resetUrl,
        companyName: accountQuery.data?.company_name
      });

      if (process.env.NODE_ENV === 'production' && emailDelivery?.skipped) {
        return res.status(503).json({ error: 'Password reset email service is not configured yet' });
      }

      if (process.env.NODE_ENV !== 'production') {
        responsePayload.reset_url = resetUrl;
      }

      if (emailDelivery?.delivered) {
        responsePayload.message = 'Password reset email sent. Check your inbox for the reset link.';
      }

      return res.status(200).json(responsePayload);
    } catch (error) {
      console.error('Manager password reset request failed:', error);
      return res.status(500).json({ error: 'Failed to process password reset request' });
    }
  });

  router.post('/manager/reset-password', async (req, res) => {
    const { token, password } = req.body || {};

    if (!token || !password) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }

    try {
      let payload;

      try {
        payload = jwt.verify(String(token), jwtSecret);
      } catch (_error) {
        return res.status(400).json({ error: 'Reset link is invalid or expired' });
      }

      if (
        !['manager_password_reset', 'manager_invite'].includes(payload?.purpose) ||
        !payload.account_id ||
        !payload.email
      ) {
        return res.status(400).json({ error: 'Reset link is invalid or expired' });
      }

      const managerIdentity = await findManagerIdentityByEmail(payload.email);

      if (
        !managerIdentity ||
        managerIdentity.account_id !== payload.account_id ||
        (payload.manager_user_id && managerIdentity.id !== payload.manager_user_id)
      ) {
        return res.status(400).json({ error: 'Reset link is invalid or expired' });
      }

      if (payload.purpose === 'manager_password_reset') {
        if (!managerIdentity.password_hash) {
          return res.status(400).json({ error: 'Reset link is invalid or expired' });
        }

        if (getPasswordVersion(managerIdentity.password_hash) !== payload.pwdv) {
          return res.status(400).json({ error: 'Reset link is invalid or expired' });
        }
      }

      if (payload.purpose === 'manager_invite') {
        if (managerIdentity.source !== 'manager_user' || managerIdentity.password_hash) {
          return res.status(400).json({ error: 'Invite link is invalid or has already been used' });
        }
      }

      const managerPasswordHash = await bcrypt.hash(String(password), 10);
      await updateManagerIdentityPassword(
        managerIdentity,
        managerPasswordHash,
        payload.purpose === 'manager_invite' ? { accepted_at: new Date().toISOString() } : {}
      );

      return res.status(200).json({ message: 'Password updated. You can sign in now.' });
    } catch (error) {
      console.error('Manager password reset failed:', error);
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  return router;
}

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
