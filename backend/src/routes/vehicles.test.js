const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const { createApp } = require('../app');
const {
  buildVehicleReadiness,
  mapInspectionReadinessContext
} = require('./vehicles');

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

  upsert(payload, options = {}) {
    this.operation = 'upsert';
    this.state.payload = payload;
    this.state.upsertOptions = options;
    return this;
  }

  update(payload) {
    this.operation = 'update';
    this.state.payload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
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
      manager_user_id: overrides.manager_user_id || 'manager-1',
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

test('vehicle readiness exposes an unsafe inspection as a linked blocker', () => {
  const inspection = {
    id: 'inspection-unsafe-1',
    vehicle_id: 'vehicle-1',
    inspection_date: '2026-04-12',
    status: 'urgent_manager_review',
    items: [
      {
        checklist_item_key: 'tires',
        label: 'Tires',
        status: 'issue',
        severity: 'unsafe',
        issue_details: { issue: ['Damage'] }
      }
    ]
  };
  const context = mapInspectionReadinessContext([inspection]);
  const readiness = buildVehicleReadiness(
    { id: 'vehicle-1', is_active: true },
    { status: 'ok' },
    null,
    '2026-04-12',
    undefined,
    { pendingUnsafeInspection: context.pendingUnsafeByVehicleId.get('vehicle-1') }
  );

  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.primary_reason.label, 'Unsafe inspection: Tires');
  assert.equal(readiness.primary_reason.source_type, 'inspection');
  assert.equal(readiness.primary_reason.source_id, 'inspection-unsafe-1');
});

test('GET /vehicles returns vehicles with latest maintenance, today assignment, and service_due', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'vehicle-1',
            account_id: 'acct-1',
            name: 'Truck 12',
            truck_type: 'P1000',
            custom_truck_type: null,
            make: 'Ford',
            model: 'Transit',
            year: 2023,
            plate: 'ABC123',
            registration_expiration: '2026-05-10',
            current_mileage: 19500,
            next_service_mileage: 20000,
            notes: null,
            is_active: true
          },
          {
            id: 'vehicle-2',
            account_id: 'acct-1',
            name: 'Truck 19',
            truck_type: 'Other',
            custom_truck_type: 'Box Truck P700',
            make: 'Ram',
            model: 'ProMaster',
            year: 2022,
            plate: 'XYZ789',
            registration_expiration: null,
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
            service_type: 'Oil Change',
            mileage_at_service: 14500,
            next_service_mileage: 5000,
            created_at: '2026-03-01T10:00:00.000Z',
            description: 'Oil change'
          },
          {
            id: 'maint-1-repaired',
            vehicle_id: 'vehicle-1',
            account_id: 'acct-1',
            service_date: '2026-03-01',
            service_type: 'Oil Change',
            mileage_at_service: 14500,
            next_service_mileage: 19500,
            created_at: '2026-03-01T11:00:00.000Z',
            description: 'Oil change repaired'
          },
          {
            id: 'maint-2',
            vehicle_id: 'vehicle-1',
            account_id: 'acct-1',
            service_date: '2026-04-01',
            service_type: 'Brake Pads',
            mileage_at_service: 19000,
            created_at: '2026-04-01T10:00:00.000Z',
            description: 'Tires'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return {
        data: [
          {
            service_type: 'Oil Change',
            is_enabled: true,
            default_interval_miles: 5000,
            default_interval_days: null
          },
          {
            service_type: 'Air Filter',
            is_enabled: true,
            default_interval_miles: 10000,
            default_interval_days: null
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'select') {
      return {
        data: {
          weekly_inspection_day: 'Wednesday',
          maintenance_warning_miles: 750,
          maintenance_warning_days: 10,
          document_warning_days: 21
        },
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

    if (query.table === 'vehicle_inspections' && query.operation === 'select') {
      return {
        data: [],
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
    assert.equal(body.vehicles[0].maintenance_alert.status, 'overdue');
    assert.equal(body.vehicles[0].maintenance_alert.most_urgent.service_type, 'Oil Change');
    assert.equal(body.vehicles[0].maintenance_alert.most_urgent.next_due_mileage, 19500);
    assert.equal(body.vehicles[0].readiness_status, 'blocked');
    assert.equal(body.vehicles[0].readiness.label, 'Blocked');
    assert.equal(body.vehicles[0].truck_type, 'P1000');
    assert.equal(body.vehicles[1].today_assignment, null);
    assert.equal(body.vehicles[1].service_due, false);
    assert.equal(body.vehicles[1].maintenance_alert.status, 'ok');
    assert.equal(body.vehicles[1].readiness_status, 'ready');
    assert.equal(body.vehicles[1].custom_truck_type, 'Box Truck P700');
  } finally {
    await server.close();
  }
});

test('POST /vehicles creates a vehicle for the authenticated account', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.name, 'Truck 24');
      assert.equal(query.payload.plate, 'NEW123');
      assert.equal(query.payload.truck_type, 'Other');
      assert.equal(query.payload.custom_truck_type, 'P900 Reefer');
      assert.equal(query.payload.registration_expiration, '2026-09-30');
      assert.equal(query.payload.fuel_type, 'Diesel');
      assert.equal(query.payload.notes, 'No DEF');
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
        truck_type: 'Other',
        custom_truck_type: 'P900 Reefer',
        make: 'Ford',
        model: 'Transit',
        year: 2024,
        plate: 'NEW123',
        registration_expiration: '2026-09-30',
        fuel_type: 'diesel',
        notes: 'No DEF'
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { vehicle_id: 'vehicle-new' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles/inspection-assignments creates an assignment and notifies the driver', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'id')?.value, 'vehicle-1');
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '411987',
          make: 'Ford',
          model: 'Transit',
          year: 2022
        },
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'id')?.value, 'driver-1');
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return {
        data: {
          id: 'driver-1',
          account_id: 'acct-1',
          name: 'Phillip'
        },
        error: null
      };
    }

    if (query.table === 'vehicle_inspection_assignments' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      assert.equal(query.payload.assigned_driver_id, 'driver-1');
      assert.equal(query.payload.assigned_by_manager_user_id, 'manager-1');
      assert.equal(query.payload.due_date, '2026-06-27');
      assert.equal(query.payload.priority, 'urgent');
      assert.equal(query.payload.require_before_route_start, false);
      assert.equal(query.payload.status, 'pending');
      return {
        data: {
          id: 'assignment-1',
          created_at: '2026-06-27T16:00:00.000Z',
          updated_at: '2026-06-27T16:00:00.000Z',
          ...query.payload
        },
        error: null
      };
    }

    if (query.table === 'app_notifications' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.recipient_type, 'driver');
      assert.equal(query.payload.driver_id, 'driver-1');
      assert.equal(query.payload.notification_type, 'driver_manual_inspection_assigned');
      assert.equal(query.payload.link_type, 'vehicle_inspection_assignment');
      assert.equal(query.payload.link_ref.assignment_id, 'assignment-1');
      assert.equal(query.payload.severity, 'warning');
      assert.match(query.payload.body, /411987/);
      return {
        data: {
          id: 'notification-1',
          status: 'unread',
          read_at: null,
          created_at: '2026-06-27T16:00:00.000Z',
          ...query.payload
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase, () => new Date('2026-06-27T16:00:00.000Z'));

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/inspection-assignments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vehicle_id: 'vehicle-1',
        driver_id: 'driver-1',
        due_date: '2026-06-27',
        priority: 'urgent',
        note: 'Check this truck before leaving.',
        require_before_route_start: false
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.assignment.id, 'assignment-1');
    assert.equal(body.assignment.vehicle.name, '411987');
    assert.equal(body.assignment.driver.name, 'Phillip');
    assert.equal(body.assignment.require_before_route_start, false);
  } finally {
    await server.close();
  }
});

test('POST /vehicles accepts P1100 as a supported truck type', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'insert') {
      assert.equal(query.payload.truck_type, 'P1100');
      assert.equal(query.payload.custom_truck_type, null);
      return {
        data: { id: 'vehicle-p1100' },
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
        name: 'Truck 1100',
        truck_type: 'P1100',
        make: 'Freightliner',
        model: 'Step Van',
        year: 2024,
        plate: 'P1100'
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { vehicle_id: 'vehicle-p1100' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles requires a separate license plate', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Should not hit supabase');
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
        name: '329310',
        make: 'Freightliner',
        model: 'MT45',
        year: 2012
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Vehicle ID, license plate, make, model, and year are required'
    });
  } finally {
    await server.close();
  }
});

test('POST /vehicles accepts P900 as a supported truck type', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'insert') {
      assert.equal(query.payload.truck_type, 'P900');
      assert.equal(query.payload.custom_truck_type, null);
      assert.equal(query.payload.name, '538785');
      assert.equal(query.payload.plate, 'WA-538785');
      return {
        data: { id: 'vehicle-p900' },
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
        name: '538785',
        truck_type: 'P900',
        make: 'Ford',
        model: 'F59',
        year: 2019,
        plate: 'WA-538785',
        registration_expiration: '2026-07-31',
        current_mileage: 65855
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { vehicle_id: 'vehicle-p900' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles validates custom truck type when Other is selected', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Should not hit supabase');
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
        truck_type: 'Other',
        make: 'Ford',
        model: 'Transit',
        year: 2024,
        plate: 'NEW123'
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'custom_truck_type is required when truck_type is Other' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles validates fuel type', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Should not hit supabase');
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
        name: '329310',
        truck_type: 'P700',
        make: 'Freightliner',
        model: 'MT45',
        year: 2012,
        plate: '329310',
        fuel_type: 'Hydrogen'
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'fuel_type must be Gas, Diesel, or EV' });
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

test('PUT /vehicles/:id saves vehicle status and active state together', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          truck_type: 'P1000',
          custom_truck_type: null
        },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      assert.equal(query.payload.vehicle_status, 'at_the_shop');
      assert.equal(query.payload.is_active, false);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vehicle_status: 'at_the_shop' })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
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
      assert.equal(query.payload.service_type, 'Oil Change');
      assert.equal(query.payload.description, 'Oil change');
      assert.equal(query.payload.condition_notes, 'Clean oil, 3,000 miles remaining on pads');
      assert.equal(query.payload.vendor_name, 'Ready Shop');
      assert.equal(query.payload.mileage_at_service, 18550);
      assert.equal(query.payload.next_service_mileage, 23500);
      assert.equal(query.payload.next_service_date, '2026-07-10');
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

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return {
        data: null,
        error: null
      };
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
        service_type: 'Oil Change',
        description: 'Oil change',
        condition_notes: 'Clean oil, 3,000 miles remaining on pads',
        vendor_name: 'Ready Shop',
        cost: 149.99,
        mileage_at_service: 18550,
        next_service_mileage: 23500,
        next_service_date: '2026-07-10'
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { maintenance_id: 'maint-new' });
    assert.equal(vehicleUpdateSeen, true);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspections saves a manager inspection and updates mileage', async () => {
  let vehicleUpdateSeen = false;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '204526',
          make: 'Ford',
          model: 'Transit',
          year: 2022,
          truck_type: 'P1100',
          current_mileage: 12000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_inspections' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      assert.equal(query.payload.inspection_type, 'manager');
      assert.equal(query.payload.inspection_date, '2026-06-02');
      assert.equal(query.payload.odometer, 12345);
      assert.equal(query.payload.status, 'safe_with_maintenance_reported');
      assert.equal(query.payload.submitted_by_type, 'manager');
      assert.equal(query.payload.submitted_by_manager_user_id, 'manager-1');
      assert.equal(query.payload.items[0].checklist_item_key, 'tires');
      assert.equal(query.payload.items[0].status, 'issue');
      assert.equal(query.payload.items[0].severity, 'maintenance_soon');
      return {
        data: {
          id: 'inspection-1',
          ...query.payload
        },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      vehicleUpdateSeen = true;
      assert.equal(query.payload.current_mileage, 12345);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken({ manager_name: 'Phillip Manager' })}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inspection_date: '2026-06-02',
        odometer: 12345,
        issue_note: 'Left rear tire needs review',
        items: [
          { checklist_item_key: 'tires', label: 'Tires', status: 'fail' },
          { checklist_item_key: 'lights', label: 'Lights', status: 'pass' }
        ]
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.inspection.id, 'inspection-1');
    assert.equal(body.inspection.status, 'safe_with_maintenance_reported');
    assert.equal(body.inspection.failed_items_count, 1);
    assert.equal(body.inspection.vehicle.name, '204526');
    assert.equal(vehicleUpdateSeen, true);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspection-photo uploads a manager inspection photo', async () => {
  let uploadedBucket = null;
  let uploadedPath = null;
  let uploadedContentType = null;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '204526'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });
  supabase.storage = {
    from(bucket) {
      uploadedBucket = bucket;
      return {
        async upload(path, buffer, options) {
          uploadedPath = path;
          uploadedContentType = options.contentType;
          assert.ok(Buffer.isBuffer(buffer));
          assert.equal(buffer.toString(), 'image');
          return { error: null };
        },
        async createSignedUrl(path) {
          return {
            data: { signedUrl: `https://signed.readyroute.test/${path}` },
            error: null
          };
        },
        async remove() {
          return { data: null, error: null };
        }
      };
    }
  };

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspection-photo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checklist_item_key: 'tires',
        image_base64: Buffer.from('image').toString('base64'),
        mime_type: 'image/jpeg',
        file_name: 'tire.jpg'
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(uploadedBucket, 'vehicle-inspection-photos');
    assert.match(uploadedPath, /^acct-1\/vehicle-1\/manager-inspection\/tires\/\d+-[a-f0-9]+-tire\.jpg$/);
    assert.equal(uploadedContentType, 'image/jpeg');
    assert.equal(body.photo.storage_bucket, 'vehicle-inspection-photos');
    assert.equal(body.photo.storage_path, uploadedPath);
    assert.equal(body.photo.url, `https://signed.readyroute.test/${uploadedPath}`);
  } finally {
    await server.close();
  }
});

test('GET /vehicles/inspections derives display status from legacy submitted checklist issues', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_inspections' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'inspection-legacy',
            account_id: 'acct-1',
            vehicle_id: 'vehicle-1',
            inspection_date: '2026-06-27',
            inspection_type: 'driver',
            odometer: 10000,
            status: 'submitted',
            issue_reported: true,
            submitted_by_type: 'driver',
            submitted_by_driver_id: 'driver-1',
            submitted_by_name: 'Driver One',
            submitted_at: '2026-06-27T23:11:27.936Z',
            items: [
              {
                checklist_item_key: 'wipers',
                label: 'Wipers',
                status: 'issue',
                severity: 'maintenance_soon',
                issue_details: {
                  position: 'Both',
                  issue_type: 'Torn'
                }
              },
              { checklist_item_key: 'lights', label: 'Lights', status: 'pass' }
            ]
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      assert.deepEqual(query.filters.find((filter) => filter.op === 'in')?.value, ['vehicle-1']);
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '321049',
            make: 'Ford',
            model: 'Transit',
            year: 2022,
            truck_type: 'P1000'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/inspections`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.inspections[0].status, 'safe_with_maintenance_reported');
    assert.equal(body.inspections[0].status_label, 'Safe with Maintenance Reported');
    assert.equal(body.inspections[0].issue_count, 1);
    assert.equal(body.inspections[0].items[0].status, 'issue');
    assert.equal(body.inspections[0].vehicle.name, '321049');
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspections rejects unanswered inspection items', async () => {
  const supabase = new MockSupabase((query) => {
    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inspection_date: '2026-06-02',
        odometer: 12345,
        items: [
          { checklist_item_key: 'tires', label: 'Tires', status: 'pass' },
          { checklist_item_key: 'lights', label: 'Lights' }
        ]
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'All inspection items must be answered before submitting'
    });
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspections saves unsafe issues as urgent manager review', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '204526',
          make: 'Ford',
          model: 'Transit',
          year: 2022,
          truck_type: 'P1100',
          current_mileage: 65000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_inspections' && query.operation === 'insert') {
      assert.equal(query.payload.status, 'urgent_manager_review');
      assert.equal(query.payload.issue_reported, true);
      assert.equal(query.payload.items[0].status, 'issue');
      assert.equal(query.payload.items[0].severity, 'unsafe');
      assert.equal(query.payload.items[0].urgent_review, true);
      assert.deepEqual(query.payload.items[0].issue_details, {
        position: 'Back Right',
        issue_type: 'Exposed cord'
      });

      return {
        data: {
          id: 'inspection-unsafe',
          ...query.payload
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inspection_date: '2026-06-27',
        odometer: 65000,
        items: [
          {
            checklist_item_key: 'tires',
            label: 'Tires',
            status: 'issue',
            severity: 'unsafe',
            issue_details: {
              position: 'Back Right',
              issue_type: 'Exposed cord'
            }
          },
          { checklist_item_key: 'lights', label: 'Lights', status: 'pass' }
        ]
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.inspection.status, 'urgent_manager_review');
    assert.equal(body.inspection.urgent_review, true);
    assert.equal(body.inspection.highest_severity, 'unsafe');
    assert.equal(body.inspection.failed_items_count, 1);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspections retries with legacy payload when optional inspection columns are missing', async () => {
  let insertAttempts = 0;
  let vehicleUpdateSeen = false;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '204526',
          make: 'Ford',
          model: 'Transit',
          year: 2022,
          truck_type: 'P1100',
          current_mileage: 12000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_inspections' && query.operation === 'insert') {
      insertAttempts += 1;

      if (insertAttempts === 1) {
        assert.equal(query.payload.submitted_by_manager_user_id, 'manager-1');
        return {
          data: null,
          error: {
            code: 'PGRST204',
            message: "Could not find the 'submitted_by_manager_user_id' column of 'vehicle_inspections' in the schema cache"
          }
        };
      }

      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      assert.equal(query.payload.inspection_type, 'manager');
      assert.equal(query.payload.submitted_by_manager_user_id, undefined);
      assert.equal(query.payload.submitted_by_type, 'manager');
      return {
        data: {
          id: 'inspection-legacy',
          ...query.payload
        },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      vehicleUpdateSeen = true;
      assert.equal(query.payload.current_mileage, 12345);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inspection_date: '2026-06-02',
        odometer: 12345,
        items: [
          { checklist_item_key: 'tires', label: 'Tires', status: 'pass' }
        ]
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.inspection.id, 'inspection-legacy');
    assert.equal(insertAttempts, 2);
    assert.equal(vehicleUpdateSeen, true);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/inspections retries as daily_check when the legacy inspection type constraint rejects manager', async () => {
  let insertAttempts = 0;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          name: '204526',
          make: 'Ford',
          model: 'Transit',
          year: 2022,
          truck_type: 'P1100',
          current_mileage: 65000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_inspections' && query.operation === 'insert') {
      insertAttempts += 1;

      if (insertAttempts === 1) {
        assert.equal(query.payload.inspection_type, 'manager');
        return {
          data: null,
          error: {
            code: '23514',
            message: 'new row for relation "vehicle_inspections" violates check constraint "vehicle_inspections_type_check"',
            details: 'Failing row contains manager.'
          }
        };
      }

      assert.equal(query.payload.inspection_type, 'daily_check');
      assert.equal(query.payload.issue_reported, true);
      assert.equal(query.payload.submitted_by_type, 'manager');
      assert.equal(query.payload.items, undefined);
      return {
        data: {
          id: 'inspection-daily-check',
          ...query.payload
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/inspections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken({ manager_name: 'Phillip Manager' })}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inspection_date: '2026-06-26',
        odometer: 65000,
        issue_note: 'Needs manager review',
        items: [
          { checklist_item_key: 'tires', label: 'Tires', status: 'fail' }
        ]
      })
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.inspection.id, 'inspection-daily-check');
    assert.equal(body.inspection.inspection_type_label, 'Manager Inspection');
    assert.equal(insertAttempts, 2);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/maintenance calculates next due mileage from the maintenance item interval', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          current_mileage: 55100,
          last_service_mileage: 50000
        },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return {
        data: {
          service_type: 'Oil Change',
          is_enabled: true,
          default_interval_miles: 5000,
          default_interval_days: 180
        },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance' && query.operation === 'insert') {
      assert.equal(query.payload.service_type, 'Oil Change');
      assert.equal(query.payload.description, 'Completed Oil Change');
      assert.equal(query.payload.vendor_name, 'Ready Shop');
      assert.equal(query.payload.mileage_at_service, 55100);
      assert.equal(query.payload.next_service_mileage, 60100);
      return {
        data: { id: 'maint-calculated' },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      assert.equal(query.payload.last_service_mileage, 55100);
      assert.equal(query.payload.next_service_mileage, 60100);
      assert.equal(query.payload.current_mileage, undefined);
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
        service_date: '2026-05-12',
        service_type: 'Oil Change',
        vendor_name: 'Ready Shop',
        mileage_at_service: 55100
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { maintenance_id: 'maint-calculated' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/maintenance repairs a stale next due mileage from the service interval', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          current_mileage: 0,
          last_service_mileage: null
        },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return {
        data: {
          service_type: 'Oil Change',
          is_enabled: true,
          default_interval_miles: 5000,
          default_interval_days: 180
        },
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance' && query.operation === 'insert') {
      assert.equal(query.payload.mileage_at_service, 65000);
      assert.equal(query.payload.next_service_mileage, 70000);
      return {
        data: { id: 'maint-repaired' },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      assert.equal(query.payload.last_service_mileage, 65000);
      assert.equal(query.payload.next_service_mileage, 70000);
      assert.equal(query.payload.current_mileage, 65000);
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
        service_date: '2026-05-16',
        service_type: 'Oil Change',
        mileage_at_service: 65000,
        next_service_mileage: 5000
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { maintenance_id: 'maint-repaired' });
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/odometer saves a manager override audit row and updates mileage', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: {
          id: 'vehicle-1',
          account_id: 'acct-1',
          current_mileage: 54250
        },
        error: null
      };
    }

    if (query.table === 'vehicle_odometer_entries' && query.operation === 'insert') {
      assert.equal(query.payload.vehicle_id, 'vehicle-1');
      assert.equal(query.payload.manager_user_id, 'manager-1');
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.old_odometer_reading, 54250);
      assert.equal(query.payload.new_odometer_reading, 54000);
      assert.equal(query.payload.odometer_reading, 54000);
      assert.equal(query.payload.source, 'manager');
      assert.equal(query.payload.notes, 'Correcting bad entry');
      return {
        data: {
          id: 'odo-manager-1',
          old_odometer_reading: 54250,
          new_odometer_reading: 54000,
          odometer_reading: 54000,
          recorded_at: query.payload.recorded_at,
          source: 'manager',
          notes: 'Correcting bad entry'
        },
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'update') {
      assert.equal(query.payload.current_mileage, 54000);
      assert.equal(query.filters.find((filter) => filter.column === 'id')?.value, 'vehicle-1');
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/odometer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken({ manager_user_id: 'manager-1' })}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        odometer_reading: 54000,
        notes: 'Correcting bad entry'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.vehicle.current_mileage, 54000);
    assert.equal(body.entry.source, 'manager');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/:id/odometer-history returns entries with driver and route labels', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: { id: 'vehicle-1', account_id: 'acct-1' },
        error: null
      };
    }

    if (query.table === 'vehicle_odometer_entries' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'vehicle_id')?.value, 'vehicle-1');
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      assert.equal(query.limit, 100);
      return {
        data: [
          {
            id: 'odo-1',
            driver_id: 'driver-1',
            route_id: 'route-1',
            odometer_reading: 54321,
            source: 'driver',
            notes: 'Morning reading',
            recorded_at: '2026-05-16T14:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      assert.deepEqual(query.filters.find((filter) => filter.column === 'id')?.value, ['driver-1']);
      return { data: [{ id: 'driver-1', name: 'Phillip Driver' }], error: null };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      assert.deepEqual(query.filters.find((filter) => filter.column === 'id')?.value, ['route-1']);
      return { data: [{ id: 'route-1', work_area_name: '829' }], error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/odometer-history`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.odometer_entries.length, 1);
    assert.equal(body.odometer_entries[0].driver.name, 'Phillip Driver');
    assert.equal(body.odometer_entries[0].route.work_area_name, '829');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/:id/assignment-history returns recent route assignments', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: { id: 'vehicle-1', account_id: 'acct-1' },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'vehicle_id')?.value, 'vehicle-1');
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      assert.equal(query.limit, 100);
      return {
        data: [
          {
            id: 'route-1',
            date: '2026-05-16',
            work_area_name: '829',
            driver_id: 'driver-1',
            status: 'in_progress',
            completed_stops: 28,
            total_stops: 134
          }
        ],
        error: null
      };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      assert.deepEqual(query.filters.find((filter) => filter.column === 'id')?.value, ['driver-1']);
      return { data: [{ id: 'driver-1', name: 'Phillip Driver' }], error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/vehicle-1/assignment-history`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.assignments.length, 1);
    assert.equal(body.assignments[0].work_area_name, '829');
    assert.equal(body.assignments[0].driver.name, 'Phillip Driver');
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
          { id: 'maint-2', service_date: '2026-04-10', service_type: 'Brake Pads', description: 'Tires', condition_notes: '2,000 miles left' },
          { id: 'maint-1', service_date: '2026-03-10', service_type: 'Oil Change', description: 'Oil change', condition_notes: null }
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
    assert.equal(body.maintenance[0].service_type, 'Brake Pads');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/maintenance-records returns recent maintenance with truck details', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_maintenance' && query.operation === 'select') {
      assert.deepEqual(query.orders, [
        { column: 'service_date', options: { ascending: false } },
        { column: 'created_at', options: { ascending: false } }
      ]);
      assert.equal(query.limit, 100);
      return {
        data: [
          {
            id: 'maint-1',
            vehicle_id: 'vehicle-1',
            account_id: 'acct-1',
            service_date: '2026-05-16',
            service_type: 'Oil Change',
            description: 'Completed Oil Change',
            mileage_at_service: 65000,
            next_service_mileage: 70000,
            created_at: '2026-05-16T17:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      assert.deepEqual(query.filters.find((filter) => filter.column === 'id')?.value, ['vehicle-1']);
      return {
        data: [
          {
            id: 'vehicle-1',
            name: '204526',
            make: 'Ford',
            model: 'Transit',
            year: 2022,
            truck_type: 'P1100',
            custom_truck_type: null
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/maintenance-records`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.maintenance.length, 1);
    assert.equal(body.maintenance[0].service_type, 'Oil Change');
    assert.equal(body.maintenance[0].vehicle.name, '204526');
    assert.equal(body.maintenance[0].vehicle.truck_type, 'P1100');
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

test('GET /vehicles/settings/maintenance returns defaults when no account settings exist', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return { data: [], error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/maintenance`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.settings.length, 6);
    assert.equal(body.settings[1].service_type, 'Oil Change');
    assert.equal(body.settings[1].default_interval_miles, 5000);
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/settings/maintenance upserts account maintenance settings', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return {
        data: [
          { service_type: 'Oil Change' },
          { service_type: 'Brake Pads' },
          { service_type: 'Air Filter' }
        ],
        error: null
      };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'delete') {
      assert.deepEqual(query.filters.find((filter) => filter.op === 'in')?.value, ['Air Filter']);
      return { data: null, error: null };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'update') {
      throw new Error('Unexpected update');
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'insert') {
      throw new Error('Unexpected insert');
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.length, 2);
      assert.equal(query.payload[0].account_id, 'acct-1');
      assert.equal(query.payload[0].service_type, 'Oil Change');
      assert.equal(query.payload[0].default_interval_miles, 6000);
      assert.equal(query.payload[1].service_type, 'Brake Pads');
      assert.equal(query.payload[1].default_interval_days, 120);
      assert.equal(query.upsertOptions.onConflict, 'account_id,service_type');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/maintenance`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: [
          { service_type: 'Oil Change', is_enabled: true, default_interval_miles: 6000, default_interval_days: 180 },
          { service_type: 'Brake Pads', is_enabled: true, default_interval_miles: null, default_interval_days: 120 }
        ]
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.settings.length, 2);
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/settings/maintenance accepts custom maintenance items', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return { data: [], error: null };
    }

    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.length, 1);
      assert.equal(query.payload[0].account_id, 'acct-1');
      assert.equal(query.payload[0].service_type, 'Lift Gate Service');
      assert.equal(query.payload[0].default_interval_miles, null);
      assert.equal(query.payload[0].default_interval_days, 90);
      assert.equal(query.payload[0].notes, 'Check wiring and switch.');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/maintenance`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: [
          {
            service_type: 'Lift Gate Service',
            is_enabled: true,
            default_interval_miles: null,
            default_interval_days: 90,
            notes: 'Check wiring and switch.'
          }
        ]
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.settings[0].service_type, 'Lift Gate Service');
    assert.equal(body.settings[0].notes, 'Check wiring and switch.');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/settings/maintenance-requirements returns option 1 defaults', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/maintenance-requirements`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.setting.maintenance_requirement_mode, 'option_1');
    assert.equal(body.setting.weekly_inspection_day, 'Monday');
    assert.equal(body.setting.maintenance_warning_miles, 1000);
    assert.equal(body.setting.maintenance_warning_days, 14);
    assert.equal(body.setting.document_warning_days, 30);
    assert.equal(body.setting.custom_daily_requirements.require_truck_confirmation, true);
    assert.equal(body.setting.custom_weekly_requirements.require_full_checklist_weekly, true);
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/settings/maintenance-requirements persists selected mode and custom requirements', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.maintenance_requirement_mode, 'custom');
      assert.equal(query.payload.weekly_inspection_day, 'Thursday');
      assert.equal(query.payload.maintenance_warning_miles, 1000);
      assert.equal(query.payload.maintenance_warning_days, 14);
      assert.equal(query.payload.document_warning_days, 30);
      assert.equal(query.payload.custom_daily_requirements.require_truck_confirmation, true);
      assert.equal(query.payload.custom_daily_requirements.require_full_checklist_daily, true);
      assert.equal(query.payload.custom_weekly_requirements.require_full_checklist_weekly, false);
      assert.equal(query.payload.custom_weekly_requirements.require_manager_review_for_reported_issues, true);
      assert.equal(query.payload.updated_by_manager_user_id, 'manager-1');
      assert.equal(query.payload.updated_at, '2026-04-12T16:00:00.000Z');
      assert.equal(query.upsertOptions.onConflict, 'account_id');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/maintenance-requirements`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        maintenance_requirement_mode: 'custom',
        weekly_inspection_day: 'Thursday',
        custom_daily_requirements: {
          require_truck_confirmation: true,
          require_odometer_entry: true,
          show_issue_note_box: false,
          require_full_checklist_daily: true
        },
        custom_weekly_requirements: {
          require_full_checklist_weekly: false,
          require_manager_review_for_reported_issues: true
        }
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.setting.maintenance_requirement_mode, 'custom');
    assert.equal(body.setting.weekly_inspection_day, 'Thursday');
  } finally {
    await server.close();
  }
});

test('GET /vehicles/settings/reminder-schedule returns default reminder windows', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/reminder-schedule`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schedule.weekly_inspection_day, 'Monday');
    assert.equal(body.schedule.maintenance_warning_miles, 1000);
    assert.equal(body.schedule.maintenance_warning_days, 14);
    assert.equal(body.schedule.document_warning_days, 30);
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/settings/reminder-schedule persists warning windows without replacing requirements', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'select') {
      return {
        data: {
          maintenance_requirement_mode: 'custom',
          weekly_inspection_day: 'Monday',
          custom_daily_requirements: {
            require_truck_confirmation: true,
            require_odometer_entry: true,
            show_issue_note_box: false,
            require_full_checklist_daily: true
          },
          custom_weekly_requirements: {
            require_full_checklist_weekly: false,
            require_manager_review_for_reported_issues: true
          }
        },
        error: null
      };
    }

    if (query.table === 'vehicle_check_requirement_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.maintenance_requirement_mode, 'custom');
      assert.equal(query.payload.weekly_inspection_day, 'Friday');
      assert.equal(query.payload.maintenance_warning_miles, 1500);
      assert.equal(query.payload.maintenance_warning_days, 21);
      assert.equal(query.payload.document_warning_days, 45);
      assert.equal(query.payload.custom_daily_requirements.show_issue_note_box, false);
      assert.equal(query.payload.custom_weekly_requirements.require_full_checklist_weekly, false);
      assert.equal(query.payload.updated_by_manager_user_id, 'manager-1');
      assert.equal(query.payload.updated_at, '2026-04-12T16:00:00.000Z');
      assert.equal(query.upsertOptions.onConflict, 'account_id');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/reminder-schedule`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        weekly_inspection_day: 'Friday',
        maintenance_warning_miles: 1500,
        maintenance_warning_days: 21,
        document_warning_days: 45
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schedule.weekly_inspection_day, 'Friday');
    assert.equal(body.schedule.maintenance_warning_miles, 1500);
    assert.equal(body.schedule.maintenance_warning_days, 21);
    assert.equal(body.schedule.document_warning_days, 45);
  } finally {
    await server.close();
  }
});

test('GET /vehicles/settings/checklist-template returns default checklist fields', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_checklist_template_settings' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'account_id')?.value, 'acct-1');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/checklist-template`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.template.fields.length, 19);
    assert.equal(body.template.fields[2].id, 'truck_number');
    assert.equal(body.template.fields[2].label, 'Vehicle ID');
    assert.equal(body.template.fields.every((field) => field.enabled), true);
  } finally {
    await server.close();
  }
});

test('PUT /vehicles/settings/checklist-template persists enabled checklist fields', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_checklist_template_settings' && query.operation === 'upsert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.fields.length, 19);
      assert.equal(query.payload.fields.find((field) => field.id === 'coolant').enabled, false);
      assert.equal(query.payload.fields.find((field) => field.id === 'truck_number').label, 'Vehicle ID');
      assert.equal(query.payload.updated_by_manager_user_id, 'manager-1');
      assert.equal(query.payload.updated_at, '2026-04-12T16:00:00.000Z');
      assert.equal(query.upsertOptions.onConflict, 'account_id');
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/vehicles/settings/checklist-template`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: [
          { id: 'coolant', enabled: false },
          { id: 'driver_notes', enabled: true }
        ]
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.template.fields.find((field) => field.id === 'coolant').enabled, false);
    assert.equal(body.template.fields.find((field) => field.id === 'driver_notes').enabled, true);
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
        service_type: 'Oil Change',
        description: 'Oil change'
      })
    });

    assert.equal(response.status, 403);
  } finally {
    await server.close();
  }
});

test('POST /vehicles/:id/maintenance validates service type', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'vehicle_maintenance_settings' && query.operation === 'select') {
      return { data: null, error: null };
    }

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
        service_type: 'Unsupported',
        description: 'Oil change'
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'service_type is not supported' });
  } finally {
    await server.close();
  }
});
