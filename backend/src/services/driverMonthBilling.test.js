const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDriverMonthBillingService,
  getDriverMonthChargeKey,
  getUtcBillingMonth,
  summarizeDriverMonthCharges
} = require('./driverMonthBilling');

class BillingQuery {
  constructor(handler, table) {
    this.handler = handler;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.payload = null;
  }

  select() { return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  maybeSingle() { return Promise.resolve(this.handler(this)); }
  then(resolve, reject) { return Promise.resolve(this.handler(this)).then(resolve, reject); }
}

test('activation at any time uses the full UTC calendar-month charge', () => {
  assert.equal(getUtcBillingMonth('2026-08-31T23:59:59Z'), '2026-08-01');
  assert.deepEqual(summarizeDriverMonthCharges([{ unit_amount_cents: 1000, charge_status: 'accrued' }], 1), {
    active_driver_count: 1,
    charged_driver_count: 1,
    unit_amount_cents: 1000,
    total_amount_cents: 1000,
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
    { unit_amount_cents: 1000, charge_status: 'accrued' },
    { unit_amount_cents: 1000, charge_status: 'voided' }
  ], 0);
  assert.equal(summary.active_driver_count, 0);
  assert.equal(summary.charged_driver_count, 1);
  assert.equal(summary.total_amount_cents, 1000);
});

test('zero drivers and zero ledger rows produce a zero-dollar month', () => {
  assert.deepEqual(summarizeDriverMonthCharges([], 0), {
    active_driver_count: 0,
    charged_driver_count: 0,
    unit_amount_cents: 1000,
    total_amount_cents: 0,
    currency: 'usd',
    live_charging_enabled: false
  });
});

test('multiple driver-month rows total exactly five dollars each regardless of active count', () => {
  const summary = summarizeDriverMonthCharges([
    { unit_amount_cents: 1000, charge_status: 'accrued' },
    { unit_amount_cents: 1000, charge_status: 'invoiced' },
    { unit_amount_cents: 1000, charge_status: 'paid' }
  ], 2);
  assert.equal(summary.active_driver_count, 2);
  assert.equal(summary.charged_driver_count, 3);
  assert.equal(summary.total_amount_cents, 3000);
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

test('complimentary accounts keep ledger value but are voided before invoicing', async () => {
  const updates = [];
  let stripeCalls = 0;
  const supabase = {
    rpc: async () => ({ data: 0, error: null }),
    from(table) {
      return new BillingQuery((query) => {
        if (table === 'driver_month_activation_charges' && query.operation === 'select') {
          return {
            data: [{ id: 'charge-1', account_id: 'acct-1', driver_id: 'driver-1', billing_month: '2026-07-01', unit_amount_cents: 1000, charge_status: 'accrued' }],
            error: null
          };
        }
        if (table === 'accounts') {
          return { data: { id: 'acct-1', rra_billing_treatment: 'complimentary', stripe_customer_id: 'cus_unused' }, error: null };
        }
        if (table === 'driver_month_activation_charges' && query.operation === 'update') {
          updates.push({ payload: query.payload, filters: query.filters });
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }, table);
    }
  };
  const stripeClient = {
    invoiceItems: { create: async () => { stripeCalls += 1; } },
    invoices: { create: async () => { stripeCalls += 1; } }
  };
  const service = createDriverMonthBillingService({
    supabase,
    stripeClient,
    billingMode: 'live',
    now: () => new Date('2026-08-10T12:00:00.000Z')
  });

  const result = await service.run();

  assert.equal(result.results[0].status, 'complimentary');
  assert.equal(result.results[0].regular_value_cents, 1000);
  assert.equal(result.results[0].amount_cents, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].payload.charge_status, 'voided');
  assert.equal(stripeCalls, 0);
});
