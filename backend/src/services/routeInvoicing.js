const Stripe = require('stripe');

const defaultSupabase = require('../lib/supabase');
const { getRouteBillingSummary } = require('./routeBilling');

function getBillingMode(env = process.env) {
  return String(env.ROUTE_BILLING_MODE || 'shadow').trim().toLowerCase();
}

function getStripeClient(override) {
  if (override) {
    return override;
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function createRouteInvoicingService(options = {}) {
  const supabase = options.supabase || defaultSupabase;
  const stripeClient = options.stripeClient;
  const summaryLoader = options.summaryLoader || getRouteBillingSummary;
  const nowProvider = options.nowProvider || (() => new Date());
  const billingMode = options.billingMode || getBillingMode(options.env);

  async function createPreview(accountId, month) {
    const summary = await summaryLoader({ supabase, accountId, month, nowProvider });
    if (!summary || summary.not_found) {
      return summary;
    }

    const overageAmountCents = summary.additional_route_count * summary.billing_rate_cents;
    const payload = {
      account_id: accountId,
      billing_period_start: summary.billing_period.start,
      billing_period_end: summary.billing_period.end,
      committed_route_count: summary.committed_route_count,
      imported_route_count: summary.imported_billable_routes,
      billable_quantity: summary.billable_quantity,
      additional_route_count: summary.additional_route_count,
      amount_cents: summary.estimated_total_cents,
      overage_amount_cents: overageAmountCents,
      currency: summary.currency,
      overage_authorization_id: summary.overage_authorization.authorization_id,
      status: 'draft',
      updated_at: nowProvider().toISOString(),
      metadata: {
        billing_mode: billingMode,
        authorization_status: summary.overage_authorization.status,
        current_terms_accepted: summary.overage_authorization.current_terms_accepted
      }
    };
    const { data, error } = await supabase
      .from('billing_usage_reports')
      .upsert(payload, { onConflict: 'account_id,billing_period_start' })
      .select('id, account_id, billing_period_start, billing_period_end, committed_route_count, imported_route_count, billable_quantity, additional_route_count, amount_cents, overage_amount_cents, currency, overage_authorization_id, stripe_invoice_id, status, updated_at')
      .single();

    if (error) {
      throw error;
    }

    return { summary, report: data || payload, billing_mode: billingMode };
  }

  async function createOverageInvoice(accountId, month) {
    const preview = await createPreview(accountId, month);
    if (!preview || preview.not_found) {
      return preview;
    }

    if (billingMode !== 'live') {
      return { ...preview, charged: false, reason: 'shadow_mode' };
    }

    const authorization = preview.summary.overage_authorization;
    if (!authorization.current_terms_accepted || !authorization.billing_enabled) {
      return { ...preview, charged: false, reason: 'overage_not_authorized_for_live_billing' };
    }

    if (preview.report.overage_amount_cents <= 0) {
      return { ...preview, charged: false, reason: 'no_overage' };
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, stripe_customer_id')
      .eq('id', accountId)
      .single();
    if (accountError) {
      throw accountError;
    }
    if (!account?.stripe_customer_id) {
      throw new Error('Account is missing a Stripe customer');
    }

    const stripe = getStripeClient(stripeClient);
    await stripe.invoiceItems.create({
      customer: account.stripe_customer_id,
      amount: preview.report.overage_amount_cents,
      currency: preview.report.currency,
      description: `${preview.report.additional_route_count} ReadyRoute additional route${preview.report.additional_route_count === 1 ? '' : 's'}`,
      metadata: {
        readyroute_usage_report_id: preview.report.id,
        readyroute_account_id: accountId
      }
    });
    const invoice = await stripe.invoices.create({
      customer: account.stripe_customer_id,
      collection_method: 'charge_automatically',
      auto_advance: true,
      metadata: {
        readyroute_usage_report_id: preview.report.id,
        readyroute_account_id: accountId
      }
    });
    const { error: reportError } = await supabase
      .from('billing_usage_reports')
      .update({
        stripe_invoice_id: invoice.id,
        status: 'reported',
        updated_at: nowProvider().toISOString()
      })
      .eq('id', preview.report.id);
    if (reportError) {
      throw reportError;
    }

    return { ...preview, charged: true, invoice_id: invoice.id, reason: null };
  }

  return { createPreview, createOverageInvoice };
}

module.exports = {
  createRouteInvoicingService,
  getBillingMode
};
