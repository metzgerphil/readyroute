const assert = require('node:assert/strict');
const test = require('node:test');

const { getLaunchReadiness } = require('./launchReadiness');

test('launch readiness keeps FCC paused and billing shadowed by default', () => {
  const readiness = getLaunchReadiness({
    GOOGLE_MAPS_API_KEY: 'maps-key',
    GOOGLE_CLOUD_PROJECT: 'ready-route-project',
    STRIPE_SECRET_KEY: 'stripe-key'
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.modes.billing, 'shadow');
  assert.equal(readiness.modes.fcc, 'paused');
  assert.equal(readiness.modes.rra_answer_policy, 'quality_first');
});

test('launch readiness fails closed when live systems are enabled without approval', () => {
  const readiness = getLaunchReadiness({
    GOOGLE_MAPS_API_KEY: 'maps-key',
    GOOGLE_CLOUD_PROJECT: 'ready-route-project',
    FEDEX_FCC_AUTOMATION_ENABLED: 'true',
    ROUTE_BILLING_MODE: 'live'
  });

  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(' '), /FCC automation/);
  assert.match(readiness.errors.join(' '), /Live route billing/);
});

test('launch readiness reports AI answer capabilities only when fully configured', () => {
  const active = getLaunchReadiness({
    GOOGLE_MAPS_API_KEY: 'maps-key',
    GOOGLE_CLOUD_PROJECT: 'ready-route-project',
    OPENAI_API_KEY: 'openai-key',
    READYROUTE_DRIVER_HELP_MODEL: 'readyroute-model',
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE: 'ACTIVE'
  });
  const missingKey = getLaunchReadiness({
    READYROUTE_DRIVER_HELP_MODEL: 'readyroute-model',
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE: 'ACTIVE'
  });

  assert.equal(active.capabilities.driver_help_ai_interpretation, true);
  assert.equal(missingKey.capabilities.driver_help_ai_interpretation, false);
  assert.equal(active.capabilities.driver_help_ai_composition, undefined);
});
