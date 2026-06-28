const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExpoPushMessages,
  listManagerNotifications,
  markNotificationRead,
  notifyDriverRouteInspectionAssigned,
  notifyManagersInspectionUrgentReview,
  registerNotificationDeviceToken,
  sendExpoPushMessages,
  sendPushForNotification
} = require('./appNotifications');

function createMockSupabase(handler) {
  const calls = [];

  class MockQuery {
    constructor(table) {
      this.table = table;
      this.operation = 'select';
      this.state = {
        table,
        filters: [],
        orders: [],
        limit: null,
        payload: undefined,
        returning: null
      };
    }

    select(columns) {
      if (this.operation === 'insert' || this.operation === 'update' || this.operation === 'upsert') {
        this.state.returning = columns;
      } else {
        this.operation = 'select';
        this.state.columns = columns;
      }
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

    eq(column, value) {
      this.state.filters.push({ op: 'eq', column, value });
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
      const query = {
        table: this.table,
        operation: this.operation,
        mode,
        ...this.state
      };
      calls.push(query);
      return Promise.resolve(handler(query, calls));
    }
  }

  return {
    calls,
    from(table) {
      return new MockQuery(table);
    }
  };
}

test('notifyDriverRouteInspectionAssigned writes a driver notification for assigned route inspections', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notifications');
    assert.equal(query.operation, 'insert');
    assert.equal(query.payload.recipient_type, 'driver');
    assert.equal(query.payload.driver_id, 'driver-1');
    assert.equal(query.payload.notification_type, 'driver_route_inspection_assigned');
    assert.equal(query.payload.link_ref.route_id, 'route-1');
    assert.equal(query.payload.link_ref.vehicle_id, 'vehicle-1');
    assert.match(query.payload.body, /Route 811/);
    assert.match(query.payload.body, /204526/);

    return {
      data: {
        id: 'notification-1',
        ...query.payload
      },
      error: null
    };
  });

  const result = await notifyDriverRouteInspectionAssigned(supabase, {
    accountId: 'acct-1',
    driverId: 'driver-1',
    route: {
      id: 'route-1',
      date: '2026-06-27',
      vehicle_id: 'vehicle-1',
      work_area_name: '811'
    },
    vehicle: {
      id: 'vehicle-1',
      name: '204526'
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.notification.id, 'notification-1');
});

test('notifyManagersInspectionUrgentReview writes an urgent manager broadcast notification', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notifications');
    assert.equal(query.operation, 'insert');
    assert.equal(query.payload.recipient_type, 'manager');
    assert.equal(query.payload.manager_user_id, null);
    assert.equal(query.payload.severity, 'urgent');
    assert.equal(query.payload.notification_type, 'manager_inspection_urgent_review');
    assert.equal(query.payload.link_ref.inspection_id, 'inspection-1');
    assert.equal(query.payload.link_ref.vehicle_id, 'vehicle-1');
    assert.match(query.payload.body, /Phillip/);
    assert.match(query.payload.body, /204526/);

    return {
      data: {
        id: 'notification-2',
        ...query.payload
      },
      error: null
    };
  });

  const result = await notifyManagersInspectionUrgentReview(supabase, {
    accountId: 'acct-1',
    driverName: 'Phillip',
    inspection: {
      id: 'inspection-1',
      vehicle_id: 'vehicle-1',
      route_id: 'route-1',
      issue_count: 1,
      highest_severity: 'unsafe'
    },
    vehicle: {
      id: 'vehicle-1',
      name: '204526'
    }
  });

  assert.equal(result.error, null);
  assert.equal(result.notification.severity, 'urgent');
});

test('listManagerNotifications includes broadcasts and notifications for the current manager only', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notifications');
    assert.equal(query.operation, 'select');
    assert.deepEqual(query.filters, [
      { op: 'eq', column: 'account_id', value: 'acct-1' },
      { op: 'eq', column: 'recipient_type', value: 'manager' }
    ]);

    return {
      data: [
        { id: 'broadcast', recipient_type: 'manager', title: 'Broadcast', manager_user_id: null },
        { id: 'mine', recipient_type: 'manager', title: 'Mine', manager_user_id: 'manager-1' },
        { id: 'other', recipient_type: 'manager', title: 'Other', manager_user_id: 'manager-2' }
      ],
      error: null
    };
  });

  const result = await listManagerNotifications(supabase, {
    accountId: 'acct-1',
    managerUserId: 'manager-1'
  });

  assert.deepEqual(result.notifications.map((notification) => notification.id), ['broadcast', 'mine']);
});

test('markNotificationRead scopes driver reads to the authenticated driver', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notifications');
    assert.equal(query.operation, 'update');
    assert.equal(query.payload.status, 'read');
    assert.deepEqual(query.filters, [
      { op: 'eq', column: 'id', value: 'notification-1' },
      { op: 'eq', column: 'account_id', value: 'acct-1' },
      { op: 'eq', column: 'recipient_type', value: 'driver' },
      { op: 'eq', column: 'driver_id', value: 'driver-1' }
    ]);

    return {
      data: {
        id: 'notification-1',
        account_id: 'acct-1',
        recipient_type: 'driver',
        driver_id: 'driver-1',
        title: 'Read',
        status: 'read',
        read_at: query.payload.read_at
      },
      error: null
    };
  });

  const result = await markNotificationRead(supabase, {
    accountId: 'acct-1',
    driverId: 'driver-1',
    notificationId: 'notification-1',
    recipientType: 'driver',
    readAt: '2026-06-27T12:00:00.000Z'
  });

  assert.equal(result.error, null);
  assert.equal(result.notification.status, 'read');
});

test('markNotificationRead does not update another manager private notification', async () => {
  const supabase = createMockSupabase((query) => {
    if (query.operation === 'select') {
      return {
        data: {
          id: 'notification-private',
          manager_user_id: 'manager-other'
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const result = await markNotificationRead(supabase, {
    accountId: 'acct-1',
    managerUserId: 'manager-1',
    notificationId: 'notification-private',
    recipientType: 'manager',
    readAt: '2026-06-27T12:00:00.000Z'
  });

  assert.equal(result.error, null);
  assert.equal(result.notification, null);
  assert.equal(supabase.calls.some((query) => query.operation === 'update'), false);
});

test('registerNotificationDeviceToken inserts a new driver Expo token', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notification_device_tokens');

    if (query.operation === 'select') {
      assert.deepEqual(query.filters, [
        { op: 'eq', column: 'account_id', value: 'acct-1' },
        { op: 'eq', column: 'recipient_type', value: 'driver' },
        { op: 'eq', column: 'expo_push_token', value: 'ExponentPushToken[test-token]' },
        { op: 'eq', column: 'driver_id', value: 'driver-1' }
      ]);

      return { data: null, error: null };
    }

    if (query.operation === 'insert') {
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.recipient_type, 'driver');
      assert.equal(query.payload.driver_id, 'driver-1');
      assert.equal(query.payload.manager_user_id, null);
      assert.equal(query.payload.expo_push_token, 'ExponentPushToken[test-token]');
      assert.equal(query.payload.platform, 'ios');
      assert.equal(query.payload.status, 'active');

      return {
        data: {
          id: 'device-token-1',
          created_at: '2026-06-27T12:00:00.000Z',
          ...query.payload
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const result = await registerNotificationDeviceToken(supabase, {
    account_id: 'acct-1',
    recipient_type: 'driver',
    driver_id: 'driver-1',
    expo_push_token: 'ExponentPushToken[test-token]',
    platform: 'ios',
    registered_at: '2026-06-27T12:00:00.000Z',
    updated_at: '2026-06-27T12:00:00.000Z'
  });

  assert.equal(result.error, null);
  assert.equal(result.deviceToken.id, 'device-token-1');
});

test('registerNotificationDeviceToken refreshes an existing manager Expo token', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notification_device_tokens');

    if (query.operation === 'select' && query.mode === 'maybeSingle') {
      assert.deepEqual(query.filters, [
        { op: 'eq', column: 'account_id', value: 'acct-1' },
        { op: 'eq', column: 'recipient_type', value: 'manager' },
        { op: 'eq', column: 'expo_push_token', value: 'ExponentPushToken[test-token]' },
        { op: 'eq', column: 'manager_user_id', value: 'manager-1' }
      ]);

      return {
        data: {
          id: 'device-token-existing',
          account_id: 'acct-1',
          recipient_type: 'manager',
          manager_user_id: 'manager-1',
          expo_push_token: 'ExponentPushToken[test-token]',
          status: 'disabled'
        },
        error: null
      };
    }

    if (query.operation === 'update') {
      assert.equal(query.payload.status, 'active');
      assert.equal(query.payload.manager_user_id, 'manager-1');
      assert.equal(query.filters.find((filter) => filter.column === 'id')?.value, 'device-token-existing');

      return {
        data: {
          id: 'device-token-existing',
          created_at: '2026-06-27T12:00:00.000Z',
          ...query.payload
        },
        error: null
      };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });

  const result = await registerNotificationDeviceToken(supabase, {
    account_id: 'acct-1',
    recipient_type: 'manager',
    manager_user_id: 'manager-1',
    expo_push_token: 'ExponentPushToken[test-token]',
    platform: 'ios',
    registered_at: '2026-06-27T12:00:00.000Z',
    updated_at: '2026-06-27T12:00:00.000Z'
  });

  assert.equal(result.error, null);
  assert.equal(result.deviceToken.id, 'device-token-existing');
  assert.equal(result.deviceToken.status, 'active');
});

test('registerNotificationDeviceToken rejects invalid Expo tokens', async () => {
  const supabase = createMockSupabase(() => {
    throw new Error('No database write expected');
  });

  const result = await registerNotificationDeviceToken(supabase, {
    account_id: 'acct-1',
    recipient_type: 'manager',
    manager_user_id: 'manager-1',
    expo_push_token: 'not-a-token'
  });

  assert.equal(result.deviceToken, null);
  assert.match(result.error.message, /valid Expo push token/);
  assert.equal(supabase.calls.length, 0);
});

test('sendPushForNotification sends Expo messages to active recipient tokens when enabled', async () => {
  const supabase = createMockSupabase((query) => {
    assert.equal(query.table, 'app_notification_device_tokens');
    assert.equal(query.operation, 'select');
    assert.deepEqual(query.filters, [
      { op: 'eq', column: 'account_id', value: 'acct-1' },
      { op: 'eq', column: 'recipient_type', value: 'manager' },
      { op: 'eq', column: 'status', value: 'active' }
    ]);

    return {
      data: [
        { id: 'token-1', expo_push_token: 'ExponentPushToken[token-1]', recipient_type: 'manager' },
        { id: 'token-2', expo_push_token: 'ExpoPushToken[token-2]', recipient_type: 'manager' }
      ],
      error: null
    };
  });
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: [{ status: 'ok' }] };
      }
    };
  };

  const result = await sendPushForNotification(supabase, {
    id: 'notification-1',
    account_id: 'acct-1',
    recipient_type: 'manager',
    notification_type: 'manager_inspection_urgent_review',
    title: 'Urgent vehicle inspection review',
    body: 'Driver marked 204526 unsafe.',
    severity: 'urgent',
    link_type: 'vehicle_inspection',
    link_ref: { inspection_id: 'inspection-1' }
  }, {
    pushEnabled: true,
    fetchImpl
  });

  assert.equal(result.error, null);
  assert.equal(result.sent, 2);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://exp.host/--/api/v2/push/send');
  const messages = JSON.parse(fetchCalls[0].options.body);
  assert.equal(messages[0].priority, 'high');
  assert.equal(messages[0].data.notification_id, 'notification-1');
});

test('sendExpoPushMessages skips invalid token messages before sending', async () => {
  const messages = buildExpoPushMessages({
    id: 'notification-1',
    recipient_type: 'driver',
    notification_type: 'driver_route_inspection_assigned',
    title: 'Inspection',
    body: 'Complete inspection',
    severity: 'info'
  }, ['ExponentPushToken[valid]', 'bad-token']);

  assert.equal(messages.length, 1);

  const result = await sendExpoPushMessages(messages, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { data: [] };
      }
    })
  });

  assert.equal(result.sent, 1);
  assert.equal(result.error, null);
});
