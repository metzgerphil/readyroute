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
  const stripeSignupEnabled = isEnabled(env.STRIPE_SIGNUP_ENABLED);
  const stripePublishableConfigured = Boolean(String(env.STRIPE_PUBLISHABLE_KEY || '').trim());
  const stripeMonthlyPriceConfigured = Boolean(String(env.STRIPE_MONTHLY_PRICE_ID || env.STRIPE_PRICE_ID || '').trim());
  const stripeAnnualPriceConfigured = Boolean(String(env.STRIPE_ANNUAL_PRICE_ID || '').trim());
  const stripePricesConfigured = stripeMonthlyPriceConfigured && stripeAnnualPriceConfigured;
  const stripeTaxEnabled = isEnabled(env.STRIPE_TAX_ENABLED);
  const stripeTaxRegistrationsConfirmed = isEnabled(env.STRIPE_TAX_REGISTRATIONS_CONFIRMED);
  const driverHelpModelConfigured = Boolean(String(env.READYROUTE_DRIVER_HELP_MODEL || '').trim());
  const openAiConfigured = Boolean(String(env.OPENAI_API_KEY || '').trim());
  const driverHelpAiInterpretationMode = String(
    env.READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE || ''
  ).trim().toUpperCase();
  const driverHelpAiInterpretationEnabled = (
    driverHelpAiInterpretationMode === 'ACTIVE' ||
    isEnabled(env.READYROUTE_DRIVER_HELP_AI_INTERPRETATION_ENABLED)
  ) && driverHelpModelConfigured && openAiConfigured;
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
  if (stripeSignupEnabled && (!stripeConfigured || !stripePublishableConfigured || !stripeWebhookConfigured)) {
    errors.push('Stripe signup requires secret, publishable, and webhook configuration.');
  }
  if (stripeSignupEnabled && !stripePricesConfigured) {
    errors.push('Stripe signup requires monthly and annual Stripe price IDs.');
  }
  if (liveBillingApproved && !stripePricesConfigured) {
    errors.push('Live Stripe billing requires STRIPE_MONTHLY_PRICE_ID and STRIPE_ANNUAL_PRICE_ID.');
  }
  if (stripeTaxEnabled && !stripeTaxRegistrationsConfirmed) {
    errors.push('Stripe Tax cannot be enabled until STRIPE_TAX_REGISTRATIONS_CONFIRMED=true.');
  }

  return {
    ready: errors.length === 0,
    modes: {
      billing: billingMode,
      fcc: fccAutomationEnabled ? 'enabled' : 'paused',
      rra_answer_policy: 'quality_first'
    },
    capabilities: {
      maps_geocoding: mapsConfigured,
      route_optimization: optimizationProjectConfigured,
      stripe: stripeConfigured,
      stripe_webhooks: stripeWebhookConfigured,
      stripe_signup: stripeSignupEnabled && stripeConfigured && stripePublishableConfigured,
      stripe_tax: stripeTaxEnabled && stripeTaxRegistrationsConfirmed,
      driver_help_ai_interpretation: driverHelpAiInterpretationEnabled
    },
    errors,
    warnings
  };
}

module.exports = {
  getLaunchReadiness,
  isEnabled
};
