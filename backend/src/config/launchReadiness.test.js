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
