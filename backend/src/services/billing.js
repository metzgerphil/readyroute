const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');
const { updateRouteBillingSettings } = require('./routeBilling');

function getStripeClient(stripeClient) {
  if (stripeClient) {
    return stripeClient;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function loadAccount(supabase, accountId) {
  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id, company_name, manager_email, stripe_customer_id, stripe_subscription_id, subscription_status, vehicle_count, plan'
    )
    .eq('id', accountId)
    .maybeSingle();

  return { data, error };
}

function createBillingService(options = {}) {
  const supabase = options.supabase || defaultSupabase;
  const stripeClient = options.stripeClient;
  const stripePriceId = options.stripePriceId || process.env.STRIPE_PRICE_ID;
  const trialDays = Number(options.trialDays || process.env.STRIPE_TRIAL_DAYS || 14);

  function getStripe() {
    return getStripeClient(stripeClient);
  }

  async function createCustomer(email, companyName, accountId) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.stripe_customer_id) {
      return account.stripe_customer_id;
    }

    const customer = await getStripe().customers.create({
      email,
      name: companyName,
      metadata: {
        account_id: accountId
      }
    });

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        stripe_customer_id: customer.id
      })
      .eq('id', accountId);

    if (updateError) {
      throw updateError;
    }

    return customer.id;
  }

  async function createSubscription(accountId, vehicleCount) {
    if (!stripePriceId) {
      throw new Error('Missing STRIPE_PRICE_ID environment variable');
    }

    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (!account.stripe_customer_id) {
      throw new Error('Account is missing a Stripe customer');
    }

    const subscription = await getStripe().subscriptions.create({
      customer: account.stripe_customer_id,
      items: [
        {
          price: stripePriceId,
          quantity: vehicleCount
        }
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent']
    });

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        vehicle_count: vehicleCount,
        plan: subscription.status === 'active' ? 'pro' : 'starter'
      })
      .eq('id', accountId);

    if (updateError) {
      throw updateError;
    }

    const billingSettingsResult = await updateRouteBillingSettings({
      supabase,
      accountId,
      committedRouteCount: vehicleCount
    });

    if (!billingSettingsResult.valid) {
      throw new Error(billingSettingsResult.error);
    }

    return {
      subscription_id: subscription.id,
      client_secret: subscription.latest_invoice?.payment_intent?.client_secret || null,
      status: subscription.status
    };
  }

  async function createTrialCheckoutSession(accountId, vehicleCount, { successUrl, cancelUrl } = {}) {
    if (!stripePriceId) {
      throw new Error('Missing STRIPE_PRICE_ID environment variable');
    }

    if (!successUrl || !cancelUrl) {
      throw new Error('Trial checkout requires success and cancel URLs');
    }

    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (!account.stripe_customer_id) {
      throw new Error('Account is missing a Stripe customer');
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer: account.stripe_customer_id,
      line_items: [
        {
          price: stripePriceId,
          quantity: vehicleCount
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: trialDays,
        metadata: {
          account_id: accountId
        }
      }
    });

    return {
      session_id: session.id,
      url: session.url
    };
  }

  async function updateSubscriptionQuantity(accountId, newVehicleCount) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account?.stripe_subscription_id) {
      throw new Error('Account is missing a Stripe subscription');
    }

    const subscription = await getStripe().subscriptions.retrieve(account.stripe_subscription_id);
    const itemId = subscription.items?.data?.[0]?.id;

    if (!itemId) {
      throw new Error('Stripe subscription is missing a price item');
    }

    const updatedSubscription = await getStripe().subscriptions.update(account.stripe_subscription_id, {
      items: [
        {
          id: itemId,
          quantity: newVehicleCount
        }
      ]
    });

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        vehicle_count: newVehicleCount,
        subscription_status: updatedSubscription.status
      })
      .eq('id', accountId);

    if (updateError) {
      throw updateError;
    }

    const billingSettingsResult = await updateRouteBillingSettings({
      supabase,
      accountId,
      committedRouteCount: newVehicleCount
    });

    if (!billingSettingsResult.valid) {
      throw new Error(billingSettingsResult.error);
    }

    return updatedSubscription.id;
  }

  async function getSubscriptionStatus(accountId) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account?.stripe_subscription_id) {
      return null;
    }

    const subscription = await getStripe().subscriptions.retrieve(account.stripe_subscription_id);

    return {
      subscription_id: subscription.id,
      status: subscription.status,
      quantity: subscription.items?.data?.[0]?.quantity ?? null
    };
  }

  async function scheduleAccountCancellation(accountId, { now = new Date() } = {}) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    let subscription = null;

    if (account.stripe_subscription_id) {
      try {
        subscription = await getStripe().subscriptions.update(account.stripe_subscription_id, {
          cancel_at_period_end: true
        });
      } catch (error) {
        if (error?.code !== 'resource_missing') {
          throw error;
        }
      }
    }

    const currentPeriodEndSeconds = Number(subscription?.current_period_end || 0);
    const requestedAt = now instanceof Date ? now : new Date(now);
    const serviceEndsAt = currentPeriodEndSeconds > 0
      ? new Date(currentPeriodEndSeconds * 1000)
      : requestedAt;

    return {
      account_id: account.id,
      subscription_id: account.stripe_subscription_id || null,
      cancel_at_period_end: Boolean(subscription?.cancel_at_period_end || account.stripe_subscription_id),
      service_ends_at: serviceEndsAt.toISOString()
    };
  }

  async function resumeAccountSubscription(accountId) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (!account.stripe_subscription_id) {
      return {
        account_id: account.id,
        subscription_id: null,
        resumed: true
      };
    }

    try {
      const subscription = await getStripe().subscriptions.update(account.stripe_subscription_id, {
        cancel_at_period_end: false
      });

      return {
        account_id: account.id,
        subscription_id: subscription.id || account.stripe_subscription_id,
        resumed: true
      };
    } catch (error) {
      if (error?.code === 'resource_missing') {
        return {
          account_id: account.id,
          subscription_id: account.stripe_subscription_id,
          resumed: false
        };
      }

      throw error;
    }
  }

  return {
    createCustomer,
    createSubscription,
    createTrialCheckoutSession,
    updateSubscriptionQuantity,
    getSubscriptionStatus,
    scheduleAccountCancellation,
    resumeAccountSubscription
  };
}

module.exports.createBillingService = createBillingService;
