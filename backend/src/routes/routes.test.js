const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const axios = require('axios');

process.env.JWT_SECRET = 'test-secret';
process.env.GOOGLE_MAPS_API_KEY = '';

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

  upsert(payload, options = {}) {
    this.operation = 'upsert';
    this.state.payload = payload;
    this.state.options = options;
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

  gt(column, value) {
    this.state.filters.push({ op: 'gt', column, value });
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
    this.storage = {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn/default.jpg' } })
      })
    };
  }

  from(table) {
    return new MockQueryBuilder(this, table);
  }

  execute(query) {
    this.calls.push(query);
    return this.handler(query, this.calls);
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

function buildMultipartBody({ boundary, fields = {}, file, files = [] }) {
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        'utf8'
      )
    );
  }

  const allFiles = [];
  if (file) {
    allFiles.push({
      fieldName: 'file',
      ...file
    });
  }
  allFiles.push(...files);

  for (const currentFile of allFiles) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${currentFile.fieldName}"; filename="${currentFile.filename}"\r\nContent-Type: ${currentFile.contentType}\r\n\r\n`,
        'utf8'
      )
    );
    chunks.push(currentFile.buffer);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

function buildFedExManifestBuffer() {
  const workbook = XLSX.utils.book_new();
  const headerRows = [
    ['Page', 'Combined Manifest'],
    ['Date', '04/13/2026'],
    ['SA#', '919'],
    ['WA#', '0810'],
    ['IC/ISP', 'Bridge Transportation Inc'],
    ['Driver', 'JIMENEZ,LUIS'],
    ['User Type', 'DRIVER'],
    ['Vehicle #', '402984'],
    ['Vehicle Type', 'VAN']
  ];
  const stopRows = [
    ['ST#', 'Delivery/Pickup', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', '# Pkgs', 'SID', 'Ready', 'Close'],
    [1, 'Delivery', 'Acme Receiving', '123 Main St', 'Suite 200', 'San Diego', 'CA', '92029-4159', 2, 'SID123', '09:00', '10:00'],
    [1, 'Pickup', 'Acme Receiving', '123 Main St', 'Suite 200', 'San Diego', 'CA', '92029-4159', 1, 0, '13:00', '14:00'],
    [2, 'Pickup', 'Warehouse Dock', '456 Market St', '', 'San Diego', 'CA', '92101', 3, 0, '00:00', '00:00']
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(headerRows), 'Header');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(stopRows), 'Stop Details');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function buildGpxManifestBuffer() {
  return Buffer.from(
    `<?xml version="1.0"?>
    <gpx>
      <rte>
        <name>WA 0810</name>
        <rtept lon="-117.20" lat="33.10"><name>Seq 1:SID SID123:123 Main St:Ready 09:00:Close 10:00</name></rtept>
        <rtept lon="-117.30" lat="33.20"><name>Seq 2:SID 0:456 Market St:Ready 00:00:Close 00:00</name></rtept>
      </rte>
    </gpx>`,
    'utf8'
  );
}

test('GET /routes/today returns the driver route with stops and nested packages', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          date: '2026-04-08',
          status: 'active',
          total_stops: 2,
          completed_stops: 0,
          completed_at: null
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
            address: '100 Main St',
            contact_name: 'PALOMAR REHABILITATION',
            address_line2: 'Suite 100',
            sid: 'SID123',
            ready_time: '09:00',
            close_time: '10:00',
            has_time_commit: true,
            stop_type: 'delivery',
            has_pickup: false,
            has_delivery: true,
            is_business: true,
            has_note: true,
            lat: 1,
            lng: 2,
            status: 'pending',
            exception_code: null,
            delivery_type_code: null,
            signer_name: null,
            signature_url: null,
            age_confirmed: false,
            pod_photo_url: null,
            pod_signature_url: null,
            scanned_at: null,
            completed_at: null
          },
          {
            id: 'stop-2',
            route_id: 'route-1',
            sequence_order: 2,
            address: '200 Oak St',
            contact_name: 'John Smith',
            address_line2: '',
            sid: '0',
            ready_time: null,
            close_time: null,
            has_time_commit: false,
            stop_type: 'combined',
            has_pickup: true,
            has_delivery: true,
            is_business: false,
            has_note: false,
            lat: 3,
            lng: 4,
            status: 'delivered',
            exception_code: '07',
            delivery_type_code: null,
            signer_name: null,
            signature_url: null,
            age_confirmed: false,
            pod_photo_url: null,
            pod_signature_url: null,
            scanned_at: null,
            completed_at: '2026-04-08T16:00:00.000Z'
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
            tracking_number: 'TN1',
            requires_signature: false,
            hazmat: false
          },
          {
            id: 'pkg-2',
            stop_id: 'stop-2',
            tracking_number: 'TN2',
            requires_signature: true,
            hazmat: false
          }
        ],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'apartment_units' && query.operation === 'select') {
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

    if (query.table === 'stop_notes' && query.operation === 'select') {
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

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/today`, {
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.route.id, 'route-1');
    assert.equal(body.route.total_stops, 2);
    assert.equal(body.route.completed_stops, 0);
    assert.equal(body.route.stops_per_hour, null);
    assert.equal(body.route.stops.length, 2);
    assert.deepEqual(body.route.stops[0].packages, [
      {
        id: 'pkg-1',
        tracking_number: 'TN1',
        requires_signature: false,
        hazmat: false
      }
    ]);
    assert.deepEqual(body.route.stops[1].packages, [
      {
        id: 'pkg-2',
        tracking_number: 'TN2',
        requires_signature: true,
        hazmat: false
      }
    ]);
    assert.equal(body.route.stops[1].status, 'attempted');
    assert.equal(body.route.stops[0].is_business, true);
    assert.equal(body.route.stops[0].has_note, false);
    assert.equal(body.route.stops[0].ready_time, '09:00');
    assert.equal(body.route.stops[1].stop_type, 'combined');
  } finally {
    await server.close();
  }
});

test('PATCH /routes/stops/:stop_id/complete updates the stop and increments route progress', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 2,
              completed_stops: 0,
              status: 'active'
            }
          },
          error: null
        };
      }

      return {
        data: {
          id: 'stop-2',
          route_id: 'route-1',
          sequence_order: 2,
          address: '200 Oak St',
          lat: 3,
          lng: 4,
          status: 'pending'
        },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      assert.equal(query.payload.status, 'delivered');
      assert.equal(query.payload.exception_code, null);
      assert.equal(query.payload.delivery_type_code, '013');
      assert.equal(query.payload.signer_name, 'Pat Receiver');
      assert.equal(query.payload.age_confirmed, true);
      assert.equal(query.payload.signature_url, 'https://cdn/signature.png');
      assert.equal(query.payload.pod_photo_url, 'https://cdn/pod.jpg');
      assert.equal(query.payload.pod_signature_url, 'https://cdn/signature.png');
      assert.equal(query.payload.scanned_at, '2026-04-08T15:30:00.000Z');
      assert.match(query.payload.completed_at, /^\d{4}-\d{2}-\d{2}T/);
      return { data: null, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      assert.equal(query.payload.completed_stops, 1);
      assert.equal(query.payload.status, undefined);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'delivered',
        delivery_type_code: '013',
        signer_name: 'Pat Receiver',
        age_confirmed: true,
        pod_photo_url: 'https://cdn/pod.jpg',
        pod_signature_url: 'https://cdn/signature.png',
        scanned_at: '2026-04-08T15:30:00.000Z'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.next_stop.id, 'stop-2');
  } finally {
    await server.close();
  }
});

test('PATCH /routes/stops/:stop_id/complete stores attempted stops using a supported DB status', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 2,
              completed_stops: 0,
              status: 'active'
            }
          },
          error: null
        };
      }

      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      assert.equal(query.payload.status, 'delivered');
      assert.equal(query.payload.exception_code, '07');
      return { data: null, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      assert.equal(query.payload.completed_stops, 1);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'attempted',
        exception_code: '07'
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { next_stop: null });
  } finally {
    await server.close();
  }
});

test('POST /routes/position inserts a driver GPS row for the authenticated route', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          date: '2026-04-08',
          status: 'active',
          total_stops: 2,
          completed_stops: 0,
          completed_at: null
        },
        error: null
      };
    }

    if (query.table === 'driver_positions' && query.operation === 'insert') {
      assert.deepEqual(
        {
          route_id: query.payload.route_id,
          driver_id: query.payload.driver_id,
          account_id: query.payload.account_id,
          lat: query.payload.lat,
          lng: query.payload.lng
        },
        {
          route_id: 'route-1',
          driver_id: 'driver-1',
          account_id: 'acct-1',
          lat: 40.7128,
          lng: -74.006
        }
      );
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/position`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lat: 40.7128,
        lng: -74.006,
        route_id: 'route-1'
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await server.close();
  }
});

test('POST /routes/position rejects origin coordinates so invalid ocean pings are never saved', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('Position validation should fail before any database query runs');
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/position`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lat: 0,
        lng: 0,
        route_id: 'route-1'
      })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'lat, lng, and route_id are required' });
  } finally {
    await server.close();
  }
});

test('PATCH /routes/:route_id/status updates the assigned route status', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          date: '2026-04-08',
          status: 'pending',
          total_stops: 2,
          completed_stops: 0,
          completed_at: null
        },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      assert.deepEqual(query.payload, { status: 'in_progress' });
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/route-1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'in_progress'
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await server.close();
  }
});

test('GET /routes/stops/:stop_id returns stop detail with packages and note text', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 2,
              completed_stops: 0,
              status: 'pending'
            }
          },
          error: null
        };
      }

      return {
        data: {
          id: 'stop-1',
          route_id: 'route-1',
          sequence_order: 1,
          address: '100 Main St',
          contact_name: 'Acme Apartments',
          address_line2: 'Unit 3B gate code 4455',
          lat: 40.7,
          lng: -74,
          status: 'pending',
          notes: null,
          exception_code: null,
          delivery_type_code: null,
          signer_name: null,
          signature_url: null,
          age_confirmed: false,
          pod_photo_url: null,
          pod_signature_url: null,
          scanned_at: null,
          completed_at: null
        },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'all') {
      return {
        data: [
          {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            contact_name: 'Acme Apartments',
            address_line2: 'Unit 3B gate code 4455',
            status: 'pending',
            notes: null
          },
          {
            id: 'stop-2',
            route_id: 'route-1',
            sequence_order: 2,
            address: '100 Main St',
            contact_name: 'Acme Apartments',
            address_line2: 'Unit 2A',
            status: 'pending',
            notes: null
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
            tracking_number: 'TN1',
            requires_signature: true,
            hazmat: false
          }
        ],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'apartment_units' && query.operation === 'select') {
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

    if (query.table === 'stop_notes' && query.operation === 'select') {
      return {
        data: { note_text: 'Beware of side gate' },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1`, {
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.stop.address, '100 Main St');
    assert.equal(body.stop.note_text, 'Beware of side gate');
    assert.equal(body.stop.delivery_type_code, null);
    assert.equal(body.stop.property_intel.location_type, 'apartment');
    assert.equal(body.stop.property_intel.grouped_stop_count, 2);
    assert.equal(body.stop.property_intel.grouped_stops[0].sequence_order, 2);
    assert.deepEqual(body.stop.packages, [
      {
        id: 'pkg-1',
        tracking_number: 'TN1',
        requires_signature: true,
        hazmat: false
      }
    ]);
  } finally {
    await server.close();
  }
});

test('PATCH /routes/stops/:stop_id/note inserts a stop note when none exists', async () => {
  let updatedHasNote = null;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 2,
              completed_stops: 0,
              status: 'pending'
            }
          },
          error: null
        };
      }

      return { data: null, error: null };
    }

    if (query.table === 'stop_notes' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'stop_notes' && query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.note_text, 'Leave by side gate');
      return { data: null, error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      updatedHasNote = query.payload.has_note;
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/note`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        note_text: 'Leave by side gate'
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(updatedHasNote, true);
  } finally {
    await server.close();
  }
});

test('PATCH /routes/stops/:stop_id/note clears an existing note and resets has_note', async () => {
  let updatedHasNote = null;
  let deletedNoteId = null;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-1',
            route_id: 'route-1',
            sequence_order: 1,
            address: '100 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 2,
              completed_stops: 0,
              status: 'pending'
            }
          },
          error: null
        };
      }

      return { data: null, error: null };
    }

    if (query.table === 'stop_notes' && query.operation === 'select') {
      return { data: { id: 'note-1' }, error: null };
    }

    if (query.table === 'stop_notes' && query.operation === 'delete') {
      deletedNoteId = query.filters.find((filter) => filter.column === 'id')?.value || null;
      return { data: null, error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      updatedHasNote = query.payload.has_note;
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/note`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        note_text: ''
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(deletedNoteId, 'note-1');
    assert.equal(updatedHasNote, false);
  } finally {
    await server.close();
  }
});

test('driver cannot update a stop assigned to a different driver', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/foreign-stop/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'delivered'
      })
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Stop not assigned to this driver' });
  } finally {
    await server.close();
  }
});

test('POST /routes/pull-fedex returns the integration placeholder message', async () => {
  const supabase = new MockSupabase(() => {
    throw new Error('No database queries expected');
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const response = await fetch(`${server.baseUrl}/routes/pull-fedex`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.message, 'FedEx Integrator approval pending');
  } finally {
    await server.close();
  }
});

test('PATCH /routes/:route_id/assign updates route assignments for managers', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: {
          id: 'route-1',
          account_id: 'acct-1',
          driver_id: null,
          vehicle_id: null,
          work_area_name: '810',
          total_stops: 10,
          completed_stops: 0,
          status: 'pending'
        },
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
          total_stops: 10,
          completed_stops: 0,
          status: 'pending'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const response = await fetch(`${server.baseUrl}/routes/route-1/assign`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        driver_id: 'driver-1',
        vehicle_id: 'vehicle-1'
      })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.route.work_area_name, '810');
    assert.equal(body.route.driver_id, 'driver-1');
  } finally {
    await server.close();
  }
});

test('GET /routes/status-codes returns ordered FedEx status codes for drivers', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'fedex_status_codes' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'code-1',
            code: '011',
            description: 'Non Res. Recipient Closed on Sat.',
            category: '1',
            category_label: 'Delivery Not Attempted',
            affects_service_score: false,
            requires_warning: false,
            is_pickup_code: false,
            created_at: '2026-04-11T10:00:00.000Z'
          },
          {
            id: 'code-2',
            code: '002',
            description: 'Incorrect Recipient Address',
            category: '2',
            category_label: 'Delivery Attempted, Not Completed',
            affects_service_score: true,
            requires_warning: true,
            is_pickup_code: false,
            created_at: '2026-04-11T10:00:00.000Z'
          },
          {
            id: 'code-3',
            code: 'P10',
            description: 'Pickup Not Ready',
            category: 'P2',
            category_label: 'Pickup Attempted, Not Completed',
            affects_service_score: false,
            requires_warning: false,
            is_pickup_code: true,
            created_at: '2026-04-11T10:00:00.000Z'
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/status-codes`, {
      headers: {
        Authorization: `Bearer ${signDriverToken()}`
      }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.codes.length, 3);
    assert.equal(body.codes[0].category, '1');
    assert.equal(body.codes[1].requires_warning, true);
    assert.equal(body.codes[2].is_pickup_code, true);
  } finally {
    await server.close();
  }
});

test('POST /routes/upload-manifest accepts XLSX manifests and auto-matches driver and vehicle', async () => {
  let insertedRoutePayload;
  let insertedStopsPayload;
  let insertedPackagesPayload;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [{ id: 'driver-1', name: 'Luis Jimenez' }],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [{ id: 'vehicle-1', name: '402984' }],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'insert') {
      insertedRoutePayload = query.payload;
      return {
        data: { id: 'route-1' },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'insert') {
      insertedStopsPayload = query.payload;
      return {
        data: query.payload.map((stop, index) => ({
          id: `stop-${index + 1}`,
          sequence_order: stop.sequence_order
        })),
        error: null
      };
    }

    if (query.table === 'packages' && query.operation === 'insert') {
      insertedPackagesPayload = query.payload;
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const boundary = 'readyroute-boundary';
    const body = buildMultipartBody({
      boundary,
      file: {
        filename: 'fedex-combined-manifest.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildFedExManifestBuffer()
      }
    });

    const response = await fetch(`${server.baseUrl}/routes/upload-manifest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.route_id, 'route-1');
    assert.equal(payload.total_stops, 2);
    assert.equal(payload.delivery_count, 0);
    assert.equal(payload.pickup_count, 1);
    assert.equal(payload.combined_count, 1);
    assert.equal(payload.time_commit_count, 1);
    assert.equal(payload.auto_matched_driver, true);
    assert.equal(payload.auto_matched_vehicle, true);
    assert.equal(payload.matched_driver_name, 'Luis Jimenez');
    assert.equal(payload.manifest_meta.work_area_name, '810');
    assert.equal(payload.manifest_meta.date, '2026-04-13');

    assert.equal(insertedRoutePayload.work_area_name, '810');
    assert.equal(insertedRoutePayload.date, '2026-04-13');
    assert.equal(insertedRoutePayload.driver_id, 'driver-1');
    assert.equal(insertedRoutePayload.vehicle_id, 'vehicle-1');
    assert.equal(insertedRoutePayload.sa_number, '919');
    assert.equal(insertedRoutePayload.contractor_name, 'Bridge Transportation Inc');

    assert.equal(insertedStopsPayload.length, 2);
    assert.equal(insertedStopsPayload[0].stop_type, 'combined');
    assert.equal(insertedStopsPayload[0].has_pickup, true);
    assert.equal(insertedStopsPayload[0].has_delivery, true);
    assert.equal(insertedStopsPayload[0].has_time_commit, true);
    assert.equal(insertedStopsPayload[0].contact_name, 'Acme Receiving');
    assert.equal(insertedStopsPayload[0].address_line2, 'Suite 200');
    assert.equal(insertedStopsPayload[0].sid, 'SID123');
    assert.equal(insertedStopsPayload[0].ready_time, '09:00');
    assert.equal(insertedStopsPayload[0].close_time, '10:00');
    assert.equal(insertedStopsPayload[1].stop_type, 'pickup');
    assert.equal(insertedStopsPayload[1].has_pickup, true);
    assert.equal(insertedStopsPayload[1].has_delivery, false);
    assert.equal(insertedStopsPayload[1].is_pickup, true);

    assert.equal(insertedPackagesPayload.length, 6);
  } finally {
    await server.close();
  }
});

test('POST /routes/upload-manifest geocodes unknown addresses once and saves mappable stops', async () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalGet = axios.get;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';

  let insertedStopsPayload;
  let insertedCorrections = [];

  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [{ id: 'driver-1', name: 'Luis Jimenez' }],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [{ id: 'vehicle-1', name: '402984' }],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      if (query.mode === 'maybeSingle') {
        return { data: null, error: null };
      }

      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'insert') {
      insertedCorrections.push(query.payload);
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'insert') {
      return {
        data: { id: 'route-geo-1' },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'insert') {
      insertedStopsPayload = query.payload;
      return {
        data: query.payload.map((stop, index) => ({
          id: `stop-${index + 1}`,
          sequence_order: stop.sequence_order
        })),
        error: null
      };
    }

    if (query.table === 'packages' && query.operation === 'insert') {
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  axios.get = async ({}, options) => {
    const address = options?.params?.address || '';
    const base = address.includes('123 Main St') ? { lat: 33.1, lng: -117.2 } : { lat: 33.2, lng: -117.3 };
    return {
      data: {
        status: 'OK',
        results: [
          {
            geometry: {
              location: base,
              location_type: 'ROOFTOP'
            },
            formatted_address: address
          }
        ]
      }
    };
  };

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const boundary = 'readyroute-geo-boundary';
    const body = buildMultipartBody({
      boundary,
      file: {
        filename: 'fedex-combined-manifest.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildFedExManifestBuffer()
      }
    });

    const response = await fetch(`${server.baseUrl}/routes/upload-manifest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.geocoding.status, 'completed');
    assert.equal(payload.geocoding.failed, 0);
    assert.ok(payload.geocoding.attempted > 0);
    assert.ok(payload.geocoding.geocoded > 0);
    assert.equal(payload.route_health.map_status, 'mapped');
    assert.equal(payload.route_health.missing_stops, 0);
    assert.ok(payload.route_health.mapped_stops > 0);
    assert.ok(payload.route_health.pin_source_counts.google > 0);
    assert.ok(insertedStopsPayload.every((stop) => typeof stop.lat === 'number' && typeof stop.lng === 'number'));
    assert.ok(insertedCorrections.length > 0);
    assert.equal(insertedStopsPayload[0].geocode_source, 'manifest_geocoded');
  } finally {
    axios.get = originalGet;
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
    await server.close();
  }
});

test('POST /routes/upload-manifest optionally merges GPX coordinates into spreadsheet stop data', async () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = '';
  let insertedStopsPayload;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [{ id: 'driver-1', name: 'Luis Jimenez' }],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [{ id: 'vehicle-1', name: '402984' }],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      if (query.mode === 'maybeSingle') {
        return { data: null, error: null };
      }

      return { data: [], error: null };
    }

    if (query.table === 'routes' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'insert') {
      return {
        data: { id: 'route-merge-1' },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'insert') {
      insertedStopsPayload = query.payload;
      return {
        data: query.payload.map((stop, index) => ({
          id: `stop-${index + 1}`,
          sequence_order: stop.sequence_order
        })),
        error: null
      };
    }

    if (query.table === 'packages' && query.operation === 'insert') {
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const boundary = 'readyroute-merge-boundary';
    const body = buildMultipartBody({
      boundary,
      file: {
        filename: 'fedex-combined-manifest.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildFedExManifestBuffer()
      },
      files: [
        {
          fieldName: 'gpx_file',
          filename: 'fedex-combined-manifest.gpx',
          contentType: 'application/gpx+xml',
          buffer: buildGpxManifestBuffer()
        }
      ]
    });

    const response = await fetch(`${server.baseUrl}/routes/upload-manifest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.manifest_meta.work_area_name, '810');
    assert.equal(insertedStopsPayload[0].lat, 33.1);
    assert.equal(insertedStopsPayload[0].lng, -117.2);
    assert.equal(insertedStopsPayload[1].lat, 33.2);
    assert.equal(insertedStopsPayload[1].lng, -117.3);
    assert.equal(insertedStopsPayload[0].contact_name, 'Acme Receiving');
    assert.equal(insertedStopsPayload[0].address_line2, 'Suite 200');
    assert.equal(insertedStopsPayload[0].sid, 'SID123');
    assert.equal(insertedStopsPayload[0].geocode_source, 'manifest');
    assert.equal(insertedStopsPayload[0].geocode_accuracy, 'manifest');
    assert.equal(payload.route_health.map_status, 'mapped');
    assert.equal(payload.route_health.missing_stops, 0);
    assert.equal(payload.route_health.pin_source_counts.manifest, 2);
  } finally {
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
    await server.close();
  }
});

test('POST /routes/upload-manifest returns a clear duplicate-route error when the work area already exists for the date', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [{ id: 'driver-1', name: 'Luis Jimenez' }],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [{ id: 'vehicle-1', name: '402984' }],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: {
          id: 'route-existing',
          status: 'in_progress',
          completed_stops: 1,
          completed_at: null
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const boundary = 'readyroute-duplicate-boundary';
    const body = buildMultipartBody({
      boundary,
      file: {
        filename: 'fedex-combined-manifest.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildFedExManifestBuffer()
      }
    });

    const response = await fetch(`${server.baseUrl}/routes/upload-manifest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(
      payload.error,
      'Route 810 for 2026-04-13 already exists and has already started. Open the existing route below instead of uploading the same manifest again.'
    );
  } finally {
    await server.close();
  }
});

test('POST /routes/upload-manifest replaces an existing not-yet-run route for the same work area and date', async () => {
  let deletedRouteId = null;
  let insertedRoutePayload;

  const supabase = new MockSupabase((query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [{ id: 'driver-1', name: 'Luis Jimenez' }],
        error: null
      };
    }

    if (query.table === 'vehicles' && query.operation === 'select') {
      return {
        data: [{ id: 'vehicle-1', name: '402984' }],
        error: null
      };
    }

    if (query.table === 'location_corrections' && query.operation === 'select') {
      return {
        data: [],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: {
          id: 'route-stale',
          status: 'pending',
          completed_stops: 0,
          completed_at: null
        },
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'delete') {
      deletedRouteId = query.filters.find((filter) => filter.column === 'id')?.value || null;
      return {
        data: null,
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'insert') {
      insertedRoutePayload = query.payload;
      return {
        data: { id: 'route-fresh' },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'insert') {
      return {
        data: query.payload.map((stop, index) => ({
          id: `stop-${index + 1}`,
          sequence_order: stop.sequence_order
        })),
        error: null
      };
    }

    if (query.table === 'packages' && query.operation === 'insert') {
      return {
        data: null,
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const server = await startTestServer(supabase);

  try {
    const managerToken = jwt.sign(
      { account_id: 'acct-1', role: 'manager' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const boundary = 'readyroute-replace-boundary';
    const body = buildMultipartBody({
      boundary,
      file: {
        filename: 'fedex-combined-manifest.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildFedExManifestBuffer()
      }
    });

    const response = await fetch(`${server.baseUrl}/routes/upload-manifest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    assert.equal(response.status, 201);
    assert.equal(deletedRouteId, 'route-stale');
    assert.equal(insertedRoutePayload.work_area_name, '810');
    assert.equal(insertedRoutePayload.total_stops, 2);
  } finally {
    await server.close();
  }
});

test('PATCH /routes/stops/:stop_id/complete saves pickup statuses directly', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      if (query.filters.some((filter) => filter.column === 'routes.driver_id')) {
        return {
          data: {
            id: 'stop-9',
            route_id: 'route-1',
            sequence_order: 9,
            address: '900 Main St',
            status: 'pending',
            completed_at: null,
            routes: {
              id: 'route-1',
              driver_id: 'driver-1',
              account_id: 'acct-1',
              total_stops: 10,
              completed_stops: 4,
              status: 'in_progress'
            }
          },
          error: null
        };
      }

      return { data: null, error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      assert.equal(query.payload.status, 'delivered');
      assert.equal(query.payload.exception_code, 'P10');
      return { data: null, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      assert.equal(query.payload.completed_stops, 5);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-9/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'pickup_attempted',
        exception_code: 'P10'
      })
    });

    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }
});

test('POST /routes/stops/:stop_id/signature uploads image and saves signature metadata', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: {
          id: 'stop-1',
          route_id: 'route-1',
          sequence_order: 1,
          address: '100 Main St',
          status: 'pending',
          completed_at: null,
          routes: {
            id: 'route-1',
            driver_id: 'driver-1',
            account_id: 'acct-1',
            total_stops: 2,
            completed_stops: 0,
            status: 'pending'
          }
        },
        error: null
      };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      assert.equal(query.payload.signer_name, 'Jamie Doe');
      assert.equal(query.payload.age_confirmed, true);
      assert.match(query.payload.signature_url, /^https:\/\/cdn\/signatures\/stop-1-sig-\d+\.jpg$/);
      assert.match(query.payload.pod_signature_url, /^https:\/\/cdn\/signatures\/stop-1-sig-\d+\.jpg$/);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  supabase.storage = {
    from(bucket) {
      assert.equal(bucket, 'signatures');
      return {
        upload: async (path, buffer, options) => {
          assert.match(path, /^acct-1\/driver-1\/stop-1-sig-\d+\.jpg$/);
          assert.ok(Buffer.isBuffer(buffer));
          assert.equal(options.contentType, 'image/jpeg');
          return { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://cdn/signatures/${path.split('/').at(-1)}` }
        })
      };
    }
  };

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_base64: Buffer.from('test-image').toString('base64'),
        signer_name: 'Jamie Doe',
        age_confirmed: true
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.match(body.signature_url, /^https:\/\/cdn\/signatures\/stop-1-sig-\d+\.jpg$/);
  } finally {
    await server.close();
  }
});

test('POST /routes/stops/:stop_id/signature returns clear error when signatures bucket is missing', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'stops' && query.operation === 'select' && query.mode === 'maybeSingle') {
      return {
        data: {
          id: 'stop-1',
          route_id: 'route-1',
          sequence_order: 1,
          address: '100 Main St',
          status: 'pending',
          completed_at: null,
          routes: {
            id: 'route-1',
            driver_id: 'driver-1',
            account_id: 'acct-1',
            total_stops: 2,
            completed_stops: 0,
            status: 'pending'
          }
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  supabase.storage = {
    from(bucket) {
      assert.equal(bucket, 'signatures');
      return {
        upload: async () => ({ data: null, error: { message: 'Bucket not found' } }),
        getPublicUrl: () => ({ data: { publicUrl: null } })
      };
    }
  };

  const server = await startTestServer(supabase);

  try {
    const response = await fetch(`${server.baseUrl}/routes/stops/stop-1/signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signDriverToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_base64: Buffer.from('test-image').toString('base64'),
        signer_name: 'Jamie Doe'
      })
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Supabase Storage bucket "signatures" does not exist. Create it before uploading signatures.');
  } finally {
    await server.close();
  }
});
