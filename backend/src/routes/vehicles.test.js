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
      columns: null
    };
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update') {
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

  in(column, value) {
    this.state.filters.push({ op: 'in', column, value });
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
    return Promise.resolve(
      this.supabase.execute({
        table: this.table,
        operation: this.operation,
        mode,
        ...this.state
      })
    );
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

async function startTestServer(supabase, now = () => new Date('2026-04-12T16:00:00.000Z')) {
  const app = createApp({ supabase, jwtSecret: process.env.JWT_SECRET, now, enforceBilling: false });
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

test('GET /vehicles returns vehicles with latest maintenance, today assignment, and service_due', async () => {
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
            year: 2023,
            plate: 'ABC123',
            current_mileage: 19500,
            next_service_mileage: 20000,
            notes: null,
            is_active: true
          },
          {
            id: 'vehicle-2',
            account_id: 'acct-1',
            name: 'Truck 19',
            make: 'Ram',
            model: 'ProMaster',
            year: 2022,
            plate: 'XYZ789',
            current_mileage: 14000,
            next_service_mileage: 20000,
            notes: null,
            is_active: true
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'maint-1',
            vehicle_id: 'vehicle-1',
            account_id: 'acct-1',
            service_date: '2026-03-01',
            description: 'Oil change'
          },
          {
            id: 'maint-2',
            vehicle_id: 'vehicle-1',
            account_id: 'acct-1',
            service_date: '2026-04-01',
            description: 'Tires'
          }
        ],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'route-1',
            vehicle_id: 'vehicle-1',
            driver_id: 'driver-1',
            work_area_name: '810',
            status: 'in_progress'
          }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          { id: 'driver-1', name: 'Luis Jimenez' }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vehicles.length, 2);
    assert.equal(body.vehicles[0].today_assignment.work_area_name, '810');
    assert.equal(body.vehicles[0].today_assignment.driver_name, 'Luis Jimenez');
    assert.equal(body.vehicles[0].latest_maintenance.description, 'Tires');
    assert.equal(body.vehicles[0].service_due, true);
    assert.equal(body.vehicles[1].today_assignment, null);
    assert.equal(body.vehicles[1].service_due, false);
  } finally {
    await server.close();
  }
});

test('POST /vehicles creates a vehicle for the authenticated account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.name, 'Truck 24');
      assert.equal(query.payload.current_mileage, 0);
      return {
        data: { id: 'vehicle-new' },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Truck 24',
        make: 'Ford',
        model: 'Transit',
        year: 2024,
        plate: 'NEW123'
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { vehicle_id: 'vehicle-new' });
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/:id returns 403 when vehicle belongs to a different account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-9`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Nope' })
    });

    assert.equal(response.status, 403);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/maintenance saves maintenance and updates the vehicle mileage fields', async () => {
  let vehicleUpdateSeen = false;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          current_mileage: 18000,
          last_service_mileage: 17000,
          next_service_mileage: 22000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance' && query.operation === 'insert') {
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.description, 'Oil change');
      assert.equal(query.payload.mileage_at_service, 18550);
      assert.equal(query.payload.next_service_mileage, 23500);
      return {
        data: { id: 'maint-new' },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      vehicleUpdateSeen = true;
      assert.equal(query.payload.last_service_date, '2026-04-10');
      assert.equal(query.payload.last_service_mileage, 18550);
      assert.equal(query.payload.next_service_mileage, 23500);
      assert.equal(query.payload.current_mileage, 18550);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/maintenance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_date: '2026-04-10',
        description: 'Oil change',
        cost: 149.99,
        mileage_at_service: 18550,
        next_service_mileage: 23500
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { maintenance_id: 'maint-new' });
    assert.equal(vehicleUpdateSeen, true);
  } finally {
    await server.close();
  }
});

test('GET /vehicles/:id/maintenance returns newest-first history for owned vehicle', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: { id: 'vehicle-1', account_id: 'acct-1' },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance' && query.operation === 'select') {
      assert.deepEqual(query.orders, [{ column: 'service_date', options: { ascending: false } }]);
      return {
        data: [
          { id: 'maint-2', service_date: '2026-04-10', description: 'Tires' },
          { id: 'maint-1', service_date: '2026-03-10', description: 'Oil change' }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/maintenance`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.maintenance.length, 2);
    assert.equal(body.maintenance[0].description, 'Tires');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/due-soon returns only service-due vehicles', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          { id: 'vehicle-1', name: 'Truck 12', current_mileage: 19600, next_service_mileage: 20000 },
          { id: 'vehicle-2', name: 'Truck 14', current_mileage: 12000, next_service_mileage: 20000 },
          { id: 'vehicle-3', name: 'Truck 16', current_mileage: 15000, next_service_mileage: null }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/due-soon`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vehicles.length, 1);
    assert.equal(body.vehicles[0].id, 'vehicle-1');
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/maintenance returns 403 when vehicle belongs to a different account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-9/maintenance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_date: '2026-04-10',
        description: 'Oil change'
      })
    });

    assert.equal(response.status, 403);
  } finally {
    await server.close();
  }
});
