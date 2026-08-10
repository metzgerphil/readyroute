const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDriverMonthChargeKey,
  getUtcBillingMonth,
  summarizeDriverMonthCharges
} = require('./driverMonthBilling');

test('activation at any time uses the full UTC calendar-month charge', () => {
  assert.equal(getUtcBillingMonth('2026-08-31T23:59:59Z'), '2026-08-01');
  assert.deepEqual(summarizeDriverMonthCharges([{ unit_amount_cents: 500, charge_status: 'accrued' }], 1), {
    active_driver_count: 1,
    charged_driver_count: 1,
    unit_amount_cents: 500,
    total_amount_cents: 500,
    currency: 'usd',
    live_charging_enabled: false
  });
});

test('same-month deactivation and reactivation resolve to one idempotency key', () => {
  assert.equal(
    getDriverMonthChargeKey('company-1', 'driver-1', '2026-08-02T12:00:00Z'),
    getDriverMonthChargeKey('company-1', 'driver-1', '2026-08-29T12:00:00Z')
  );
});

test('a subsequent month creates a different charge key', () => {
  assert.notEqual(
    getDriverMonthChargeKey('company-1', 'driver-1', '2026-08-31T23:59:59Z'),
    getDriverMonthChargeKey('company-1', 'driver-1', '2026-09-01T00:00:00Z')
  );
});

test('deactivated drivers remain charged for accrued month but voided corrections do not total', () => {
  const summary = summarizeDriverMonthCharges([
    { unit_amount_cents: 500, charge_status: 'accrued' },
    { unit_amount_cents: 500, charge_status: 'voided' }
  ], 0);
  assert.equal(summary.active_driver_count, 0);
  assert.equal(summary.charged_driver_count, 1);
  assert.equal(summary.total_amount_cents, 500);
});
