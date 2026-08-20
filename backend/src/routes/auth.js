const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const { requireManager: defaultRequireManager } = require('../middleware/auth');
const { createBillingService } = require('../services/billing');
const { getEffectiveAccountStatus } = require('../services/accountLifecycle');
const { recordEmailDelivery } = require('../services/emailDeliveryTracking');
const { updateRouteBillingSettings } = require('../services/routeBilling');
const {
  sendDriverPasswordResetEmail: defaultSendDriverPasswordResetEmail,
  sendManagerPasswordResetEmail: defaultSendManagerPasswordResetEmail
} = require('../services/managerInviteEmail');
const {
  authorizeDriverDevice: defaultAuthorizeDriverDevice,
  normalizeDeviceId
} = require('../services/driverDeviceSession');
const {
  SESSION_SUBJECT_TYPES,
  buildCredentialSessionClaims
} = require('../services/credentialSession');

function createAuthRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const requireManager = options.requireManager || defaultRequireManager;
  const requireDriver = options.requireDriver || ((_req, res) => res.status(500).json({ error: 'Driver authentication is not configured' }));
  const billingService = createBillingService({
    supabase,
    stripeClient: options.stripeClient,
    stripePriceId: options.stripePriceId,
    stripeMonthlyPriceId: options.stripeMonthlyPriceId,
    stripeAnnualPriceId: options.stripeAnnualPriceId,
    trialDays: options.trialDays
  });
  const sendManagerPasswordResetEmail = options.sendManagerPasswordResetEmail || defaultSendManagerPasswordResetEmail;
  const sendDriverPasswordResetEmail = options.sendDriverPasswordResetEmail || defaultSendDriverPasswordResetEmail;
  const authorizeDriverDevice = options.authorizeDriverDevice || defaultAuthorizeDriverDevice;
  const requireDriverDeviceId = options.requireDriverDeviceId ?? process.env.NODE_ENV === 'production';

  async function trackPasswordEmail(details) {
    try {
      await recordEmailDelivery({ supabase, ...details, now: options.now || (() => new Date()) });
    } catch (trackingError) {
      console.error('Password email delivery tracking failed:', trackingError);
    }
  }

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

  function getCompanyPortalBaseUrl() {
    return process.env.RRA_COMPANY_PORTAL_URL || getManagerPortalBaseUrl();
  }

  function getPasswordVersion(hash) {
    return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
  }

  function buildPasswordResetUrl(token) {
    const baseUrl = getCompanyPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}?reset=${encodeURIComponent(token)}`;
  }

  function buildManagerInviteUrl(token) {
    const baseUrl = getCompanyPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}?invite=${encodeURIComponent(token)}`;
  }

  function buildDriverPasswordResetUrl(token) {
    const baseUrl = getManagerPortalBaseUrl().replace(/\/$/, '');
    return `${baseUrl}/driver-invite?token=${encodeURIComponent(token)}&mode=reset`;
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

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function timestampsMatch(left, right) {
    const leftTime = Date.parse(String(left || ''));
    const rightTime = Date.parse(String(right || ''));
    return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  function getRequestedRouteCommitment(body = {}) {
    return Number(body.route_count ?? body.routes ?? body.vehicle_count);
  }

  function normalizeManagerIdentity(row) {
    return {
      id: row.id,
      account_id: row.account_id,
      email: row.email,
      password_hash: row.password_hash,
      full_name: row.full_name,
      is_active: row.is_active,
      source: 'manager_user'
    };
  }

  function compareManagerIdentityPriority(left, right) {
    const leftActive = left.is_active !== false ? 1 : 0;
    const rightActive = right.is_active !== false ? 1 : 0;

    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftHasPassword = left.password_hash ? 1 : 0;
    const rightHasPassword = right.password_hash ? 1 : 0;

    if (leftHasPassword !== rightHasPassword) {
      return rightHasPassword - leftHasPassword;
    }

    return String(left.account_id || '').localeCompare(String(right.account_id || ''));
  }

  async function findManagerIdentitiesByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();

    const managerUserQuery = await supabase
      .from('manager_users')
      .select('id, account_id, email, password_hash, full_name, is_active')
      .eq('email', normalizedEmail)
      .order('is_active', { ascending: false })
      .order('account_id', { ascending: true });

    if (
      managerUserQuery.error &&
      !['PGRST116', 'PGRST205', '42P01'].includes(managerUserQuery.error.code)
    ) {
      throw managerUserQuery.error;
    }

    if (Array.isArray(managerUserQuery.data) && managerUserQuery.data.length) {
      return managerUserQuery.data
        .map(normalizeManagerIdentity)
        .sort(compareManagerIdentityPriority);
    }

    if (managerUserQuery.data && !Array.isArray(managerUserQuery.data)) {
      return [normalizeManagerIdentity(managerUserQuery.data)];
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
      return [];
    }

    return [{
      id: legacyAccountQuery.data.id,
      account_id: legacyAccountQuery.data.id,
      email: legacyAccountQuery.data.manager_email,
      password_hash: legacyAccountQuery.data.manager_password_hash,
      full_name: null,
      is_active: true,
      source: 'legacy_account'
    }];
  }

  async function findManagerIdentityByEmail(email) {
    const identities = await findManagerIdentitiesByEmail(email);
    return identities[0] || null;
  }

  async function findManagerIdentityByEmailForAccount(email, accountId) {
    if (!accountId) {
      return null;
    }

    const identities = await findManagerIdentitiesByEmail(email);
    return identities.find((identity) => identity.account_id === accountId) || null;
  }

  async function findAuthenticatedManagerIdentity(email, password, accountId = null) {
    const identities = await findManagerIdentitiesByEmail(email);
    const activeIdentities = identities.filter((identity) => (
      identity.password_hash &&
      identity.is_active !== false &&
      (!accountId || identity.account_id === accountId)
    ));

    for (const identity of activeIdentities) {
      if (await bcrypt.compare(String(password), identity.password_hash)) {
        return identity;
      }
    }

    return null;
  }

  async function findManagerIdentityByManagerUserId(managerUserId) {
    if (!managerUserId) {
      return null;
    }

    const managerUserQuery = await supabase
      .from('manager_users')
      .select('id, account_id, email, password_hash, full_name, is_active')
      .eq('id', managerUserId)
      .maybeSingle();

    if (
      managerUserQuery.error &&
      !['PGRST116', 'PGRST205', '42P01'].includes(managerUserQuery.error.code)
    ) {
      throw managerUserQuery.error;
    }

    if (!managerUserQuery.data) {
      return null;
    }

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

  async function findDriversByEmail(email) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { data, error } = await supabase
      .from('drivers')
      .select('id, account_id, name, email, username, pin, password_hash, invited_at, invite_accepted_at, is_active')
      .eq('email', normalizedEmail);

    if (error) {
      throw error;
    }

    if (Array.isArray(data)) return data;
    return data ? [data] : [];
  }

  async function findDriverByEmailForAccount(email, accountId) {
    const drivers = await findDriversByEmail(email);
    return drivers.find((driver) => driver.account_id === accountId) || null;
  }

  async function findDriversByIdentifier(identifier) {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    if (!normalizedIdentifier) return [];

    if (normalizedIdentifier.includes('@')) {
      return findDriversByEmail(normalizedIdentifier);
    }

    if (!/^[a-z0-9._-]{3,40}$/i.test(normalizedIdentifier)) return [];

    const { data, error } = await supabase
      .from('drivers')
      .select('id, account_id, name, email, username, pin, password_hash, invited_at, invite_accepted_at, is_active')
      .ilike('username', normalizedIdentifier)
      .limit(20);

    if (error) throw error;
    return data || [];
  }

  async function findDriverCredentialMatch(identifier, credential) {
    const candidates = await findDriversByIdentifier(identifier);
    const matches = [];

    for (const candidate of candidates) {
      const credentialHash = candidate?.password_hash || candidate?.pin;
      if (
        candidate?.is_active !== false &&
        credentialHash &&
        await bcrypt.compare(credential, credentialHash)
      ) {
        matches.push(candidate);
      }
    }

    return matches.length === 1 ? matches[0] : null;
  }

  async function getAccountSummary(accountId) {
    if (!accountId) {
      return null;
    }

    const { data, error } = await supabase
      .from('accounts')
      .select('id, company_name, account_status, service_ends_at, retention_ends_at')
      .eq('id', accountId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  function isAccountLoginAvailable(account) {
    return getEffectiveAccountStatus(account || {}) !== 'retained';
  }

  function buildDriverAuthPayload(driver, accountSummary = null, deviceSession = null) {
    const credentialHash = driver.password_hash || driver.pin;
    return {
      driver_id: driver.id,
      account_id: driver.account_id,
      name: driver.name,
      full_name: driver.name,
      email: driver.email,
      company_name: accountSummary?.company_name || null,
      csa_name: accountSummary?.company_name || null,
      primary_role: 'driver',
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
      role: 'manager',
      ...buildCredentialSessionClaims({
        subjectType: managerIdentity.source === 'manager_user'
          ? SESSION_SUBJECT_TYPES.MANAGER_USER
          : SESSION_SUBJECT_TYPES.ACCOUNT_MANAGER,
        subjectId: managerIdentity.source === 'manager_user'
          ? managerIdentity.id
          : managerIdentity.account_id,
        credentialHash: managerIdentity.password_hash
      })
    };
  }

  function buildManagerDriverModePayload(managerIdentity, accountSummary = null) {
    return {
      driver_id: managerIdentity.source === 'manager_user' ? managerIdentity.id : managerIdentity.account_id,
      account_id: managerIdentity.account_id,
      name: managerIdentity.full_name || managerIdentity.email,
      full_name: managerIdentity.full_name || managerIdentity.email,
      email: managerIdentity.email,
      company_name: accountSummary?.company_name || null,
      csa_name: accountSummary?.company_name || null,
      primary_role: 'driver',
      role: 'driver',
      driver_mode_source: 'manager',
      ...buildCredentialSessionClaims({
        subjectType: managerIdentity.source === 'manager_user'
          ? SESSION_SUBJECT_TYPES.MANAGER_USER
          : SESSION_SUBJECT_TYPES.ACCOUNT_MANAGER,
        subjectId: managerIdentity.source === 'manager_user'
          ? managerIdentity.id
          : managerIdentity.account_id,
        credentialHash: managerIdentity.password_hash
      })
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
    const publicTrialsEnabled = String(process.env.READYROUTE_ENABLE_PUBLIC_TRIALS || '')
      .trim()
      .toLowerCase() === 'true';

    if (!publicTrialsEnabled) {
      return res.status(403).json({
        error: 'Public workspace creation is currently disabled. Please request access through readyroute.org/mvp.',
        redirect_url: 'https://readyroute.org/mvp'
      });
    }

    const companyName = String(req.body?.company_name || '').trim();
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const routeCommitment = getRequestedRouteCommitment(req.body);

    if (!companyName || !fullName || !email || !password) {
      return res.status(400).json({ error: 'company_name, full_name, email, and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    if (!Number.isInteger(routeCommitment) || routeCommitment <= 0) {
      return res.status(400).json({ error: 'route_count must be a positive integer' });
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
          vehicle_count: routeCommitment,
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
        const billingSettingsResult = await updateRouteBillingSettings({
          supabase,
          accountId: account.id,
          committedRouteCount: routeCommitment,
          updatedAt: createdAt
        });

        if (!billingSettingsResult.valid) {
          throw new Error(billingSettingsResult.error);
        }

        await billingService.createCustomer(email, companyName, account.id);
        const activationToken = signToken(
          {
            account_id: account.id,
            email,
            purpose: 'manager_trial_activation'
          },
          '24h'
        );

        const billingInterval = req.body?.billing_interval === 'annual' ? 'annual' : 'monthly';
        await supabase.from('accounts').update({ billing_interval: billingInterval }).eq('id', account.id);
        const checkoutSession = await billingService.createTrialCheckoutSession(account.id, routeCommitment, {
          successUrl: buildTrialActivationUrl(activationToken),
          cancelUrl: buildTrialCancelUrl(email),
          billingInterval
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

      const managerIdentity = await findManagerIdentityByEmailForAccount(payload.email, payload.account_id);

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

      if (Number.isInteger(quantity) && quantity > 0) {
        const billingSettingsResult = await updateRouteBillingSettings({
          supabase,
          accountId: payload.account_id,
          committedRouteCount: quantity
        });

        if (!billingSettingsResult.valid) {
          throw new Error(billingSettingsResult.error);
        }
      }

      const loginToken = signToken(buildManagerAuthPayload(managerIdentity, account), '24h');

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
    const { email, identifier, password, pin, device_id: deviceId, device_name: deviceName } = req.body || {};
    const loginIdentifier = String(identifier || email || '').trim();
    const credential = String(password ?? pin ?? '');

    if (!loginIdentifier || !credential) {
      return res.status(400).json({ error: 'Username or email and password or PIN are required' });
    }

    if (credential.length > 200) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    if (requireDriverDeviceId && !normalizeDeviceId(deviceId)) {
      return res.status(400).json({ error: 'A valid device identifier is required' });
    }

    try {
      const driver = await findDriverCredentialMatch(loginIdentifier, credential);
      const accountSummary = await getAccountSummary(driver?.account_id);

      const credentialHash = driver?.password_hash || driver?.pin;
      if (!driver || driver.is_active === false || !credentialHash) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!isAccountLoginAvailable(accountSummary)) {
        return res.status(403).json({ error: 'This ReadyRoute workspace is in its data-retention period.' });
      }

      const deviceSession = await authorizeDriverDevice(supabase, {
        driverId: driver.id,
        accountId: driver.account_id,
        deviceId,
        deviceName
      });
      const token = signToken(
        buildDriverAuthPayload(driver, accountSummary, deviceSession),
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

  router.post('/driver/accept-invite', async (req, res) => {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    const username = String(req.body?.username || '').trim() || null;

    if (!token || !password) {
      return res.status(400).json({ error: 'Invite token and password are required' });
    }
    if (!isStrongEnoughPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }
    if (username && !/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–40 letters, numbers, periods, underscores, or dashes' });
    }

    try {
      let payload;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch (_error) {
        return res.status(400).json({ error: 'Password link is invalid or expired' });
      }
      if (!['driver_invite', 'driver_password_reset'].includes(payload?.purpose) || !payload.driver_id || !payload.account_id || !payload.email) {
        return res.status(400).json({ error: 'Invite link is invalid or expired' });
      }

      const { data: driver, error: lookupError } = await supabase
        .from('drivers')
        .select('id, account_id, email, password_hash, invited_at, invite_accepted_at, is_active')
        .eq('id', payload.driver_id)
        .eq('account_id', payload.account_id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (
        !driver ||
        driver.is_active === false ||
        normalizeEmail(driver.email) !== normalizeEmail(payload.email)
      ) {
        return res.status(400).json({ error: 'Invite link is invalid or expired' });
      }
      if (payload.purpose === 'driver_invite' && (
        driver.invite_accepted_at || !timestampsMatch(driver.invited_at, payload.invited_at)
      )) {
        return res.status(400).json({ error: 'Invite link is invalid or expired' });
      }
      if (payload.purpose === 'driver_password_reset' && (
        !driver.password_hash || getPasswordVersion(driver.password_hash) !== payload.pwdv
      )) {
        return res.status(400).json({ error: 'Reset link is invalid or expired' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const acceptedAt = new Date().toISOString();
      const passwordUpdate = {
        password_hash: passwordHash,
        ...(username ? { username } : {}),
        ...(payload.purpose === 'driver_invite' ? { invite_accepted_at: acceptedAt } : {})
      };
      const { error: updateError } = await supabase
        .from('drivers')
        .update(passwordUpdate)
        .eq('id', driver.id)
        .eq('account_id', driver.account_id);
      if (updateError) throw updateError;

      return res.status(200).json({
        message: payload.purpose === 'driver_invite'
          ? 'Driver password established. Sign in to authorize this device.'
          : 'Driver password reset. Sign in again on the authorized device.'
      });
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'That username is already in use for this company' });
      }
      console.error('Driver invite acceptance failed:', error);
      return res.status(500).json({ error: 'Failed to accept driver invite' });
    }
  });

  router.post('/driver/request-password-reset', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    const responsePayload = {
      message: 'If that email has an active driver account, password-reset instructions have been sent.'
    };

    try {
      const { data: drivers, error: lookupError } = await supabase
        .from('drivers')
        .select('id, account_id, name, email, password_hash, is_active')
        .eq('email', email)
        .eq('is_active', true);
      if (lookupError) throw lookupError;

      const eligibleDrivers = (drivers || []).filter((driver) => driver.password_hash);
      for (const driver of eligibleDrivers) {
        const { data: account, error: accountError } = await supabase
          .from('accounts')
          .select('id, company_name, account_status, retention_ends_at')
          .eq('id', driver.account_id)
          .maybeSingle();
        if (accountError) throw accountError;
        if (!account || !isAccountLoginAvailable(account)) continue;

        const token = signToken({
          purpose: 'driver_password_reset',
          driver_id: driver.id,
          account_id: driver.account_id,
          email: driver.email,
          pwdv: getPasswordVersion(driver.password_hash)
        }, '30m');

        let delivery;
        try {
          delivery = await sendDriverPasswordResetEmail({
            to: driver.email,
            fullName: driver.name,
            resetUrl: buildDriverPasswordResetUrl(token),
            companyName: account.company_name
          });
        } catch (emailError) {
          console.error('Driver self-service password reset email delivery failed:', emailError);
          delivery = { delivered: false, skipped: false, reason: 'Email delivery failed' };
        }
        await trackPasswordEmail({
          accountId: driver.account_id,
          recipientEmail: driver.email,
          recipientType: 'driver',
          recipientId: driver.id,
          messageType: 'driver_password_reset',
          delivery
        });
      }

      return res.status(200).json(responsePayload);
    } catch (error) {
      console.error('Driver self-service password reset request failed:', error);
      return res.status(500).json({ error: 'Password reset could not be prepared right now.' });
    }
  });

  router.post('/driver/change-password', requireDriver, async (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    const nextPassword = String(req.body?.new_password || '');
    if (!currentPassword || !nextPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (!isStrongEnoughPassword(nextPassword)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }
    if (currentPassword === nextPassword) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    try {
      const { data: driver, error: lookupError } = await supabase
        .from('drivers')
        .select('id, account_id, password_hash')
        .eq('id', req.driver.driver_id)
        .eq('account_id', req.driver.account_id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!driver?.password_hash || !(await bcrypt.compare(currentPassword, driver.password_hash))) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      const passwordHash = await bcrypt.hash(nextPassword, 10);
      const { error: updateError } = await supabase
        .from('drivers')
        .update({ password_hash: passwordHash })
        .eq('id', driver.id)
        .eq('account_id', driver.account_id);
      if (updateError) throw updateError;
      return res.status(200).json({ message: 'Password updated. Sign in again with your new password.' });
    } catch (error) {
      console.error('Driver password change failed:', error);
      return res.status(500).json({ error: 'Password could not be updated right now.' });
    }
  });

  router.post('/manager/login', async (req, res) => {
    const { email, password } = req.body || {};
    const requestedAccountId = req.body?.account_id ? String(req.body.account_id) : null;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const managerIdentity = await findAuthenticatedManagerIdentity(email, password, requestedAccountId);
      const accountSummary = await getAccountSummary(managerIdentity?.account_id);

      if (!managerIdentity) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!isAccountLoginAvailable(accountSummary)) {
        return res.status(403).json({ error: 'This ReadyRoute workspace is in its data-retention period.' });
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
    const deviceId = req.body?.device_id;
    const deviceName = req.body?.device_name;

    if (!email || !secret) {
      return res.status(400).json({ error: 'Email and PIN or password are required' });
    }
    try {
      const [driverIdentities, managerIdentities] = await Promise.all([
        findDriversByEmail(email),
        findManagerIdentitiesByEmail(email)
      ]);
      const activeManagerIdentities = managerIdentities.filter((identity) => (
        identity.password_hash &&
        identity.is_active !== false
      ));
      const activeDrivers = driverIdentities.filter((driver) => driver.is_active !== false);
      const matchingDrivers = [];
      for (const driver of activeDrivers) {
        const credentialHash = driver.password_hash || driver.pin;
        if (credentialHash && await bcrypt.compare(secret, credentialHash)) {
          matchingDrivers.push(driver);
        }
      }
      const matchingManagerIdentities = [];
      for (const identity of activeManagerIdentities) {
        if (await bcrypt.compare(secret, identity.password_hash)) {
          matchingManagerIdentities.push(identity);
        }
      }

      const managerIdentity = matchingManagerIdentities.find((identity) => (
        matchingDrivers.some((driver) => driver.account_id === identity.account_id)
      )) || matchingManagerIdentities[0] || null;

      const driver = managerIdentity
        ? activeDrivers.find((candidate) => candidate.account_id === managerIdentity.account_id) || null
        : matchingDrivers.length === 1
          ? matchingDrivers[0]
          : null;
      const hasDriverAccess = Boolean(driver && matchingDrivers.some((candidate) => candidate.id === driver.id));
      const driverCredentialHash = driver?.password_hash || driver?.pin;
      const driverAccountSummary = await getAccountSummary(driver?.account_id);

      const hasManagerAccess = Boolean(managerIdentity);
      const managerAccountSummary = await getAccountSummary(managerIdentity?.account_id);

      if (!hasDriverAccess && !hasManagerAccess) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const driverAccountAvailable = !driver || isAccountLoginAvailable(driverAccountSummary);
      const managerAccountAvailable = !managerIdentity || isAccountLoginAvailable(managerAccountSummary);

      if ((hasDriverAccess && !driverAccountAvailable) || (hasManagerAccess && !managerAccountAvailable)) {
        return res.status(403).json({ error: 'This ReadyRoute workspace is in its data-retention period.' });
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
        driverCredentialHash
      );

      const grantDriverAccess = hasDriverAccess || (hasManagerAccess && linkedDriverAccess);
      const grantManagerAccess = hasManagerAccess || (hasDriverAccess && linkedManagerAccess);

      if (grantDriverAccess && requireDriverDeviceId && !normalizeDeviceId(deviceId)) {
        return res.status(400).json({ error: 'A valid device identifier is required for driver access' });
      }

      const deviceSession = grantDriverAccess && driver
        ? await authorizeDriverDevice(supabase, {
          driverId: driver.id,
          accountId: driver.account_id,
          deviceId,
          deviceName
        })
        : null;
      const driverToken = grantDriverAccess && driver
        ? signToken(buildDriverAuthPayload(driver, driverAccountSummary, deviceSession), '12h')
        : null;
      const managerToken = grantManagerAccess && managerIdentity
        ? signToken(buildManagerAuthPayload(managerIdentity, managerAccountSummary), '24h')
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
          company_name: driverAccountSummary?.company_name || managerAccountSummary?.company_name || null
        }
      });
    } catch (error) {
      console.error('Mobile login failed:', error);
      return res.status(500).json({ error: 'Failed to log in' });
    }
  });

  router.post('/mobile/manager-driver-session', requireManager, async (req, res) => {
    try {
      const managerIdentity = req.account.manager_user_id
        ? await findManagerIdentityByManagerUserId(req.account.manager_user_id)
        : await findManagerIdentityByEmailForAccount(req.account.manager_email, req.account.account_id);

      if (!managerIdentity || managerIdentity.account_id !== req.account.account_id || managerIdentity.is_active === false) {
        return res.status(403).json({ error: 'Manager access required' });
      }

      const accountSummary = await getAccountSummary(req.account.account_id);
      const driver = managerIdentity.email
        ? await findDriverByEmailForAccount(managerIdentity.email, managerIdentity.account_id)
        : null;
      const linkedDriver = driver?.account_id === req.account.account_id && driver?.is_active !== false
        ? driver
        : null;
      const payload = linkedDriver
        ? buildDriverAuthPayload(linkedDriver, accountSummary)
        : buildManagerDriverModePayload(managerIdentity, accountSummary);

      return res.status(200).json({
        driver_token: signToken(payload, '12h'),
        driver_mode_source: linkedDriver ? 'driver' : 'manager'
      });
    } catch (error) {
      console.error('Manager driver session failed:', error);
      return res.status(500).json({ error: 'Failed to start driver mode' });
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

      const accountQuery = await supabase
        .from('accounts')
        .select('company_name')
        .eq('id', managerIdentity.account_id)
        .maybeSingle();

      if (accountQuery.error) {
        throw accountQuery.error;
      }

      let emailDelivery = {
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      };

      try {
        emailDelivery = await sendManagerPasswordResetEmail({
          to: managerIdentity.email,
          fullName: managerIdentity.full_name,
          resetUrl,
          companyName: accountQuery.data?.company_name
        });
      } catch (emailError) {
        console.error('Manager password reset email delivery failed:', emailError);
        emailDelivery = {
          delivered: false,
          skipped: false,
          reason: 'Email delivery failed'
        };
      }

      await trackPasswordEmail({
        accountId: managerIdentity.account_id,
        recipientEmail: managerIdentity.email,
        recipientType: 'manager',
        recipientId: managerIdentity.source === 'manager_user' ? managerIdentity.id : null,
        messageType: 'manager_password_reset',
        delivery: emailDelivery
      });

      if (process.env.NODE_ENV === 'production' && emailDelivery?.skipped) {
        return res.status(503).json({ error: 'Password reset email service is not configured yet' });
      }

      if (process.env.NODE_ENV === 'production' && !emailDelivery?.delivered) {
        return res.status(503).json({
          error: 'Password reset email could not be sent. Ask an admin to send a reset from Manager Access.'
        });
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

  router.post('/manager/change-password', requireManager, async (req, res) => {
    const currentPassword = String(req.body?.current_password || '');
    const nextPassword = String(req.body?.new_password || '');

    if (!currentPassword || !nextPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (!isStrongEnoughPassword(nextPassword)) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }

    if (currentPassword === nextPassword) {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    try {
      const managerIdentity = req.account.manager_user_id
        ? await findManagerIdentityByManagerUserId(req.account.manager_user_id)
        : await findManagerIdentityByEmailForAccount(req.account.manager_email, req.account.account_id);

      if (
        !managerIdentity ||
        managerIdentity.account_id !== req.account.account_id ||
        managerIdentity.is_active === false ||
        !managerIdentity.password_hash
      ) {
        return res.status(403).json({ error: 'Manager access required' });
      }

      const currentPasswordMatches = await bcrypt.compare(currentPassword, managerIdentity.password_hash);

      if (!currentPasswordMatches) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const managerPasswordHash = await bcrypt.hash(nextPassword, 10);
      await updateManagerIdentityPassword(managerIdentity, managerPasswordHash);

      return res.status(200).json({ message: 'Password updated.' });
    } catch (error) {
      console.error('Manager password change failed:', error);
      return res.status(500).json({ error: 'Failed to update password' });
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

      const managerIdentity = payload.manager_user_id
        ? await findManagerIdentityByManagerUserId(payload.manager_user_id)
        : await findManagerIdentityByEmailForAccount(payload.email, payload.account_id);

      if (
        !managerIdentity ||
        managerIdentity.account_id !== payload.account_id ||
        normalizeEmail(managerIdentity.email) !== normalizeEmail(payload.email) ||
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
