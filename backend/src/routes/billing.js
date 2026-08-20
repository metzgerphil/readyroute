const express = require('express');
const Stripe = require('stripe');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const defaultSupabase = require('../lib/supabase');
const { requireManager: defaultRequireManager } = require('../middleware/auth');
const { createBillingService } = require('../services/billing');
const { sendRraCompanyReadyEmail: defaultSendRraCompanyReadyEmail } = require('../services/managerInviteEmail');
const { AI_CONSENT_POLICY_VERSION } = require('../services/driverHelpPrivacy');
const { buildSignupPayload } = require('./waitlist');
const {
  createStripeSignupBillingService,
  hashSignupAccessNonce,
  normalizeBillingAddress,
  normalizeBillingInterval
} = require('../services/stripeSignupBilling');

function getStripeClient(stripeClient) {
  if (stripeClient) {
    return stripeClient;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: process.env.STRIPE_API_VERSION || '2026-06-24.dahlia',
    appInfo: { name: 'ReadyRoute', url: 'https://readyroute.org' }
  });
}

function createBillingRouter(options = {}) {
  const router = express.Router();
  const requireManager = options.requireManager || defaultRequireManager;
  const supabase = options.supabase || defaultSupabase;
  const stripeClient = options.stripeClient;
  const billingService = createBillingService({
    supabase,
    stripeClient,
    stripePriceId: options.stripePriceId,
    stripeMonthlyPriceId: options.stripeMonthlyPriceId,
    stripeAnnualPriceId: options.stripeAnnualPriceId
  });
  const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
  const now = options.now || (() => new Date());
  const sendRraCompanyReadyEmail = options.sendRraCompanyReadyEmail || defaultSendRraCompanyReadyEmail;
  const publicFormLimiter = options.publicFormLimiter || ((_req, _res, next) => next());
  const signupBillingService = createStripeSignupBillingService({
    supabase,
    stripeClient: stripeClient || (process.env.STRIPE_SECRET_KEY ? getStripeClient() : null),
    publishableKey: options.stripePublishableKey,
    priceId: options.stripePriceId,
    monthlyPriceId: options.stripeMonthlyPriceId,
    annualPriceId: options.stripeAnnualPriceId,
    signupEnabled: options.stripeSignupEnabled,
    liveBillingApproved: options.liveBillingApproved,
    taxEnabled: options.stripeTaxEnabled,
    taxRegistrationsConfirmed: options.stripeTaxRegistrationsConfirmed
  });

  function getStripe() {
    return getStripeClient(stripeClient);
  }

  function getSignupReturnBaseUrl() {
    return String(options.signupReturnUrl || process.env.STRIPE_SIGNUP_RETURN_URL || 'https://readyroute.org/signup').replace(/[?#].*$/, '');
  }

  function buildRraManagerAccessUrl({ accountId, manager, needsPassword }) {
    if (!needsPassword) return 'https://readyroute.org/portal';
    if (!jwtSecret) throw new Error('Manager invite signing is not configured');
    const token = jwt.sign({
      account_id: accountId,
      manager_user_id: manager.id,
      email: manager.email,
      purpose: 'manager_invite'
    }, jwtSecret, { expiresIn: '7d' });
    return `https://readyroute.org/portal?invite=${encodeURIComponent(token)}`;
  }

  function signupAccessNonceMatches(session, accessNonce) {
    const expectedHash = String(session?.metadata?.readyroute_access_nonce_hash || '');
    const actualHash = hashSignupAccessNonce(accessNonce);
    if (!/^[0-9a-f]{64}$/.test(expectedHash) || !/^[0-9a-f]{64}$/.test(actualHash)) return false;
    return crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actualHash, 'hex'));
  }

  async function finalizeSignupCheckout(sessionOrId, { password = null, accessNonce = null } = {}) {
    const stripe = getStripe();
    const session = typeof sessionOrId === 'string'
      ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand: ['setup_intent', 'setup_intent.payment_method'] })
      : sessionOrId;
    if (!session || session.mode !== 'setup' || session.status !== 'complete') {
      const error = new Error('Stripe checkout is not complete yet.');
      error.code = 'CHECKOUT_INCOMPLETE';
      throw error;
    }

    const requestedPassword = typeof password === 'string' ? password : '';
    if (requestedPassword && !signupAccessNonceMatches(session, accessNonce)) {
      const error = new Error('This secure password-setup session is no longer available. Use the password email or request a new link.');
      error.code = 'INVALID_SIGNUP_ACCESS';
      throw error;
    }
    const requestedPasswordHash = requestedPassword ? await bcrypt.hash(requestedPassword, 10) : null;

    const signupId = String(session.metadata?.readyroute_signup_id || '').trim();
    if (!signupId) throw new Error('Stripe checkout is missing the ReadyRoute signup reference');
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    let setupIntent = session.setup_intent;
    if (typeof setupIntent === 'string') {
      setupIntent = await stripe.setupIntents.retrieve(setupIntent, { expand: ['payment_method'] });
    }
    const paymentMethodId = typeof setupIntent?.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent?.payment_method?.id || null;
    if (!customerId || !paymentMethodId) throw new Error('Stripe checkout did not return a saved payment method');

    const { data: signup, error: signupError } = await supabase
      .from('early_access_signups')
      .select('id, name, email, phone_number, manager_name, manager_phone_number, cxpc_phone_number, csa_phone_number, company_csa, role, driver_count, billing_interval, billing_policy_version, billing_consent_at, ai_processing_authorized, ai_processing_policy_version, ai_processing_authorized_at, account_id, onboarding_status')
      .eq('id', signupId)
      .maybeSingle();
    if (signupError) throw signupError;
    if (!signup) throw new Error('ReadyRoute signup not found');

    const timestamp = now().toISOString();
    const setupUpdate = await supabase
      .from('early_access_signups')
      .update({
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        stripe_setup_intent_id: setupIntent?.id || null,
        stripe_payment_method_id: paymentMethodId,
        billing_setup_status: 'succeeded',
        onboarding_status: signup.account_id ? signup.onboarding_status : 'payment_complete',
        onboarding_error: null,
        updated_at: timestamp
      })
      .eq('id', signup.id);
    if (setupUpdate.error) throw setupUpdate.error;

    let account = null;
    if (signup.account_id) {
      const accountLookup = await supabase.from('accounts').select('id, company_name').eq('id', signup.account_id).maybeSingle();
      if (accountLookup.error) throw accountLookup.error;
      account = accountLookup.data;
    }
    if (!account) {
      const customerLookup = await supabase.from('accounts').select('id, company_name').eq('stripe_customer_id', customerId).maybeSingle();
      if (customerLookup.error) throw customerLookup.error;
      account = customerLookup.data;
    }

    let manager = null;
    let needsPassword = true;
    let passwordCreated = false;
    if (!account) {
      const existingManager = await supabase
        .from('manager_users')
        .select('password_hash')
        .eq('email', signup.email)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (existingManager.error) throw existingManager.error;
      // A password entered in the secure post-Stripe signup flow is the
      // password the new company identity must receive. Reusing an older
      // password from another company silently rejects the password the
      // customer just created and makes the new portal login appear broken.
      const managerPasswordHash = requestedPasswordHash || existingManager.data?.password_hash;
      const inaccessiblePasswordHash = managerPasswordHash || await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const accountInsert = await supabase
        .from('accounts')
        .insert({
          company_name: signup.company_csa,
          manager_email: signup.email,
          manager_password_hash: inaccessiblePasswordHash,
          vehicle_count: 0,
          plan: 'starter',
          subscription_status: 'incomplete',
          stripe_customer_id: customerId,
          stripe_default_payment_method_id: paymentMethodId,
          billing_setup_status: 'succeeded',
          billing_activation_status: 'ready',
          billing_access_status: 'not_provisioned',
          billing_interval: signup.billing_interval || 'monthly',
          billing_policy_version: signup.billing_policy_version || null,
          billing_consent_at: signup.billing_consent_at || null,
          rra_ai_processing_authorized: signup.ai_processing_authorized === true
            && signup.ai_processing_policy_version === AI_CONSENT_POLICY_VERSION,
          rra_ai_processing_policy_version: signup.ai_processing_policy_version || null,
          rra_ai_processing_authorized_at: signup.ai_processing_authorized_at || null,
          rra_cxpc_phone_number: signup.cxpc_phone_number,
          rra_csa_phone_number: signup.csa_phone_number,
          rra_primary_manager_name: signup.manager_name || signup.name,
          rra_primary_manager_phone_number: signup.manager_phone_number || signup.phone_number,
          rra_billing_treatment: 'standard'
        })
        .select('id, company_name')
        .single();
      if (accountInsert.error || !accountInsert.data) throw accountInsert.error || new Error('Company account was not created');
      account = accountInsert.data;
      needsPassword = !managerPasswordHash;
      passwordCreated = Boolean(requestedPasswordHash);
      const managerInsert = await supabase
        .from('manager_users')
        .insert({
          account_id: account.id,
          email: signup.email,
          full_name: signup.name,
          password_hash: managerPasswordHash || null,
          is_active: true,
          invited_at: timestamp,
          accepted_at: needsPassword ? null : timestamp
        })
        .select('id, email, full_name, password_hash')
        .single();
      if (managerInsert.error || !managerInsert.data) {
        await supabase.from('accounts').delete().eq('id', account.id);
        throw managerInsert.error || new Error('Company manager was not created');
      }
      manager = managerInsert.data;
      if (signup.ai_processing_authorized === true && signup.ai_processing_policy_version === AI_CONSENT_POLICY_VERSION) {
        const authorizationActorUpdate = await supabase
          .from('accounts')
          .update({ rra_ai_processing_authorized_by: manager.id })
          .eq('id', account.id);
        if (authorizationActorUpdate.error) throw authorizationActorUpdate.error;
      }
      const profileResult = await supabase.from('account_internal_profiles').upsert({
        account_id: account.id,
        lifecycle_status: 'onboarding',
        onboarding_stage: needsPassword ? 'manager_invited' : 'manager_active',
        updated_at: timestamp
      }, { onConflict: 'account_id' });
      if (profileResult.error) throw profileResult.error;
      const signupLink = await supabase.from('early_access_signups').update({
        account_id: account.id,
        onboarding_status: 'provisioned',
        updated_at: timestamp
      }).eq('id', signup.id);
      if (signupLink.error) throw signupLink.error;
    } else {
      const managerLookup = await supabase
        .from('manager_users')
        .select('id, email, full_name, password_hash')
        .eq('account_id', account.id)
        .eq('email', signup.email)
        .maybeSingle();
      if (managerLookup.error) throw managerLookup.error;
      manager = managerLookup.data;
      if (!manager) throw new Error('ReadyRoute manager account not found');
      needsPassword = !manager.password_hash;

      // The access nonce proves this request came from the browser that began
      // checkout, so an explicitly submitted password must also replace a
      // stale password when checkout completion is retried.
      if (requestedPasswordHash) {
        const managerPasswordUpdate = await supabase
          .from('manager_users')
          .update({ password_hash: requestedPasswordHash, accepted_at: timestamp })
          .eq('id', manager.id);
        if (managerPasswordUpdate.error) throw managerPasswordUpdate.error;
        const legacyPasswordUpdate = await supabase
          .from('accounts')
          .update({ manager_password_hash: requestedPasswordHash })
          .eq('id', account.id);
        if (legacyPasswordUpdate.error) throw legacyPasswordUpdate.error;
        manager.password_hash = requestedPasswordHash;
        needsPassword = false;
        passwordCreated = true;
        const profileUpdate = await supabase.from('account_internal_profiles').upsert({
          account_id: account.id,
          lifecycle_status: 'onboarding',
          onboarding_stage: 'manager_active',
          updated_at: timestamp
        }, { onConflict: 'account_id' });
        if (profileUpdate.error) throw profileUpdate.error;
      }

      if (!signup.account_id) {
        const signupLink = await supabase.from('early_access_signups').update({
          account_id: account.id,
          onboarding_status: 'provisioned',
          onboarding_error: null,
          updated_at: timestamp
        }).eq('id', signup.id);
        if (signupLink.error) throw signupLink.error;
        signup.account_id = account.id;
        signup.onboarding_status = 'provisioned';
      }
    }

    let delivery = { delivered: signup.onboarding_status === 'email_sent', skipped: signup.onboarding_status === 'email_sent' };
    if (signup.onboarding_status !== 'email_sent') {
      const accessUrl = buildRraManagerAccessUrl({ accountId: account.id, manager, needsPassword });
      try {
        delivery = await sendRraCompanyReadyEmail({
          to: manager.email,
          fullName: manager.full_name,
          companyName: account.company_name,
          accessUrl,
          needsPassword
        });
        const delivered = Boolean(delivery?.delivered);
        await supabase.from('early_access_signups').update({
          onboarding_status: delivered ? 'email_sent' : 'email_failed',
          onboarding_invite_sent_at: delivered ? timestamp : null,
          onboarding_email_provider_id: delivery?.provider_id || null,
          onboarding_error: delivered ? null : delivery?.reason || 'Email was not accepted for delivery',
          updated_at: timestamp
        }).eq('id', signup.id);
      } catch (emailError) {
        await supabase.from('early_access_signups').update({
          onboarding_status: 'email_failed',
          onboarding_error: String(emailError.message || emailError).slice(0, 1000),
          updated_at: timestamp
        }).eq('id', signup.id);
        delivery = { delivered: false, skipped: false };
      }
    }

    return {
      ok: true,
      account_id: account.id,
      company_name: account.company_name,
      email: manager.email,
      password_created: passwordCreated,
      password_already_set: Boolean(requestedPassword && !passwordCreated && manager.password_hash),
      onboarding_status: delivery.delivered ? 'email_sent' : 'email_failed',
      email_delivered: Boolean(delivery.delivered)
    };
  }

  function getRequestedRouteCommitment(body = {}) {
    return Number(body.route_count ?? body.routes ?? body.vehicle_count);
  }

  router.get('/signup/config', (_req, res) => {
    return res.status(200).json(signupBillingService.getSignupConfig());
  });

  router.post('/signup/checkout-session', express.json(), publicFormLimiter, async (req, res) => {
    const config = signupBillingService.getSignupConfig();
    if (!config.enabled) {
      return res.status(503).json({ error: 'Secure company enrollment is not available yet.', code: 'STRIPE_SIGNUP_DISABLED' });
    }
    const { payload, error: signupError } = buildSignupPayload(req.body, req);
    if (signupError) return res.status(400).json({ error: signupError });
    if (!payload.company_csa || !payload.manager_name || !payload.manager_phone_number || !payload.cxpc_phone_number || !payload.csa_phone_number || !payload.role || !Number.isInteger(payload.driver_count) || payload.driver_count < 1) {
      return res.status(400).json({ error: 'CSA name, day-to-day manager name and phone, CXPC phone, CSA phone, role, and at least one expected active driver are required.' });
    }
    if (!['owner', 'authorized officer', 'business contact'].includes(String(payload.role).toLowerCase())) {
      return res.status(400).json({ error: 'Company signup must be completed by an authorized officer (AO) or business contact (BC).' });
    }
    if (req.body?.billing_consent !== true) {
      return res.status(400).json({ error: 'Billing authorization is required before opening secure checkout.' });
    }
    if (req.body?.ai_processing_authorized !== true || req.body?.ai_processing_policy_version !== AI_CONSENT_POLICY_VERSION) {
      return res.status(400).json({
        error: 'Company AI-processing authorization is required before opening secure checkout.',
        current_policy_version: AI_CONSENT_POLICY_VERSION
      });
    }
    const requestId = String(req.body?.request_id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return res.status(400).json({ error: 'A valid signup request ID is required.' });
    }
    const billingInterval = normalizeBillingInterval(req.body?.billing_interval);
    if (!billingInterval) return res.status(400).json({ error: 'Choose monthly or annual billing.' });

    try {
      const signupRecord = { ...payload, billing_interval: billingInterval, onboarding_status: 'pending_payment' };
      const { data: signup, error: upsertError } = await supabase
        .from('early_access_signups')
        .upsert(signupRecord, { onConflict: 'email' })
        .select('id, name, email, company_csa, stripe_customer_id')
        .single();
      if (upsertError || !signup) throw upsertError || new Error('Signup was not saved');
      const returnBase = getSignupReturnBaseUrl();
      const checkout = await signupBillingService.createSignupCheckoutSession({
        signup,
        requestId,
        ip: req.ip,
        billingInterval,
        successUrl: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${returnBase}?checkout=canceled`
      });
      return res.status(201).json(checkout);
    } catch (error) {
      console.error('Hosted Stripe signup checkout failed:', error);
      return res.status(500).json({ error: 'Unable to open secure Stripe checkout.' });
    }
  });

  router.post('/signup/complete', express.json(), publicFormLimiter, async (req, res) => {
    const sessionId = String(req.body?.session_id || '').trim();
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return res.status(400).json({ error: 'A valid Stripe checkout session is required.' });
    }
    const password = String(req.body?.password || '');
    const accessNonce = String(req.body?.access_nonce || '');
    if (password && password.length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }
    try {
      return res.status(200).json(await finalizeSignupCheckout(sessionId, {
        password: password || null,
        accessNonce: accessNonce || null
      }));
    } catch (error) {
      if (error.code === 'CHECKOUT_INCOMPLETE') {
        return res.status(409).json({ error: error.message });
      }
      if (error.code === 'INVALID_SIGNUP_ACCESS') {
        return res.status(403).json({ error: error.message });
      }
      console.error('Ready Route Answers signup completion failed:', error);
      return res.status(500).json({ error: 'Payment was received, but company setup needs attention. Contact info@readyroute.org.' });
    }
  });

  router.get('/subscription-summary', requireManager, async (req, res) => {
    try {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, billing_setup_status, billing_activation_status, billing_access_status, billing_interval, billed_driver_count, subscription_status, stripe_customer_id, stripe_default_payment_method_id, stripe_subscription_id')
        .eq('id', req.account.account_id)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return res.status(404).json({ error: 'Account not found.' });

      const activeDriverCount = await signupBillingService.countActiveDrivers(account.id);
      const interval = normalizeBillingInterval(account.billing_interval) || 'monthly';
      const price = signupBillingService.getSignupConfig().prices[interval];
      return res.status(200).json({
        billing: {
          billing_interval: interval,
          billing_setup_status: account.billing_setup_status || 'not_started',
          billing_activation_status: account.billing_activation_status || 'not_started',
          billing_access_status: account.billing_access_status || 'not_provisioned',
          subscription_status: account.subscription_status || null,
          active_driver_count: activeDriverCount,
          billed_driver_count: Number(account.billed_driver_count || 0),
          payment_method_ready: Boolean(account.stripe_customer_id && account.stripe_default_payment_method_id && account.billing_setup_status === 'succeeded'),
          subscription_active: Boolean(account.stripe_subscription_id),
          unit_amount_cents: price.unit_amount_cents,
          estimated_total_cents: activeDriverCount * price.unit_amount_cents,
          currency: 'usd'
        }
      });
    } catch (error) {
      console.error('Driver subscription summary failed:', error);
      return res.status(500).json({ error: 'Unable to load subscription details.' });
    }
  });

  router.post('/signup/setup-intent', express.json(), publicFormLimiter, async (req, res) => {
    const config = signupBillingService.getSignupConfig();
    if (!config.enabled) {
      return res.status(503).json({ error: 'Secure payment setup is not available yet.', code: 'STRIPE_SIGNUP_DISABLED' });
    }

    const { payload, error: signupError } = buildSignupPayload(req.body, req);
    if (signupError) return res.status(400).json({ error: signupError });
    if (!payload.company_csa || !payload.manager_name || !payload.manager_phone_number || !payload.cxpc_phone_number || !payload.csa_phone_number || !payload.role || !Number.isInteger(payload.driver_count) || payload.driver_count < 1) {
      return res.status(400).json({ error: 'CSA name, day-to-day manager name and phone, CXPC phone, CSA phone, role, and at least one expected active driver are required.' });
    }
    if (req.body?.billing_consent !== true) {
      return res.status(400).json({ error: 'Billing authorization is required before saving a payment method.' });
    }
    if (req.body?.ai_processing_authorized !== true || req.body?.ai_processing_policy_version !== AI_CONSENT_POLICY_VERSION) {
      return res.status(400).json({
        error: 'Company AI-processing authorization is required before saving a payment method.',
        current_policy_version: AI_CONSENT_POLICY_VERSION
      });
    }
    const requestId = String(req.body?.request_id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      return res.status(400).json({ error: 'A valid signup request ID is required.' });
    }
    const { address, error: addressError } = normalizeBillingAddress(req.body);
    if (addressError) return res.status(400).json({ error: addressError });
    const billingInterval = normalizeBillingInterval(req.body?.billing_interval);
    if (!billingInterval) return res.status(400).json({ error: 'Choose monthly or annual billing.' });

    try {
      const signupRecord = {
        ...payload,
        billing_legal_name: String(req.body.billing_legal_name || payload.company_csa).trim().slice(0, 200),
        billing_address_line1: address.line1,
        billing_address_line2: address.line2 || null,
        billing_address_city: address.city,
        billing_address_state: address.state,
        billing_address_postal_code: address.postal_code,
        billing_address_country: address.country,
        billing_interval: billingInterval
      };
      const { data: signup, error: upsertError } = await supabase
        .from('early_access_signups')
        .upsert(signupRecord, { onConflict: 'email' })
        .select('id, name, email, company_csa, billing_legal_name, stripe_customer_id')
        .single();
      if (upsertError || !signup) throw upsertError || new Error('Signup was not saved');

      const paymentSetup = await signupBillingService.prepareSignupPayment({
        signup: { ...signup, billing_legal_name: signupRecord.billing_legal_name },
        address,
        requestId,
        ip: req.ip,
        billingInterval
      });
      return res.status(201).json(paymentSetup);
    } catch (error) {
      console.error('Stripe signup payment setup failed:', error);
      return res.status(500).json({ error: 'Unable to prepare secure payment setup.' });
    }
  });

  router.post('/portal', express.json(), requireManager, async (req, res) => {
    try {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, stripe_customer_id')
        .eq('id', req.account.account_id)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account?.stripe_customer_id) {
        return res.status(409).json({ error: 'Complete payment setup before opening billing management.' });
      }
      const session = await getStripe().billingPortal.sessions.create({
        customer: account.stripe_customer_id,
        return_url: process.env.STRIPE_PORTAL_RETURN_URL || 'https://readyroute.org/portal?view=billing'
      });
      return res.status(201).json({ url: session.url });
    } catch (error) {
      console.error('Stripe Customer Portal session failed:', error);
      return res.status(500).json({ error: 'Unable to open billing management.' });
    }
  });

  router.post('/setup', express.json(), requireManager, async (req, res) => {
    const routeCommitment = getRequestedRouteCommitment(req.body);

    if (!Number.isInteger(routeCommitment) || routeCommitment <= 0) {
      return res.status(400).json({ error: 'route_count must be a positive integer' });
    }

    try {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, company_name, manager_email, stripe_customer_id')
        .eq('id', req.account.account_id)
        .maybeSingle();

      if (accountError) {
        console.error('Billing setup account lookup failed:', accountError);
        return res.status(500).json({ error: 'Failed to load billing account' });
      }

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      await billingService.createCustomer(account.manager_email, account.company_name, account.id);
      const subscription = await billingService.createSubscription(account.id, routeCommitment, {
        billingInterval: normalizeBillingInterval(req.body?.billing_interval) || 'monthly'
      });

      return res.status(200).json({
        client_secret: subscription.client_secret,
        subscription_id: subscription.subscription_id
      });
    } catch (error) {
      console.error('Billing setup failed:', error);
      return res.status(500).json({ error: 'Failed to set up billing subscription' });
    }
  });

  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature || !webhookSecret) {
      return res.status(400).json({ error: 'Missing Stripe webhook signature configuration' });
    }

    let event;

    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    try {
      const object = event.data.object;
      const eventRecord = await supabase
        .from('stripe_webhook_events')
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          processing_status: 'ignored',
          object_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
          payload: {
            object_id: object.id || null,
            customer: typeof object.customer === 'string' ? object.customer : object.customer?.id || null,
            livemode: Boolean(event.livemode)
          }
        });

      if (eventRecord.error?.code === '23505') {
        return res.status(200).json({ received: true, duplicate: true });
      }
      if (eventRecord.error) {
        throw eventRecord.error;
      }

      if (event.type === 'checkout.session.completed' && object.mode === 'setup' && object.metadata?.readyroute_signup_id) {
        await finalizeSignupCheckout(object);
      }

      if (event.type === 'setup_intent.succeeded') {
        const paymentMethodId = typeof object.payment_method === 'string'
          ? object.payment_method
          : object.payment_method?.id || null;
        const setupUpdate = {
          stripe_setup_intent_id: object.id,
          stripe_payment_method_id: paymentMethodId,
          billing_setup_status: 'succeeded',
          updated_at: new Date().toISOString()
        };
        const signupUpdate = await supabase
          .from('early_access_signups')
          .update(setupUpdate)
          .eq('stripe_customer_id', object.customer);
        if (signupUpdate.error) throw signupUpdate.error;

        const accountUpdate = await supabase
          .from('accounts')
          .update({
            stripe_default_payment_method_id: paymentMethodId,
            billing_setup_status: 'succeeded',
            billing_activation_status: 'ready'
          })
          .eq('stripe_customer_id', object.customer);
        if (accountUpdate.error) throw accountUpdate.error;
      }

      if (event.type === 'setup_intent.setup_failed') {
        const signupUpdate = await supabase
          .from('early_access_signups')
          .update({ billing_setup_status: 'failed', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', object.customer);
        if (signupUpdate.error) throw signupUpdate.error;
      }

      if (['customer.subscription.created', 'customer.subscription.updated'].includes(event.type)) {
        const quantity = object.items?.data?.[0]?.quantity ?? 0;
        const subscriptionItemId = object.items?.data?.[0]?.id || null;
        const { error } = await supabase
          .from('accounts')
          .update({
            stripe_subscription_id: object.id,
            stripe_subscription_item_id: subscriptionItemId,
            subscription_status: object.status,
            billing_activation_status: object.status === 'active' ? 'active' : object.status === 'past_due' ? 'past_due' : 'creating',
            billed_driver_count: quantity
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const { error } = await supabase
          .from('accounts')
          .update({
            subscription_status: 'canceled',
            billing_activation_status: 'canceled',
            billing_access_status: 'revoked'
          })
          .eq('stripe_customer_id', object.customer);
        if (error) throw error;
      }

      if (event.type === 'invoice.payment_failed') {
        const { error } = await supabase
          .from('accounts')
          .update({
            subscription_status: 'past_due',
            billing_activation_status: 'past_due',
            billing_access_status: 'grace_period'
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      if (event.type === 'invoice.payment_action_required') {
        const { error } = await supabase
          .from('accounts')
          .update({
            billing_activation_status: 'action_required',
            billing_access_status: 'grace_period'
          })
          .eq('stripe_customer_id', object.customer);
        if (error) throw error;
      }

      if (event.type === 'invoice.finalization_failed') {
        const { error } = await supabase
          .from('accounts')
          .update({ billing_activation_status: 'action_required' })
          .eq('stripe_customer_id', object.customer);
        if (error) throw error;
      }

      if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const paidThroughSeconds = Math.max(0, ...(object.lines?.data || []).map((line) => Number(line.period?.end || 0)));
        const { error } = await supabase
          .from('accounts')
          .update({
            plan: 'pro',
            subscription_status: 'active',
            billing_activation_status: 'active',
            billing_access_status: 'provisioned',
            paid_through_at: paidThroughSeconds ? new Date(paidThroughSeconds * 1000).toISOString() : null
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      const usageReportId = object.metadata?.readyroute_usage_report_id || null;
      if (usageReportId && (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded' || event.type === 'invoice.payment_failed')) {
        const { error } = await supabase
          .from('billing_usage_reports')
          .update({
            stripe_invoice_id: object.id || null,
            status: event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded' ? 'invoiced' : 'reported',
            updated_at: new Date().toISOString()
          })
          .eq('id', usageReportId);

        if (error) {
          throw error;
        }
      }

      const { error: eventUpdateError } = await supabase
        .from('stripe_webhook_events')
        .update({
          processing_status: 'processed',
          processed_at: new Date().toISOString()
        })
        .eq('stripe_event_id', event.id);

      if (eventUpdateError) {
        throw eventUpdateError;
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      if (event?.id) {
        try {
          await supabase
            .from('stripe_webhook_events')
            .update({
              processing_status: 'failed',
              processed_at: new Date().toISOString()
            })
            .eq('stripe_event_id', event.id);
        } catch (_eventUpdateError) {
          // Keep the original webhook processing error as the primary failure.
        }
      }
      console.error('Stripe webhook processing failed:', error);
      return res.status(500).json({ error: 'Failed to process Stripe webhook' });
    }
  });

  return router;
}

module.exports.createBillingRouter = createBillingRouter;
