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

test('zero drivers and zero ledger rows produce a zero-dollar month', () => {
  assert.deepEqual(summarizeDriverMonthCharges([], 0), {
    active_driver_count: 0,
    charged_driver_count: 0,
    unit_amount_cents: 500,
    total_amount_cents: 0,
    currency: 'usd',
    live_charging_enabled: false
  });
});

test('multiple driver-month rows total exactly five dollars each regardless of active count', () => {
  const summary = summarizeDriverMonthCharges([
    { unit_amount_cents: 500, charge_status: 'accrued' },
    { unit_amount_cents: 500, charge_status: 'invoiced' },
    { unit_amount_cents: 500, charge_status: 'paid' }
  ], 2);
  assert.equal(summary.active_driver_count, 2);
  assert.equal(summary.charged_driver_count, 3);
  assert.equal(summary.total_amount_cents, 1500);
});

test('UTC month transition is exact at midnight with no proration', () => {
  assert.equal(getUtcBillingMonth('2026-08-31T23:59:59.999Z'), '2026-08-01');
  assert.equal(getUtcBillingMonth('2026-09-01T00:00:00.000Z'), '2026-09-01');
});

test('invalid activation dates and incomplete idempotency identities fail closed', () => {
  assert.throws(() => getUtcBillingMonth('not-a-date'), /valid activation date/i);
  assert.throws(() => getDriverMonthChargeKey('', 'driver-1', new Date()), /Account and driver/i);
  assert.throws(() => getDriverMonthChargeKey('account-1', '', new Date()), /Account and driver/i);
});
