const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const { createApp } = require('../app');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
      orders: [],
      limit: null,
      payload: undefined,
      columns: null,
      options: {}
    };
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert') {
      this.state.returning = columns;
      return this;
    }

    this.operation = 'select';
    this.state.columns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.state.payload = payload;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  in(column, values) {
    this.state.filters.push({ op: 'in', column, value: values });
    return this;
  }

  is(column, value) {
    this.state.filters.push({ op: 'is', column, value });
    return this;
  }

  order(column, options = {}) {
    this.state.orders.push({ column, ...options });
    return this;
  }

  limit(value) {
    this.state.limit = value;
    return this;
  }

  maybeSingle() {
    return this.execute('maybeSingle');
  }

  single() {
    return this.execute('single');
  }

  then(resolve, reject) {
    return this.execute('all').then(resolve, reject);
  }

  execute(mode) {
    return Promise.resolve(this.supabase.execute({
      table: this.table,
      operation: this.operation,
      mode,
      ...this.state
    }));
  }
}

class MockSupabase {
  constructor(handler) {
    this.handler = handler;
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }

  execute(query) {
    return this.handler(query);
  }
}

function signDriverToken(overrides = {}) {
  return jwt.sign(
    {
      driver_id: overrides.driver_id || 'driver-1',
      account_id: overrides.account_id || 'acct-1',
      name: 'Driver One',
      role: 'driver'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer(supabase) {
  const app = createApp({ supabase, jwtSecret: process.env.JWT_SECRET });
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

test('POST /timecards/clock-in records a timecard for the assigned route', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: { id: 'route-1' },
        error: null
      };
    }

    if (query.table === 'timecards' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'timecards' && query.operation === 'insert') {
      assert.equal(query.payload.driver_id, 'driver-1');
      assert.equal(query.payload.route_id, 'route-1');
      assert.match(query.payload.clock_in, /^\d{4}-\d{2}-\d{2}T/);
      return {
        data: {
          id: 'timecard-1',
          clock_in: query.payload.clock_in
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/timecards/clock-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route_id: 'route-1'
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.match(body.clock_in_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await server.close();
  }
});

test('POST /timecards/breaks/start records a lunch break for the active timecard', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'timecards' && query.operation === 'select') {
      return {
        data: {
          id: 'timecard-1',
          route_id: 'route-1',
          clock_in: '2026-04-14T15:00:00.000Z',
          clock_out: null
        },
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'insert') {
      assert.equal(query.payload.driver_id, 'driver-1');
      assert.equal(query.payload.timecard_id, 'timecard-1');
      assert.equal(query.payload.break_type, 'lunch');
      return {
        data: {
          id: 'break-1',
          break_type: 'lunch',
          started_at: query.payload.started_at
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/timecards/breaks/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        break_type: 'lunch'
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.active_break.break_type, 'lunch');
    assert.match(body.active_break.scheduled_end_at, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await server.close();
  }
});

test('GET /timecards/status auto-ends expired breaks and returns no active break', async () => {
  let breakClosed = false;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'timecards' && query.operation === 'select') {
      return {
        data: {
          id: 'timecard-1',
          route_id: 'route-1',
          clock_in: '2026-04-14T15:00:00.000Z',
          clock_out: null
        },
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'select') {
      return {
        data: {
          id: 'break-1',
          break_type: 'lunch',
          started_at: '2026-04-14T15:00:00.000Z',
          ended_at: null
        },
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'update') {
      breakClosed = true;
      assert.equal(query.filters[0].column, 'id');
      assert.equal(query.filters[0].value, 'break-1');
      assert.equal(query.payload.ended_at, '2026-04-14T15:30:00.000Z');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) {
        return new RealDate(...args);
      }

      return new RealDate('2026-04-14T15:31:00.000Z');
    }

    static now() {
      return new RealDate('2026-04-14T15:31:00.000Z').getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/timecards/status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.active_break, null);
    assert.equal(body.expired_break.id, 'break-1');
    assert.equal(body.expired_break.auto_ended, true);
    assert.equal(body.expired_break.ended_at, '2026-04-14T15:30:00.000Z');
    assert.equal(breakClosed, true);
  } finally {
    global.Date = RealDate;
    await server.close();
  }
});

test('POST /timecards/clock-out closes the active timecard', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'timecards' && query.operation === 'select') {
      const byRouteFilter = query.filters.find((filter) => filter.column === 'route_id');
      const byDriverFilter = query.filters.find((filter) => filter.column === 'driver_id');

      if (byDriverFilter) {
        return {
          data: {
            id: 'timecard-1',
            route_id: 'route-1',
            clock_in: '2026-04-14T15:00:00.000Z',
            clock_out: null
          },
          error: null
        };
      }

      if (byRouteFilter) {
        return {
          data: [],
          error: null
        };
      }

      return {
        data: [
          {
            id: 'timecard-1',
            driver_id: 'driver-1',
            route_id: 'route-1',
            clock_in: '2026-04-14T15:00:00.000Z',
            clock_out: '2026-04-14T23:00:00.000Z',
            hours_worked: 8
          }
        ],
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      const byIdFilter = query.filters.find((filter) => filter.column === 'id');

      if (byIdFilter) {
        return {
          data: {
            id: 'route-1',
            date: '2026-04-14',
            account_id: 'acct-1'
          },
          error: null
        };
      }

      return {
        data: [
          { id: 'route-1' }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'driver-1',
            name: 'Driver One',
            email: 'driver@example.com',
            hourly_rate: 25,
            is_active: true
          }
        ],
        error: null
      };
    }

    if (query.table === 'timecards' && query.operation === 'update') {
      assert.equal(query.filters[0].column, 'id');
      assert.equal(query.filters[0].value, 'timecard-1');
      assert.match(query.payload.clock_out, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof query.payload.hours_worked, 'number');
      return { data: null, error: null };
    }

    if (query.table === 'daily_labor_snapshots' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'daily_labor_snapshots' && query.operation === 'insert') {
      return {
        data: {
          id: 'snapshot-1'
        },
        error: null
      };
    }

    if (query.table === 'daily_driver_labor' && query.operation === 'select') {
      return { data: [], error: null };
    }

    if (query.table === 'daily_driver_labor' && query.operation === 'insert') {
      assert.equal(query.payload.batch_id, 'snapshot-1');
      assert.equal(query.payload.driver_id, 'driver-1');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/timecards/clock-out`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.timecard_id, 'timecard-1');
    assert.equal(body.day_finalized, true);
    assert.equal(body.finalized_snapshot_id, 'snapshot-1');
  } finally {
    await server.close();
  }
});
