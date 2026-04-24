const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');

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

  async function closeAccount(accountId, { deleteCustomer = false } = {}) {
    const { data: account, error: accountError } = await loadAccount(supabase, accountId);

    if (accountError) {
      throw accountError;
    }

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.stripe_subscription_id) {
      try {
        await getStripe().subscriptions.cancel(account.stripe_subscription_id);
      } catch (error) {
        if (error?.code !== 'resource_missing') {
          throw error;
        }
      }
    }

    if (deleteCustomer && account.stripe_customer_id) {
      try {
        await getStripe().customers.del(account.stripe_customer_id);
      } catch (error) {
        if (error?.code !== 'resource_missing') {
          throw error;
        }
      }
    }

    return {
      account_id: account.id,
      canceled_subscription_id: account.stripe_subscription_id || null,
      deleted_customer_id: deleteCustomer ? account.stripe_customer_id || null : null
    };
  }

  return {
    createCustomer,
    createSubscription,
    createTrialCheckoutSession,
    updateSubscriptionQuantity,
    getSubscriptionStatus,
    closeAccount
  };
}

module.exports.createBillingService = createBillingService;
