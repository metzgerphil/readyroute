const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

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

  gte(column, value) {
    this.state.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column, value) {
    this.state.filters.push({ op: 'lt', column, value });
    return this;
  }

  is(column, value) {
    this.state.filters.push({ op: 'is', column, value });
    return this;
  }

  not(column, comparator, value) {
    this.state.filters.push({ op: 'not', column, comparator, value });
    return this;
  }

  order(column, options = {}) {
    this.state.orders.push({ column, options });
    return this;
  }

  limit(value) {
    this.state.limit = value;
    return this;
  }

  single() {
    return this.execute('single');
  }

  maybeSingle() {
    return this.execute('maybeSingle');
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
    this.calls = [];
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }

  execute(query) {
    this.calls.push(query);
    return this.handler(query, this.calls);
  }
}

function signManagerToken(overrides = {}) {
  return jwt.sign(
    {
      account_id: overrides.account_id || 'acct-1',
      role: 'manager'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer({ supabase, now, sendManagerInviteEmail }) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    now,
    sendManagerInviteEmail
  });
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

test('GET /manager/dashboard returns stops_per_hour using the first-scan formula', async () => {
  const now = () => new Date('2026-04-08T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          { id: 'driver-1', name: 'Alex Driver', is_active: true }
        ],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      if (query.mode === 'maybeSingle') {
        return {
          data: { created_at: '2026-04-08T17:45:00.000Z' },
          error: null
        };
      }

      return {
        data: [
          {
            id: 'route-1',
            driver_id: 'driver-1',
            vehicle_id: 'vehicle-1',
            date: '2026-04-08',
            status: 'in_progress',
            total_stops: 10,
            completed_stops: 4,
            work_area_name: '810',
            created_at: '2026-04-08T17:45:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          { id: 'vehicle-1', name: 'Van 1', plate: '8WAI675' }
        ],
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: [
          { id: 'stop-1', route_id: 'route-1', sequence_order: 1, address: '100 Main St', status: 'delivered', completed_at: '2026-04-08T16:00:00.000Z', delivery_type_code: '009', has_time_commit: true },
          { id: 'stop-2', route_id: 'route-1', sequence_order: 2, address: '200 Main St', status: 'delivered', completed_at: '2026-04-08T16:30:00.000Z', delivery_type_code: '014', has_time_commit: false },
          { id: 'stop-3', route_id: 'route-1', sequence_order: 3, address: '300 Main St', status: 'delivered', completed_at: '2026-04-08T17:00:00.000Z', delivery_type_code: '021', has_time_commit: true },
          { id: 'stop-4', route_id: 'route-1', sequence_order: 4, address: '400 Main St', status: 'delivered', completed_at: '2026-04-08T17:15:00.000Z', delivery_type_code: '013', has_time_commit: false },
          { id: 'stop-5', route_id: 'route-1', sequence_order: 5, address: '500 Main St', status: 'pending', completed_at: null, delivery_type_code: null, has_time_commit: true }
        ],
        error: null
      };
    }

    if (query.table === 'driver_positions' && query.operation === 'select') {
      return {
        data: [
          {
            driver_id: 'driver-1',
            route_id: 'route-1',
            lat: 40.7,
            lng: -74,
            timestamp: '2026-04-08T17:59:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '402984',
            plate: '8WAI675'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '402984',
            plate: '8WAI675'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '402984',
            plate: '8WAI675'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/dashboard`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total_stops, 10);
    assert.equal(body.completed_stops, 4);
    assert.equal(body.time_commits_total, 3);
    assert.equal(body.time_commits_completed, 2);
    assert.equal(body.sync_status.routes_today, 1);
    assert.equal(body.sync_status.routes_assigned, 1);
    assert.equal(body.sync_status.drivers_on_road, 1);
    assert.equal(body.sync_status.last_sync_at, '2026-04-08T17:45:00.000Z');
    assert.equal(body.drivers[0].work_area_name, '810');
    assert.equal(body.drivers[0].vehicle_name, 'Van 1');
    assert.equal(body.drivers[0].vehicle_plate, '8WAI675');
    assert.equal(body.drivers[0].time_commits_total, 3);
    assert.equal(body.drivers[0].time_commits_completed, 2);
    assert.equal(body.drivers[0].stops_per_hour, 2);
    assert.equal(body.drivers[0].current_stop_number, 5);
    assert.equal(body.drivers[0].current_stop_address, '500 Main St');
    assert.deepEqual(body.drivers[0].last_position, {
      lat: 40.7,
      lng: -74,
      timestamp: '2026-04-08T17:59:00.000Z'
    });
    assert.equal(body.drivers[0].is_online, true);
  } finally {
    await server.close();
  }
});

test('GET /manager/dashboard returns null stops_per_hour when no stops are completed yet', async () => {
  const now = () => new Date('2026-04-08T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          { id: 'driver-1', name: 'Alex Driver', is_active: true }
        ],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      if (query.mode === 'maybeSingle') {
        return {
          data: null,
          error: null
        };
      }

      return {
        data: [
          {
            id: 'route-1',
            driver_id: 'driver-1',
            vehicle_id: null,
            date: '2026-04-08',
            status: 'pending',
            total_stops: 5,
            completed_stops: 0,
            work_area_name: '811',
            created_at: '2026-04-08T06:30:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: [
          { id: 'stop-1', route_id: 'route-1', sequence_order: 1, address: '100 Main St', status: 'pending', completed_at: null, delivery_type_code: null }
        ],
        error: null
      };
    }

    if (query.table === 'driver_positions' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/dashboard`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.drivers[0].stops_per_hour, null);
    assert.equal(body.drivers[0].work_area_name, '811');
    assert.equal(body.drivers[0].vehicle_name, null);
    assert.equal(body.drivers[0].vehicle_plate, null);
    assert.equal(body.sync_status.routes_today, 1);
  } finally {
    await server.close();
  }
});

test('GET /manager/dashboard returns sync state when no routes exist for today', async () => {
  const now = () => new Date('2026-04-08T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return { data: [{ id: 'driver-1', name: 'Alex Driver', is_active: true }], error: null };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      if (query.mode === 'maybeSingle') {
        return {
          data: { created_at: '2026-04-07T12:00:00.000Z' },
          error: null
        };
      }

      return { data: [], error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/dashboard`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total_stops, 0);
    assert.equal(body.completed_stops, 0);
    assert.equal(body.sync_status.routes_today, 0);
    assert.equal(body.sync_status.routes_assigned, 0);
    assert.equal(body.sync_status.last_sync_at, '2026-04-07T12:00:00.000Z');
    assert.deepEqual(body.drivers, []);
  } finally {
    await server.close();
  }
});

test('GET /manager/drivers returns the driver list for the manager account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'driver-1',
            account_id: 'acct-1',
            name: 'Alex Driver',
            email: 'alex@example.com',
            phone: '555-1234',
            hourly_rate: 22.5,
            is_active: true
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.drivers.length, 1);
    assert.equal(body.drivers[0].name, 'Alex Driver');
    assert.equal(body.drivers[0].is_active, true);
  } finally {
    await server.close();
  }
});

test('POST /manager/drivers creates a driver with a hashed PIN', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.name, 'Alex Driver');
      assert.equal(query.payload.email, 'alex@example.com');
      assert.equal(query.payload.phone, '555-1234');
      assert.equal(query.payload.hourly_rate, 22.5);
      assert.equal(query.payload.is_active, true);
      assert.notEqual(query.payload.pin, '1234');
      return {
        data: { id: 'driver-99' },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Alex Driver',
        email: 'Alex@Example.com',
        phone: '555-1234',
        hourly_rate: 22.5,
        pin: '1234'
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { driver_id: 'driver-99' });

    const insertCall = supabase.calls.find((call) => call.table === 'drivers' && call.operation === 'insert');
    assert.ok(insertCall);
    assert.equal(await bcrypt.compare('1234', insertCall.payload.pin), true);
  } finally {
    await server.close();
  }
});

test('POST /manager/drivers returns 409 when the email already exists', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: { id: 'driver-existing' },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Alex Driver',
        email: 'alex@example.com',
        phone: '555-1234',
        hourly_rate: 22.5,
        pin: '1234'
      })
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'A driver with that email already exists');
  } finally {
    await server.close();
  }
});

test('PUT /manager/drivers/:id updates driver profile fields', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: { id: 'driver-1' },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'update') {
      assert.equal(query.payload.name, 'Updated Driver');
      assert.equal(query.payload.phone, '555-8888');
      assert.equal(query.payload.hourly_rate, 25.5);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers/driver-1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Updated Driver',
        phone: '555-8888',
        hourly_rate: 25.5
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await server.close();
  }
});

test('PATCH /manager/drivers/:id/status updates driver active state', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: { id: 'driver-1' },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'update') {
      assert.equal(query.payload.is_active, false);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers/driver-1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_active: false
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, is_active: false });
  } finally {
    await server.close();
  }
});

test('GET /manager/drivers/:id/stats returns performance stats', async () => {
  const now = () => new Date('2026-04-09T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: { id: 'driver-1' },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          { id: 'route-1', completed_stops: 6 },
          { id: 'route-2', completed_stops: 4 }
        ],
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: [
          { id: 'stop-1', route_id: 'route-1', completed_at: '2026-04-08T14:00:00.000Z', exception_code: null, status: 'delivered' },
          { id: 'stop-2', route_id: 'route-1', completed_at: '2026-04-08T15:00:00.000Z', exception_code: '07', status: 'delivered' },
          { id: 'stop-3', route_id: 'route-2', completed_at: '2026-04-09T14:00:00.000Z', exception_code: '02', status: 'delivered' },
          { id: 'stop-4', route_id: 'route-2', completed_at: '2026-04-09T15:00:00.000Z', exception_code: null, status: 'delivered' }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/drivers/driver-1/stats`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.stats.last_7_days_stops_per_hour, 'number');
    assert.equal(body.stats.total_deliveries_this_month, 4);
    assert.equal(body.stats.exception_code_breakdown['07'], 1);
    assert.equal(body.stats.exception_code_breakdown['02'], 1);
  } finally {
    await server.close();
  }
});

test('GET /manager/timecards/weekly returns weekly hours and break totals by driver', async () => {
  const now = () => new Date('2026-04-15T18:00:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'driver-1',
            name: 'Phil',
            email: 'phil@example.com',
            hourly_rate: 25,
            is_active: true
          }
        ],
        error: null
      };
    }

    if (query.table === 'timecards' && query.operation === 'select') {
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

    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          { id: 'route-1', work_area_name: '816' }
        ],
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'break-1',
            timecard_id: 'timecard-1',
            break_type: 'rest',
            started_at: '2026-04-14T18:00:00.000Z',
            ended_at: '2026-04-14T18:15:00.000Z'
          },
          {
            id: 'break-2',
            timecard_id: 'timecard-1',
            break_type: 'lunch',
            started_at: '2026-04-14T20:00:00.000Z',
            ended_at: '2026-04-14T20:30:00.000Z'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/timecards/weekly?date=2026-04-15`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.week_start, '2026-04-13');
    assert.equal(body.week_end, '2026-04-19');
    assert.equal(body.totals.worked_hours, 8);
    assert.equal(body.totals.break_minutes, 45);
    assert.equal(body.totals.lunch_minutes, 30);
    assert.equal(body.drivers[0].payable_hours, 7.5);
    assert.equal(body.drivers[0].estimated_pay, 187.5);
    assert.equal(body.drivers[0].timecards.length, 1);
    assert.equal(body.drivers[0].timecards[0].route_name, '816');
    assert.equal(body.drivers[0].timecards[0].breaks.length, 2);
    assert.deepEqual(body.drivers[0].compliance_flags, []);
  } finally {
    await server.close();
  }
});

test('GET /manager/timecards/daily returns finalized daily labor snapshot rows', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'daily_labor_snapshots' && query.operation === 'select') {
      return {
        data: {
          id: 'snapshot-1',
          work_date: '2026-04-15',
          finalized_at: '2026-04-16T00:12:00.000Z',
          finalized_by_system: true,
          driver_count: 1,
          shift_count: 1,
          total_worked_hours: 8,
          total_payable_hours: 7.5,
          total_break_minutes: 45,
          total_lunch_minutes: 30,
          estimated_payroll: 187.5
        },
        error: null
      };
    }

    if (query.table === 'daily_driver_labor' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'row-1',
            driver_id: 'driver-1',
            work_date: '2026-04-15',
            hourly_rate: 25,
            shift_count: 1,
            worked_hours: 8,
            payable_hours: 7.5,
            break_minutes: 45,
            lunch_minutes: 30,
            estimated_pay: 187.5
          }
        ],
        error: null
      };
    }

    if (query.table === 'timecards' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'timecard-1',
            driver_id: 'driver-1',
            route_id: 'route-1',
            clock_in: '2026-04-15T15:00:00.000Z',
            clock_out: '2026-04-15T23:00:00.000Z',
            hours_worked: 8
          }
        ],
        error: null
      };
    }

    if (query.table === 'timecard_breaks' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'break-1',
            timecard_id: 'timecard-1',
            break_type: 'lunch',
            started_at: '2026-04-15T20:00:00.000Z',
            ended_at: '2026-04-15T20:30:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          { id: 'route-1', work_area_name: '816' }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          { id: 'driver-1', name: 'Phil', email: 'phil@example.com' }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now: () => new Date('2026-04-15T18:00:00.000Z') });

  try {
    const response = await fetch(`${server.baseUrl}/manager/timecards/daily?date=2026-04-15`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.snapshot.id, 'snapshot-1');
    assert.equal(body.drivers[0].driver_name, 'Phil');
    assert.equal(body.drivers[0].estimated_pay, 187.5);
    assert.equal(body.drivers[0].timecards.length, 1);
    assert.equal(body.drivers[0].timecards[0].route_name, '816');
  } finally {
    await server.close();
  }
});

test('GET /manager/vehicles returns the vehicle list for the manager account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            account_id: 'acct-1',
            name: 'Truck 12',
            make: 'Ford',
            model: 'Transit',
            year: 2022,
            plate: 'RRTEST1',
            current_mileage: 12000
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/vehicles`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vehicles.length, 1);
    assert.equal(body.vehicles[0].name, 'Truck 12');
  } finally {
    await server.close();
  }
});

test('PATCH /manager/routes/:route_id/assign updates route driver and vehicle', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: { id: 'route-1', account_id: 'acct-1' },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: { id: 'driver-1' },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: { id: 'vehicle-1' },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      assert.equal(query.payload.driver_id, 'driver-1');
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      return {
        data: {
          id: 'route-1',
          driver_id: 'driver-1',
          vehicle_id: 'vehicle-1',
          work_area_name: '810',
          total_stops: 23,
          completed_stops: 0,
          status: 'pending'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes/route-1/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        driver_id: 'driver-1',
        vehicle_id: 'vehicle-1'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.route.work_area_name, '810');
  } finally {
    await server.close();
  }
});

test('GET /manager/routes returns sync status and fedex connection metadata', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: { fedex_csp_id: '919' },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'route-1',
            account_id: 'acct-1',
            driver_id: null,
            vehicle_id: 'vehicle-1',
            work_area_name: '810',
            date: '2026-04-09',
            source: 'gpx_upload',
            total_stops: 12,
            completed_stops: 0,
            status: 'pending',
            created_at: '2026-04-09T12:47:00.000Z',
            completed_at: null
          }
        ],
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            lat: 32.7,
            lng: -117.1,
            status: 'pending',
            notes: null,
            exception_code: null,
            delivery_type_code: '009',
            signer_name: 'Taylor',
            signature_url: 'https://cdn/signature.jpg',
            age_confirmed: false,
            pod_photo_url: null,
            pod_signature_url: null,
            scanned_at: null,
            completed_at: null,
            has_time_commit: true
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '402984',
            plate: '8WAI675'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes?date=2026-04-09`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.sync_status.routes_today, 1);
    assert.equal(body.sync_status.routes_assigned, 0);
    assert.equal(body.sync_status.last_sync_at, '2026-04-09T12:47:00.000Z');
    assert.equal(body.fedex_connection.is_connected, true);
    assert.equal(body.fedex_connection.terminal_label, '919');
    assert.equal(body.routes[0].work_area_name, '810');
    assert.equal(body.routes[0].vehicle_name, '402984');
    assert.equal(body.routes[0].vehicle_plate, '8WAI675');
    assert.equal(body.routes[0].time_commits_total, 1);
    assert.equal(body.routes[0].time_commits_completed, 0);
    assert.equal(body.routes[0].stops[0].delivery_type_code, '009');
  } finally {
    await server.close();
  }
});

test('GET /manager/stops/:stop_id/signature returns signature metadata for the portal', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: {
          id: 'stop-1',
          route_id: 'route-1',
          signature_url: 'https://cdn/signature.jpg',
          signer_name: 'Taylor Receiver',
          age_confirmed: true,
          delivery_type_code: '013',
          routes: {
            account_id: 'acct-1'
          }
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/stops/stop-1/signature`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.stop.signature_url, 'https://cdn/signature.jpg');
    assert.equal(body.stop.signer_name, 'Taylor Receiver');
    assert.equal(body.stop.age_confirmed, true);
    assert.equal(body.stop.delivery_type_code, '013');
  } finally {
    await server.close();
  }
});

test('GET /manager/routes/:route_id/stops returns full stop detail for the selected route', async () => {
  const now = () => new Date('2026-04-13T16:30:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          account_id: 'acct-1',
          driver_id: 'driver-1',
          vehicle_id: 'vehicle-1',
          work_area_name: '810',
          date: '2026-04-13',
          total_stops: 2,
          completed_stops: 1,
          status: 'in_progress',
          sa_number: '919',
          contractor_name: 'Bridge Transportation Inc'
        },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St, Escondido, CA 92029',
            address_line2: 'Suite 100',
            contact_name: 'Acme Receiving',
            lat: 33.12,
            lng: -117.08,
            status: 'pending',
            is_business: true,
            has_note: true,
            notes: null,
            exception_code: null,
            delivery_type_code: null,
            pod_photo_url: null,
            completed_at: null,
            sid: '123456',
            ready_time: '09:00',
            close_time: '17:00',
            has_time_commit: true,
            stop_type: 'delivery',
            has_pickup: false,
            has_delivery: true,
            is_pickup: false
          },
          {
            id: 'stop-2',
            route_id: 'route-1',
            sequence_order: 2,
            address: '200 Main St, Escondido, CA 92029',
            address_line2: '',
            contact_name: 'Warehouse',
            lat: 33.13,
            lng: -117.09,
            status: 'delivered',
            is_business: true,
            has_note: false,
            notes: null,
            exception_code: null,
            delivery_type_code: '019',
            pod_photo_url: 'https://cdn/photo.png',
            completed_at: '2026-04-13T16:00:00.000Z',
            sid: '0',
            ready_time: null,
            close_time: null,
            has_time_commit: false,
            stop_type: 'combined',
            has_pickup: true,
            has_delivery: true,
            is_pickup: false
          }
        ],
        error: null
      };
    }

    if (query.table === 'packages' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'pkg-1',
            stop_id: 'stop-1',
            tracking_number: '123',
            requires_signature: true,
            hazmat: false
          },
          {
            id: 'pkg-2',
            stop_id: 'stop-2',
            tracking_number: '456',
            requires_signature: false,
            hazmat: false
          }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: {
          id: 'driver-1',
          name: 'Adrian Morales'
        },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          name: '204526'
        },
        error: null
      };
    }

    if (query.table === 'stop_notes' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'property_intel' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes/route-1/stops?date=2026-04-13`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.route.work_area_name, '810');
    assert.equal(body.route.driver_name, 'Adrian Morales');
    assert.equal(body.route.vehicle_name, '204526');
    assert.equal(body.route.stops_per_hour, 2);
    assert.equal(body.route.sa_number, '919');
    assert.equal(body.route.contractor_name, 'Bridge Transportation Inc');
    assert.equal(body.stops.length, 2);
    assert.equal(body.stops[0].contact_name, 'Acme Receiving');
    assert.equal(body.stops[0].address_line2, 'Suite 100');
    assert.equal(body.stops[0].has_time_commit, true);
    assert.equal(body.stops[0].is_business, true);
    assert.equal(body.stops[0].has_note, false);
    assert.equal(body.stops[0].packages.length, 1);
    assert.equal(body.stops[1].stop_type, 'combined');
    assert.equal(body.stops[1].packages[0].tracking_number, '456');
  } finally {
    await server.close();
  }
});

test('PATCH /manager/routes/stops/:stop_id/property-intel saves building intel for the manager account', async () => {
  let savedPayload = null;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: {
          id: 'stop-1',
          address: '100 Main St, Escondido, CA 92029',
          address_line2: 'Unit 3B',
          contact_name: 'Acme Apartments',
          route_id: 'route-1',
          routes: {
            id: 'route-1',
            account_id: 'acct-1'
          }
        },
        error: null
      };
    }

    if (query.table === 'property_intel' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'property_intel' && query.operation === 'insert') {
      savedPayload = query.payload;
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes/stops/stop-1/property-intel`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        property_type: 'apartment',
        building: 'Building B',
        access_note: 'Gate code 4455 at south entrance',
        parking_note: 'Visitor parking near leasing office',
        warning_flags: ['gate', 'stairs']
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(savedPayload.property_type, 'apartment');
    assert.equal(savedPayload.building, 'Building B');
    assert.equal(savedPayload.access_note, 'Gate code 4455 at south entrance');
    assert.deepEqual(savedPayload.warning_flags, ['gate', 'stairs']);
  } finally {
    await server.close();
  }
});

test('GET /manager/routes/:route_id/driver-position returns the most recent position when it is fresh', async () => {
  const now = () => new Date('2026-04-13T16:30:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          account_id: 'acct-1',
          driver_id: 'driver-1',
          work_area_name: '810',
          date: '2026-04-13'
        },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: {
          id: 'driver-1',
          name: 'Adrian Morales'
        },
        error: null
      };
    }

    if (query.table === 'driver_positions' && query.operation === 'select') {
      return {
        data: [
          {
            driver_id: 'driver-1',
            lat: 33.125,
            lng: -117.085,
            timestamp: '2026-04-13T16:25:00.000Z'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes/route-1/driver-position`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.lat, 33.125);
    assert.equal(body.lng, -117.085);
    assert.equal(body.driver_name, 'Adrian Morales');
    assert.equal(body.timestamp, '2026-04-13T16:25:00.000Z');
  } finally {
    await server.close();
  }
});

test('GET /manager/routes/:route_id/driver-position returns null when the latest position is stale', async () => {
  const now = () => new Date('2026-04-13T16:30:00.000Z');
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          account_id: 'acct-1',
          driver_id: 'driver-1',
          work_area_name: '810',
          date: '2026-04-13'
        },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: {
          id: 'driver-1',
          name: 'Adrian Morales'
        },
        error: null
      };
    }

    if (query.table === 'driver_positions' && query.operation === 'select') {
      return {
        data: [
          {
            driver_id: 'driver-1',
            lat: 33.125,
            lng: -117.085,
            timestamp: '2026-04-13T16:10:00.000Z'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase, now });

  try {
    const response = await fetch(`${server.baseUrl}/manager/routes/route-1/driver-position`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body, null);
  } finally {
    await server.close();
  }
});

test('GET /manager/manager-users returns manager access status for the account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation Inc',
          manager_email: 'owner@example.com'
        },
        error: null
      };
    }

    if (query.table === 'manager_users' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'manager-1',
            account_id: 'acct-1',
            email: 'owner@example.com',
            full_name: 'Phillip Metzger',
            password_hash: '$2b$10$hash',
            is_active: true,
            invited_at: null,
            accepted_at: '2026-04-17T10:00:00.000Z',
            created_at: '2026-04-17T09:00:00.000Z'
          },
          {
            id: 'manager-2',
            account_id: 'acct-1',
            email: 'vlad@example.com',
            full_name: 'Vlad Fedoryshyn',
            password_hash: null,
            is_active: true,
            invited_at: '2026-04-17T10:15:00.000Z',
            accepted_at: null,
            created_at: '2026-04-17T10:15:00.000Z'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/manager/manager-users`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manager_users.length, 2);
    assert.equal(body.manager_users[0].status, 'active');
    assert.equal(body.manager_users[0].is_primary, true);
    assert.equal(body.manager_users[1].status, 'pending_invite');
  } finally {
    await server.close();
  }
});

test('POST /manager/manager-users/invite returns a self-serve invite link', async () => {
  let insertedManagerUser = null;
  const sentInvites = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation Inc',
          manager_email: 'owner@example.com'
        },
        error: null
      };
    }

    if (query.table === 'manager_users' && query.operation === 'select') {
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'manager_users' && query.operation === 'insert') {
      insertedManagerUser = {
        id: 'manager-2',
        account_id: 'acct-1',
        email: 'vlad@example.com',
        full_name: 'Vlad Fedoryshyn',
        password_hash: null,
        is_active: true,
        invited_at: '2026-04-17T10:15:00.000Z',
        accepted_at: null
      };

      return {
        data: insertedManagerUser,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({
    supabase,
    now: () => new Date('2026-04-17T10:15:00.000Z'),
    sendManagerInviteEmail: async (payload) => {
      sentInvites.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/manager/manager-users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signManagerToken()}`
      },
      body: JSON.stringify({
        email: 'vlad@example.com',
        full_name: 'Vlad Fedoryshyn'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.email_delivery, 'sent');
    assert.equal(body.invite_url, null);
    assert.equal(body.manager_user.email, 'vlad@example.com');
    assert.equal(body.manager_user.status, 'pending_invite');
    assert.equal(insertedManagerUser.email, 'vlad@example.com');
    assert.equal(sentInvites.length, 1);
    assert.equal(sentInvites[0].to, 'vlad@example.com');
    assert.match(sentInvites[0].inviteUrl, /mode=invite/);
  } finally {
    await server.close();
  }
});

test('POST /manager/manager-users/invite links an existing manager from another CSA immediately', async () => {
  let insertedManagerUser = null;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts' && query.operation === 'select') {
      return {
        data: {
          id: 'acct-2',
          company_name: 'PVD Delivery Inc',
          manager_email: 'owner@pvd.com'
        },
        error: null
      };
    }

    if (query.table === 'manager_users' && query.operation === 'select') {
      const accountFilter = query.filters.find((filter) => filter.column === 'account_id');
      const emailFilter = query.filters.find((filter) => filter.column === 'email');

      if (accountFilter?.value === 'acct-2') {
        return {
          data: null,
          error: null
        };
      }

      if (emailFilter?.value === 'ignacioservin94@yahoo.com') {
        return {
          data: [
            {
              id: 'manager-bridge',
              account_id: 'acct-1',
              email: 'ignacioservin94@yahoo.com',
              full_name: 'Ignacio Servin',
              password_hash: '$2b$10$sharedhash',
              is_active: true,
              invited_at: '2026-04-20T10:00:00.000Z',
              accepted_at: '2026-04-20T10:05:00.000Z',
              created_at: '2026-04-20T10:00:00.000Z'
            }
          ],
          error: null
        };
      }

      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'manager_users' && query.operation === 'insert') {
      insertedManagerUser = {
        id: 'manager-pvd',
        account_id: 'acct-2',
        email: 'ignacioservin94@yahoo.com',
        full_name: 'Ignacio Servin',
        password_hash: '$2b$10$sharedhash',
        is_active: true,
        invited_at: '2026-04-23T15:00:00.000Z',
        accepted_at: '2026-04-23T15:00:00.000Z'
      };

      assert.equal(query.payload.password_hash, '$2b$10$sharedhash');
      assert.equal(query.payload.accepted_at, '2026-04-23T15:00:00.000Z');

      return {
        data: insertedManagerUser,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer({
    supabase,
    now: () => new Date('2026-04-23T15:00:00.000Z'),
    sendManagerInviteEmail: async () => {
      throw new Error('Should not send invite email when linking an existing manager');
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/manager/manager-users/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signManagerToken({ account_id: 'acct-2' })}`
      },
      body: JSON.stringify({
        email: 'ignacioservin94@yahoo.com',
        full_name: 'Ignacio Servin'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.email_delivery, 'linked_existing_manager');
    assert.equal(body.invite_url, null);
    assert.equal(body.manager_user.status, 'active');
    assert.equal(insertedManagerUser.email, 'ignacioservin94@yahoo.com');
  } finally {
    await server.close();
  }
});
