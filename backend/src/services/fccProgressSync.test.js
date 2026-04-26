const test = require('node:test');
const assert = require('node:assert/strict');

const { createFccProgressSyncService } = require('./fccProgressSync');

class MockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
      payload: undefined,
      columns: null
    };
  }

  select(columns) {
    if (this.operation === 'insert' || this.operation === 'update') {
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

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.state.filters.push({ op: 'eq', column, value });
    return this;
  }

  is(column, value) {
    this.state.filters.push({ op: 'is', column, value });
    return this;
  }

  order() {
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

test('applyRouteProgress marks matched FCC green rows complete on dispatched routes', async () => {
  const route = {
    id: 'route-1',
    account_id: 'acct-1',
    work_area_name: '823',
    date: '2026-04-24',
    status: 'pending',
    total_stops: 3,
    completed_stops: 0,
    dispatch_state: 'dispatched',
    driver_id: null,
    completed_at: null
  };
  const stops = [
    { id: 'stop-1', route_id: 'route-1', sequence_order: 1, sid: '1001', address: '818 N JUNIPER ST', address_line2: 'APT 4', status: 'pending', completed_at: null, scanned_at: null },
    { id: 'stop-2', route_id: 'route-1', sequence_order: 2, sid: '1002', address: '300 E MISSION AVE', address_line2: 'APT 2', status: 'pending', completed_at: null, scanned_at: null },
    { id: 'stop-3', route_id: 'route-1', sequence_order: 3, sid: '1008', address: '359 E MISSION AVE', address_line2: null, status: 'pending', completed_at: null, scanned_at: null }
  ];
  const routeEvents = [];

  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return { data: [route], error: null };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return { data: stops, error: null };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return { data: [], error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      const stopId = query.filters.find((filter) => filter.column === 'id')?.value;
      const stop = stops.find((entry) => entry.id === stopId);
      Object.assign(stop, query.payload);
      return { data: stop, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      Object.assign(route, query.payload);
      return { data: route, error: null };
    }

    if (query.table === 'route_sync_events' && query.operation === 'insert') {
      routeEvents.push(query.payload);
      return { data: query.payload, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFccProgressSyncService({
    supabase,
    now: () => new Date('2026-04-24T18:45:00.000Z')
  });

  const result = await service.applyRouteProgress({
    accountId: 'acct-1',
    workDate: '2026-04-24',
    progressSnapshots: [
      {
        work_area_name: 'OCEA - 823 RAMIREZCASTELLANOS, BRAYANT - Available',
        record_count: 3,
        delivered_packages: 146,
        rows: [
          { sid: '1001', stop_number: 1, address: '818 N JUNIPER ST', address_line2: 'APT 4', is_completed: false },
          { sid: 'FCC-DIFFERENT-1002', stop_number: 2, address: '300 E MISSION AVE', address_line2: 'APT 2', is_completed: true },
          { sid: '1008', stop_number: 3, address: '359 E MISSION AVE', is_completed: false }
        ]
      }
    ]
  });

  assert.equal(result.route_count, 1);
  assert.equal(result.completed_updates, 1);
  assert.equal(result.has_changes, true);
  assert.equal(stops[1].status, 'delivered');
  assert.ok(stops[1].completed_at);
  assert.equal(route.completed_stops, 1);
  assert.equal(route.status, 'in_progress');
  assert.equal(routeEvents.length, 1);
  assert.equal(routeEvents[0].event_type, 'fcc_progress_synced');
});

test('applyRouteProgress stores FCC exception scans with code and timestamp', async () => {
  const route = {
    id: 'route-823',
    account_id: 'acct-1',
    work_area_name: '823',
    date: '2026-04-24',
    status: 'pending',
    total_stops: 2,
    completed_stops: 0,
    dispatch_state: 'dispatched',
    driver_id: 'driver-1',
    completed_at: null
  };
  const stops = [
    { id: 'stop-1', route_id: 'route-823', sequence_order: 1, sid: '1001', address: '818 N JUNIPER ST', address_line2: null, status: 'pending', exception_code: null, completed_at: null, scanned_at: null },
    { id: 'stop-2', route_id: 'route-823', sequence_order: 2, sid: '1037', address: '508 E MISSION AVE', address_line2: 'APT 101', status: 'pending', exception_code: null, completed_at: null, scanned_at: null }
  ];
  const routeEvents = [];

  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return { data: [route], error: null };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return { data: stops, error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      const stopId = query.filters.find((filter) => filter.column === 'id')?.value;
      const stop = stops.find((entry) => entry.id === stopId);
      Object.assign(stop, query.payload);
      return { data: stop, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      Object.assign(route, query.payload);
      return { data: route, error: null };
    }

    if (query.table === 'route_sync_events' && query.operation === 'insert') {
      routeEvents.push(query.payload);
      return { data: query.payload, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFccProgressSyncService({
    supabase,
    now: () => new Date('2026-04-24T18:45:00.000Z')
  });

  const result = await service.applyRouteProgress({
    accountId: 'acct-1',
    workDate: '2026-04-24',
    progressSnapshots: [
      {
        work_area_name: 'OCEA - 823 RAMIREZCASTELLANOS, BRAYANT - Available',
        record_count: 2,
        rows: [
          { sid: '1001', stop_number: 1, address: '818 N JUNIPER ST', is_completed: false },
          {
            sid: '1037',
            stop_number: 2,
            address: '508 E MISSION AVE',
            address_line2: 'APT 101',
            is_completed: false,
            is_exception: true,
            exception_code: '7',
            scanned_at: '2026-04-24T17:28:00.000Z'
          }
        ]
      }
    ]
  });

  assert.equal(result.completed_updates, 1);
  assert.equal(result.routes[0].completed_updates, 0);
  assert.equal(result.routes[0].exception_updates, 1);
  assert.equal(result.has_changes, true);
  assert.equal(stops[1].status, 'attempted');
  assert.equal(stops[1].exception_code, '07');
  assert.equal(stops[1].scanned_at, '2026-04-24T17:28:00.000Z');
  assert.equal(stops[1].completed_at, '2026-04-24T17:28:00.000Z');
  assert.equal(route.completed_stops, 1);
  assert.equal(route.status, 'in_progress');
  assert.equal(routeEvents[0].details.exception_updates, 1);
});

test('applyRouteProgress assigns an unassigned route to the FCC driver when names match', async () => {
  const route = {
    id: 'route-823',
    account_id: 'acct-1',
    work_area_name: '823',
    date: '2026-04-24',
    status: 'pending',
    total_stops: 1,
    completed_stops: 0,
    dispatch_state: 'dispatched',
    driver_id: null,
    completed_at: null
  };
  const stops = [
    { id: 'stop-1', route_id: 'route-823', sequence_order: 1, sid: '1001', address: '818 N JUNIPER ST', address_line2: null, status: 'pending', completed_at: null, scanned_at: null }
  ];
  const routeEvents = [];

  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return { data: [route], error: null };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return { data: stops, error: null };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return {
        data: [
          { id: 'driver-823', name: 'Brayant Ramirezcastellanos' },
          { id: 'driver-other', name: 'Miguel Araujo Garcia' }
        ],
        error: null
      };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      Object.assign(route, query.payload);
      return { data: route, error: null };
    }

    if (query.table === 'route_sync_events' && query.operation === 'insert') {
      routeEvents.push(query.payload);
      return { data: query.payload, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFccProgressSyncService({
    supabase,
    now: () => new Date('2026-04-24T18:45:00.000Z')
  });

  const result = await service.applyRouteProgress({
    accountId: 'acct-1',
    workDate: '2026-04-24',
    progressSnapshots: [
      {
        work_area_name: 'OCEA - 823 RAMIREZCASTELLANOS, BRAYANT - Available',
        record_count: 1,
        rows: [{ sid: '1001', stop_number: 1, address: '818 N JUNIPER ST', is_completed: false }]
      }
    ]
  });

  assert.equal(result.completed_updates, 0);
  assert.equal(result.driver_assignments, 1);
  assert.equal(result.has_changes, true);
  assert.equal(result.routes[0].status, 'updated');
  assert.equal(result.routes[0].matched_driver_name, 'Brayant Ramirezcastellanos');
  assert.equal(route.driver_id, 'driver-823');
  assert.equal(routeEvents.length, 1);
  assert.equal(routeEvents[0].details.matched_driver_name, 'Brayant Ramirezcastellanos');
});

test('applyRouteProgress reconciles staged route rows without marking stops worked before dispatch', async () => {
  const route = {
    id: 'route-1',
    account_id: 'acct-1',
    work_area_name: '823',
    date: '2026-04-24',
    status: 'pending',
    total_stops: 3,
    manifest_stop_count: 3,
    manifest_package_count: 5,
    completed_stops: 0,
    dispatch_state: 'staged',
    completed_at: null,
    driver_id: null
  };
  const stops = [
    { id: 'stop-1', route_id: 'route-1', sequence_order: 1, sid: '1001', address: '818 N JUNIPER ST', address_line2: null, status: 'pending', exception_code: null, completed_at: null, scanned_at: null },
    { id: 'stop-2', route_id: 'route-1', sequence_order: 2, sid: '1002', address: '300 E MISSION AVE', address_line2: null, status: 'pending', exception_code: null, completed_at: null, scanned_at: null },
    { id: 'stop-3', route_id: 'route-1', sequence_order: 3, sid: '1003', address: 'OLD EXTRA STOP', address_line2: null, status: 'pending', exception_code: null, completed_at: null, scanned_at: null }
  ];
  const packages = [
    { id: 'pkg-1', stop_id: 'stop-1', tracking_number: 'old-1' },
    { id: 'pkg-2', stop_id: 'stop-2', tracking_number: 'old-2' },
    { id: 'pkg-3', stop_id: 'stop-3', tracking_number: 'old-3' }
  ];
  const stopUpdates = [];
  const routeUpdates = [];
  const routeEvents = [];

  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return { data: [route], error: null };
    }

    if (query.table === 'stops' && query.operation === 'select') {
      return { data: stops, error: null };
    }

    if (query.table === 'stops' && query.operation === 'update') {
      const stopId = query.filters.find((filter) => filter.column === 'id')?.value;
      const stop = stops.find((entry) => entry.id === stopId);
      Object.assign(stop, query.payload);
      stopUpdates.push(query.payload);
      return { data: query.payload, error: null };
    }

    if (query.table === 'stops' && query.operation === 'delete') {
      const stopId = query.filters.find((filter) => filter.column === 'id')?.value;
      const index = stops.findIndex((entry) => entry.id === stopId);
      if (index >= 0) {
        stops.splice(index, 1);
      }
      return { data: null, error: null };
    }

    if (query.table === 'packages' && query.operation === 'delete') {
      const stopId = query.filters.find((filter) => filter.column === 'stop_id')?.value;
      for (let index = packages.length - 1; index >= 0; index -= 1) {
        if (packages[index].stop_id === stopId) {
          packages.splice(index, 1);
        }
      }
      return { data: null, error: null };
    }

    if (query.table === 'packages' && query.operation === 'insert') {
      const payload = Array.isArray(query.payload) ? query.payload : [query.payload];
      packages.push(...payload);
      return { data: payload, error: null };
    }

    if (query.table === 'routes' && query.operation === 'update') {
      Object.assign(route, query.payload);
      routeUpdates.push(query.payload);
      return { data: query.payload, error: null };
    }

    if (query.table === 'drivers' && query.operation === 'select') {
      return { data: [], error: null };
    }

    if (query.table === 'route_sync_events' && query.operation === 'insert') {
      routeEvents.push(query.payload);
      return { data: query.payload, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFccProgressSyncService({ supabase });
  const result = await service.applyRouteProgress({
    accountId: 'acct-1',
    workDate: '2026-04-24',
    progressSnapshots: [
      {
        work_area_name: '823 BRIDGE 12',
        rows: [
          { sid: '1001', stop_number: 1, address: '818 N JUNIPER ST', package_count: 2, is_completed: true },
          { sid: '1002', stop_number: 2, address: '300 E MISSION AVE', package_count: 1, is_exception: true, exception_code: '7' }
        ]
      }
    ]
  });

  assert.equal(result.completed_updates, 0);
  assert.equal(result.has_changes, true);
  assert.equal(result.routes[0].route_id, 'route-1');
  assert.equal(result.routes[0].status, 'staged_reconciled');
  assert.equal(result.routes[0].reconciled_stop_count, 2);
  assert.equal(result.routes[0].reconciled_package_count, 3);
  assert.equal(result.routes[0].removed_stop_count, 1);
  assert.equal(stops.length, 2);
  assert.equal(stops[0].status, 'pending');
  assert.equal(stops[0].completed_at, null);
  assert.equal(stops[1].status, 'pending');
  assert.equal(stops[1].exception_code, null);
  assert.equal(route.total_stops, 2);
  assert.equal(route.manifest_package_count, 3);
  assert.equal(route.completed_stops, 0);
  assert.equal(routeUpdates.length, 1);
  assert.equal(routeEvents[0].event_type, 'fcc_progress_synced');
  assert.equal(packages.filter((entry) => entry.stop_id === 'stop-1').length, 2);
  assert.equal(packages.filter((entry) => entry.stop_id === 'stop-3').length, 0);
});

test('applyRouteProgress reports route_not_found when FCC progress has no matching route', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'routes' && query.operation === 'select') {
      return {
        data: [
          {
            id: 'route-1',
            account_id: 'acct-1',
            work_area_name: '823',
            date: '2026-04-24',
            status: 'pending',
            total_stops: 3,
            completed_stops: 0,
            dispatch_state: 'staged',
            completed_at: null
          }
        ],
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}:${query.mode}`);
  });

  const service = createFccProgressSyncService({ supabase });
  const result = await service.applyRouteProgress({
    accountId: 'acct-1',
    workDate: '2026-04-24',
    progressSnapshots: [
      {
        work_area_name: 'OCEA - 999 BRIDGE 12',
        rows: [{ sid: '1001', is_completed: true }]
      }
    ]
  });

  assert.equal(result.completed_updates, 0);
  assert.equal(result.routes[0].route_id, null);
  assert.equal(result.routes[0].status, 'route_not_found');
});
