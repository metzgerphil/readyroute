const crypto = require('crypto');

const BILLING_POLICY_VERSION = '2026-08-15-v2';
const BILLING_INTERVALS = Object.freeze({
  monthly: { unit_amount_cents: 1000, stripe_interval: 'month' },
  annual: { unit_amount_cents: 10000, stripe_interval: 'year' }
});

function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeBillingAddress(body = {}) {
  const address = {
    line1: String(body.billing_address_line1 || '').trim(),
    line2: String(body.billing_address_line2 || '').trim() || undefined,
    city: String(body.billing_address_city || '').trim(),
    state: String(body.billing_address_state || '').trim(),
    postal_code: String(body.billing_address_postal_code || '').trim(),
    country: String(body.billing_address_country || 'US').trim().toUpperCase()
  };

  if (!address.line1 || !address.city || !address.state || !address.postal_code || address.country !== 'US') {
    return { error: 'A complete United States billing address is required.' };
  }

  return { address };
}

function hashConsentIp(ip, salt = process.env.BILLING_CONSENT_HASH_SALT || process.env.JWT_SECRET || '') {
  if (!ip || !salt) return null;
  return crypto.createHmac('sha256', salt).update(String(ip)).digest('hex');
}

function hashSignupAccessNonce(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeBillingInterval(value) {
  const interval = String(value || 'monthly').trim().toLowerCase();
  return Object.hasOwn(BILLING_INTERVALS, interval) ? interval : null;
}

function createStripeSignupBillingService(options = {}) {
  const supabase = options.supabase;
  const stripe = options.stripeClient;
  const publishableKey = options.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY;
  const monthlyPriceId = options.monthlyPriceId || options.priceId || process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID;
  const annualPriceId = options.annualPriceId || process.env.STRIPE_ANNUAL_PRICE_ID;
  const signupEnabled = options.signupEnabled ?? isEnabled(process.env.STRIPE_SIGNUP_ENABLED);
  const liveBillingApproved = options.liveBillingApproved ?? isEnabled(process.env.READYROUTE_LIVE_BILLING_APPROVED);
  const taxEnabled = options.taxEnabled ?? isEnabled(process.env.STRIPE_TAX_ENABLED);
  const taxRegistrationsConfirmed = options.taxRegistrationsConfirmed ?? isEnabled(process.env.STRIPE_TAX_REGISTRATIONS_CONFIRMED);

  function getSignupConfig() {
    const enabled = Boolean(signupEnabled && stripe && monthlyPriceId && annualPriceId);
    return {
      enabled,
      checkout_mode: 'hosted',
      publishable_key: enabled && publishableKey ? publishableKey : null,
      unit_amount_cents: BILLING_INTERVALS.monthly.unit_amount_cents,
      prices: BILLING_INTERVALS,
      currency: 'usd',
      billing_policy_version: BILLING_POLICY_VERSION,
      charges_begin_at_activation: true,
      live_billing_approved: Boolean(liveBillingApproved),
      automatic_tax_enabled: Boolean(taxEnabled && taxRegistrationsConfirmed)
    };
  }

  async function createSignupCheckoutSession({ signup, requestId, ip, billingInterval, successUrl, cancelUrl }) {
    if (!getSignupConfig().enabled) {
      const error = new Error('Stripe signup is not enabled');
      error.code = 'STRIPE_SIGNUP_DISABLED';
      throw error;
    }

    const normalizedInterval = normalizeBillingInterval(billingInterval);
    if (!normalizedInterval) {
      const error = new Error('Choose monthly or annual billing.');
      error.code = 'INVALID_BILLING_INTERVAL';
      throw error;
    }
    if (!successUrl || !cancelUrl) {
      throw new Error('Signup checkout return URLs are required');
    }

    let customerId = signup.stripe_customer_id;
    const customerPayload = {
      email: signup.email,
      name: signup.company_csa,
      metadata: { readyroute_signup_id: signup.id }
    };
    if (customerId) {
      await stripe.customers.update(customerId, customerPayload);
    } else {
      const customer = await stripe.customers.create(customerPayload, {
        idempotencyKey: `readyroute-signup-customer:${signup.id}`
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      customer: customerId,
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        readyroute_signup_id: signup.id,
        billing_policy_version: BILLING_POLICY_VERSION,
        billing_interval: normalizedInterval,
        readyroute_access_nonce_hash: hashSignupAccessNonce(requestId)
      },
      setup_intent_data: {
        metadata: {
          readyroute_signup_id: signup.id,
          billing_policy_version: BILLING_POLICY_VERSION,
          billing_interval: normalizedInterval
        }
      }
    }, {
      idempotencyKey: `readyroute-signup-checkout:${signup.id}:${requestId}`
    });

    const consentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('early_access_signups')
      .update({
        stripe_customer_id: customerId,
        stripe_checkout_session_id: session.id,
        billing_setup_status: 'processing',
        onboarding_status: 'pending_payment',
        billing_policy_version: BILLING_POLICY_VERSION,
        billing_interval: normalizedInterval,
        billing_consent_at: consentAt,
        billing_consent_ip_hash: hashConsentIp(ip),
        onboarding_error: null,
        updated_at: consentAt
      })
      .eq('id', signup.id);
    if (updateError) throw updateError;

    return {
      checkout_url: session.url,
      checkout_session_id: session.id,
      billing_policy_version: BILLING_POLICY_VERSION,
      billing_interval: normalizedInterval
    };
  }

  async function prepareSignupPayment({ signup, address, requestId, ip, billingInterval }) {
    if (!getSignupConfig().enabled) {
      const error = new Error('Stripe signup is not enabled');
      error.code = 'STRIPE_SIGNUP_DISABLED';
      throw error;
    }

    const normalizedInterval = normalizeBillingInterval(billingInterval);
    if (!normalizedInterval) {
      const error = new Error('Choose monthly or annual billing.');
      error.code = 'INVALID_BILLING_INTERVAL';
      throw error;
    }

    let customerId = signup.stripe_customer_id;
    const customerPayload = {
      email: signup.email,
      name: signup.billing_legal_name || signup.company_csa,
      address,
      metadata: { readyroute_signup_id: signup.id }
    };

    if (customerId) {
      await stripe.customers.update(customerId, customerPayload);
    } else {
      const customer = await stripe.customers.create(customerPayload, {
        idempotencyKey: `readyroute-signup-customer:${signup.id}`
      });
      customerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      metadata: {
        readyroute_signup_id: signup.id,
        billing_policy_version: BILLING_POLICY_VERSION,
        billing_interval: normalizedInterval
      }
    }, {
      idempotencyKey: `readyroute-signup-setup:${signup.id}:${requestId}`
    });

    const consentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('early_access_signups')
      .update({
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntent.id,
        billing_setup_status: 'processing',
        billing_policy_version: BILLING_POLICY_VERSION,
        billing_interval: normalizedInterval,
        billing_consent_at: consentAt,
        billing_consent_ip_hash: hashConsentIp(ip),
        updated_at: consentAt
      })
      .eq('id', signup.id);

    if (updateError) throw updateError;

    return {
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
      publishable_key: publishableKey,
      billing_policy_version: BILLING_POLICY_VERSION,
      billing_interval: normalizedInterval
    };
  }

  async function countActiveDrivers(accountId) {
    const { data, error } = await supabase
      .from('drivers')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true);
    if (error) throw error;
    return (data || []).length;
  }

  async function activateSubscription(accountId) {
    if (!liveBillingApproved) {
      const error = new Error('Live billing has not been approved for activation');
      error.code = 'LIVE_BILLING_NOT_APPROVED';
      throw error;
    }
    if (!stripe || !monthlyPriceId || !annualPriceId) {
      const error = new Error('Stripe subscription activation is not configured');
      error.code = 'STRIPE_ACTIVATION_DISABLED';
      throw error;
    }
    if (taxEnabled && !taxRegistrationsConfirmed) {
      const error = new Error('Stripe Tax cannot be enabled until registrations are confirmed');
      error.code = 'STRIPE_TAX_NOT_READY';
      throw error;
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, stripe_customer_id, stripe_subscription_id, stripe_default_payment_method_id, billing_setup_status, billing_interval, rra_billing_treatment')
      .eq('id', accountId)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error('Account not found');
    if (account.rra_billing_treatment === 'complimentary') {
      const error = new Error('Complimentary accounts do not require billing activation');
      error.code = 'COMPLIMENTARY_ACCOUNT';
      throw error;
    }
    if (account.stripe_subscription_id) {
      return { subscription_id: account.stripe_subscription_id, already_exists: true };
    }
    if (!account.stripe_customer_id || !account.stripe_default_payment_method_id || account.billing_setup_status !== 'succeeded') {
      const error = new Error('A verified payment method is required before activation');
      error.code = 'PAYMENT_SETUP_REQUIRED';
      throw error;
    }

    const billingInterval = normalizeBillingInterval(account.billing_interval);
    if (!billingInterval) {
      const error = new Error('Choose monthly or annual billing before activation');
      error.code = 'INVALID_BILLING_INTERVAL';
      throw error;
    }
    const priceId = billingInterval === 'annual' ? annualPriceId : monthlyPriceId;

    const activeDriverCount = await countActiveDrivers(accountId);
    if (activeDriverCount < 1) {
      const error = new Error('Add at least one active driver before activating billing');
      error.code = 'ACTIVE_DRIVER_REQUIRED';
      throw error;
    }

    await supabase.from('accounts').update({ billing_activation_status: 'creating' }).eq('id', accountId);

    const payload = {
      customer: account.stripe_customer_id,
      items: [{ price: priceId, quantity: activeDriverCount }],
      collection_method: 'charge_automatically',
      default_payment_method: account.stripe_default_payment_method_id,
      payment_behavior: 'default_incomplete',
      metadata: { readyroute_account_id: accountId, billing_interval: billingInterval },
      expand: ['latest_invoice']
    };
    if (taxEnabled && taxRegistrationsConfirmed) {
      payload.automatic_tax = { enabled: true };
    }

    const subscription = await stripe.subscriptions.create(payload, {
      idempotencyKey: `readyroute-activate:${accountId}:${billingInterval}:${BILLING_POLICY_VERSION}`
    });
    const subscriptionItem = subscription.items?.data?.[0];
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        stripe_subscription_id: subscription.id,
        stripe_subscription_item_id: subscriptionItem?.id || null,
        subscription_status: subscription.status,
        billing_activation_status: subscription.status === 'active' ? 'active' : 'creating',
        billed_driver_count: activeDriverCount,
        billing_access_status: subscription.status === 'active' ? 'provisioned' : 'not_provisioned',
        billing_interval: billingInterval
      })
      .eq('id', accountId);
    if (updateError) throw updateError;

    return {
      subscription_id: subscription.id,
      status: subscription.status,
      billing_interval: billingInterval,
      active_driver_count: activeDriverCount,
      already_exists: false
    };
  }

  return {
    activateSubscription,
    countActiveDrivers,
    createSignupCheckoutSession,
    getSignupConfig,
    prepareSignupPayment
  };
}

module.exports = {
  BILLING_POLICY_VERSION,
  BILLING_INTERVALS,
  createStripeSignupBillingService,
  hashConsentIp,
  hashSignupAccessNonce,
  isEnabled,
  normalizeBillingInterval,
  normalizeBillingAddress
};
