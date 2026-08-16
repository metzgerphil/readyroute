const express = require('express');
const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');
const { requireManager: defaultRequireManager } = require('../middleware/auth');
const { createBillingService } = require('../services/billing');
const { buildSignupPayload } = require('./waitlist');
const {
  createStripeSignupBillingService,
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

  function getRequestedRouteCommitment(body = {}) {
    return Number(body.route_count ?? body.routes ?? body.vehicle_count);
  }

  router.get('/signup/config', (_req, res) => {
    return res.status(200).json(signupBillingService.getSignupConfig());
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
    if (!payload.company_csa || !payload.phone_number || !payload.role || !Number.isInteger(payload.driver_count) || payload.driver_count < 1) {
      return res.status(400).json({ error: 'Company, phone, role, and at least one expected active driver are required.' });
    }
    if (req.body?.billing_consent !== true) {
      return res.status(400).json({ error: 'Billing authorization is required before saving a payment method.' });
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
        return_url: process.env.STRIPE_PORTAL_RETURN_URL || 'https://portal.readyroute.org/settings/billing'
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
