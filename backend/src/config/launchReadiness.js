function isEnabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function getLaunchReadiness(env = process.env) {
  const billingMode = String(env.ROUTE_BILLING_MODE || 'shadow').trim().toLowerCase();
  const fccAutomationEnabled = isEnabled(env.FEDEX_FCC_AUTOMATION_ENABLED);
  const fccApproved = isEnabled(env.READYROUTE_FCC_APPROVED);
  const liveBillingApproved = isEnabled(env.READYROUTE_LIVE_BILLING_APPROVED);
  const mapsConfigured = Boolean(String(env.GOOGLE_MAPS_API_KEY || '').trim());
  const optimizationProjectConfigured = Boolean(String(
    env.GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID ||
    env.GOOGLE_CLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT_ID ||
    env.GCLOUD_PROJECT ||
    ''
  ).trim());
  const stripeConfigured = Boolean(String(env.STRIPE_SECRET_KEY || '').trim());
  const stripeWebhookConfigured = Boolean(String(env.STRIPE_WEBHOOK_SECRET || '').trim());
  const errors = [];
  const warnings = [];

  if (!mapsConfigured) {
    errors.push('GOOGLE_MAPS_API_KEY is missing. Manifest geocoding will be disabled.');
  }
  if (!optimizationProjectConfigured) {
    warnings.push('No explicit Google project is configured. Route optimization will rely on Application Default Credentials project discovery.');
  }
  if (fccAutomationEnabled && !fccApproved) {
    errors.push('FCC automation is enabled before READYROUTE_FCC_APPROVED=true.');
  }
  if (billingMode !== 'shadow' && billingMode !== 'live') {
    errors.push('ROUTE_BILLING_MODE must be shadow or live.');
  }
  if (billingMode === 'live' && !liveBillingApproved) {
    errors.push('Live route billing requires READYROUTE_LIVE_BILLING_APPROVED=true.');
  }
  if (billingMode === 'live' && (!stripeConfigured || !stripeWebhookConfigured)) {
    errors.push('Live route billing requires Stripe secret and webhook configuration.');
  }

  return {
    ready: errors.length === 0,
    modes: {
      billing: billingMode,
      fcc: fccAutomationEnabled ? 'enabled' : 'paused'
    },
    capabilities: {
      maps_geocoding: mapsConfigured,
      route_optimization: optimizationProjectConfigured,
      stripe: stripeConfigured,
      stripe_webhooks: stripeWebhookConfigured
    },
    errors,
    warnings
  };
}

module.exports = {
  getLaunchReadiness,
  isEnabled
};
