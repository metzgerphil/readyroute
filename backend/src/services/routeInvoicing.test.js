const assert = require('node:assert/strict');
const test = require('node:test');

const { createRouteInvoicingService } = require('./routeInvoicing');

function createSupabase(handler) {
  return {
    from(table) {
      const query = { table, operation: 'select', payload: null };
      const builder = {
        upsert(payload) { query.operation = 'upsert'; query.payload = payload; return builder; },
        select() { return builder; },
        single() { return Promise.resolve(handler(query)); }
      };
      return builder;
    }
  };
}

function summary() {
  return {
    account_id: 'acct-1',
    billing_period: { start: '2026-07-01', end: '2026-08-01' },
    committed_route_count: 2,
    imported_billable_routes: 4,
    billable_quantity: 4,
    additional_route_count: 2,
    billing_rate_cents: 1500,
    estimated_total_cents: 6000,
    currency: 'usd',
    overage_authorization: {
      authorization_id: 'authorization-1',
      status: 'accepted',
      current_terms_accepted: true,
      billing_enabled: false
    }
  };
}

test('route invoice preview records the overage separately from the monthly total', async () => {
  const service = createRouteInvoicingService({
    billingMode: 'shadow',
    summaryLoader: async () => summary(),
    nowProvider: () => new Date('2026-08-01T01:00:00.000Z'),
    supabase: createSupabase((query) => {
      assert.equal(query.payload.amount_cents, 6000);
      assert.equal(query.payload.overage_amount_cents, 3000);
      return { data: { id: 'report-1', ...query.payload }, error: null };
    })
  });

  const preview = await service.createPreview('acct-1', '2026-07');
  assert.equal(preview.report.overage_amount_cents, 3000);
  assert.equal(preview.billing_mode, 'shadow');
});

test('shadow mode can never create a Stripe invoice', async () => {
  let stripeCalled = false;
  const service = createRouteInvoicingService({
    billingMode: 'shadow',
    summaryLoader: async () => summary(),
    stripeClient: {
      invoiceItems: { create: async () => { stripeCalled = true; } },
      invoices: { create: async () => { stripeCalled = true; } }
    },
    supabase: createSupabase((query) => ({ data: { id: 'report-1', ...query.payload }, error: null }))
  });

  const result = await service.createOverageInvoice('acct-1', '2026-07');
  assert.equal(result.charged, false);
  assert.equal(result.reason, 'shadow_mode');
  assert.equal(stripeCalled, false);
});
