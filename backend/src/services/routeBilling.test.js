const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getBillingPeriodForDate,
  getRouteBillingSummary,
  normalizeRouteBillingKey,
  recordBillableManifestImport
} = require('./routeBilling');

class QueryStub {
  constructor(table, handler) {
    this.table = table;
    this.handler = handler;
    this.operation = 'select';
    this.payload = null;
    this.filters = [];
    this.orders = [];
    this.columns = null;
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update') {
      this.returning = columns;
      return this;
    }

    this.operation = 'select';
    this.columns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, options });
    return this;
  }

  maybeSingle() {
    return this.execute('maybeSingle');
  }

  then(resolve, reject) {
    return this.execute('all').then(resolve, reject);
  }

  execute(mode) {
    return Promise.resolve(this.handler({
      table: this.table,
      operation: this.operation,
      payload: this.payload,
      filters: this.filters,
      orders: this.orders,
      columns: this.columns,
      mode
    }));
  }
}

function createSupabaseStub(handler) {
  const calls = [];

  return {
    calls,
    from(table) {
      return new QueryStub(table, (query) => {
        calls.push(query);
        return handler(query, calls);
      });
    }
  };
}

test('normalizeRouteBillingKey creates stable monthly route keys', () => {
  assert.equal(normalizeRouteBillingKey('  OCEA - 817 Bridge 02  '), 'ocea-817-bridge-02');
  assert.equal(normalizeRouteBillingKey('Route / Peak #12'), 'route-peak-12');
  assert.equal(normalizeRouteBillingKey(''), null);
});

test('getBillingPeriodForDate returns the route service month', () => {
  assert.deepEqual(getBillingPeriodForDate('2026-06-25'), {
    start: '2026-06-01',
    end: '2026-07-01'
  });
  assert.deepEqual(getBillingPeriodForDate('2026-12-15'), {
    start: '2026-12-01',
    end: '2027-01-01'
  });
  assert.equal(getBillingPeriodForDate('06/25/2026'), null);
});

test('recordBillableManifestImport writes import audit and monthly ledger row', async () => {
  const supabase = createSupabaseStub((query) => {
    if (query.table === 'account_billing_settings' && query.operation === 'select') {
      return {
        data: {
          committed_route_count: 12,
          billing_rate_cents: 1500,
          currency: 'usd',
          is_billing_exempt: false
        },
        error: null
      };
    }

    if (query.table === 'billing_manifest_imports' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.route_id, 'route-817-2026-06-25');
      assert.equal(query.payload.route_key, '817');
      assert.equal(query.payload.billing_period_start, '2026-06-01');
      assert.equal(query.payload.billing_exempt, false);
      return { data: null, error: null };
    }

    if (query.table === 'billable_route_months' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.route_key, '817');
      assert.equal(query.payload.route_display_name, '817');
      assert.equal(query.payload.first_route_id, 'route-817-2026-06-25');
      assert.equal(query.payload.last_route_id, 'route-817-2026-06-25');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const result = await recordBillableManifestImport({
    supabase,
    accountId: 'acct-1',
    routeId: 'route-817-2026-06-25',
    routeDate: '2026-06-25',
    workAreaName: '817',
    source: 'manifest_upload',
    importedAt: '2026-06-25T14:00:00.000Z'
  });

  assert.equal(result.recorded, true);
  assert.equal(result.billable, true);
  assert.equal(result.ledger_action, 'inserted');
});

test('recordBillableManifestImport updates existing monthly ledger row on duplicate route key', async () => {
  const supabase = createSupabaseStub((query) => {
    if (query.table === 'account_billing_settings' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'billing_manifest_imports' && query.operation === 'insert') {
      return { data: null, error: null };
    }

    if (query.table === 'billable_route_months' && query.operation === 'insert') {
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }

    if (query.table === 'billable_route_months' && query.operation === 'update') {
      assert.equal(query.payload.last_route_id, 'route-817-2026-06-26');
      assert.deepEqual(
        query.filters.map((filter) => [filter.column, filter.value]),
        [
          ['account_id', 'acct-1'],
          ['billing_period_start', '2026-06-01'],
          ['route_key', '817']
        ]
      );
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const result = await recordBillableManifestImport({
    supabase,
    accountId: 'acct-1',
    routeId: 'route-817-2026-06-26',
    routeDate: '2026-06-26',
    workAreaName: '817',
    importedAt: '2026-06-26T14:00:00.000Z'
  });

  assert.equal(result.ledger_action, 'updated');
});

test('getRouteBillingSummary uses committed route floor and imported route ledger', async () => {
  const supabase = createSupabaseStub((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          vehicle_count: 0
        },
        error: null
      };
    }

    if (query.table === 'account_billing_settings' && query.operation === 'select') {
      return {
        data: {
          committed_route_count: 2,
          billing_rate_cents: 1500,
          currency: 'usd',
          free_month_started_on: null,
          free_month_ends_on: null,
          is_billing_exempt: false
        },
        error: null
      };
    }

    if (query.table === 'billable_route_months' && query.operation === 'select') {
      assert.deepEqual(
        query.filters.map((filter) => [filter.column, filter.value]),
        [
          ['account_id', 'acct-1'],
          ['billing_period_start', '2026-06-01']
        ]
      );
      return {
        data: [
          { id: 'ledger-817', route_key: '817', route_display_name: '817', status: 'pending' },
          { id: 'ledger-818', route_key: '818', route_display_name: '818', status: 'pending' },
          { id: 'ledger-819', route_key: '819', route_display_name: '819', status: 'pending' },
          { id: 'ledger-void', route_key: 'void', route_display_name: 'Void', status: 'void' }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const summary = await getRouteBillingSummary({
    supabase,
    accountId: 'acct-1',
    month: '2026-06'
  });

  assert.equal(summary.committed_route_count, 2);
  assert.equal(summary.imported_billable_routes, 3);
  assert.equal(summary.billable_quantity, 3);
  assert.equal(summary.additional_route_count, 1);
  assert.equal(summary.estimated_total_cents, 4500);
  assert.equal(summary.billing_mode, 'shadow');
});
