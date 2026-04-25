const express = require('express');
const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');
const { requireManager } = require('../middleware/auth');
const { createBillingService } = require('../services/billing');

function getStripeClient(stripeClient) {
  if (stripeClient) {
    return stripeClient;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function createBillingRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const stripeClient = options.stripeClient;
  const billingService = createBillingService({
    supabase,
    stripeClient,
    stripePriceId: options.stripePriceId
  });
  const webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

  function getStripe() {
    return getStripeClient(stripeClient);
  }

  router.post('/setup', express.json(), requireManager, async (req, res) => {
    const vehicleCount = Number(req.body?.vehicle_count);

    if (!Number.isInteger(vehicleCount) || vehicleCount <= 0) {
      return res.status(400).json({ error: 'vehicle_count must be a positive integer' });
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
      const subscription = await billingService.createSubscription(account.id, vehicleCount);

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

      if (event.type === 'customer.subscription.updated') {
        const quantity = object.items?.data?.[0]?.quantity ?? 0;
        const { error } = await supabase
          .from('accounts')
          .update({
            stripe_subscription_id: object.id,
            subscription_status: object.status,
            vehicle_count: quantity
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      if (event.type === 'invoice.payment_failed') {
        const { error } = await supabase
          .from('accounts')
          .update({
            plan: 'suspended',
            subscription_status: 'past_due'
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      if (event.type === 'invoice.payment_succeeded') {
        const { error } = await supabase
          .from('accounts')
          .update({
            plan: 'pro',
            subscription_status: 'active'
          })
          .eq('stripe_customer_id', object.customer);

        if (error) {
          throw error;
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('Stripe webhook processing failed:', error);
      return res.status(500).json({ error: 'Failed to process Stripe webhook' });
    }
  });

  return router;
}

module.exports.createBillingRouter = createBillingRouter;
