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

  order(column, options = {}) {
    this.state.order = { column, options };
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
      manager_email: overrides.manager_email || 'manager@example.com',
      manager_name: overrides.manager_name || 'Morgan Manager',
      company_name: overrides.company_name || 'Bridge Transportation',
      primary_role: 'manager',
      role: 'manager'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function signStaffToken(overrides = {}) {
  return jwt.sign(
    {
      staff_user_id: overrides.staff_user_id || 'staff-1',
      staff_email: overrides.staff_email || 'admin@readyroute.org',
      staff_name: overrides.staff_name || 'Ready Route Admin',
      staff_role: overrides.staff_role || 'owner',
      primary_role: 'readyroute_staff',
      role: 'readyroute_staff'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function startTestServer({
  supabase,
  sendSupportTicketNotification = async () => ({ delivered: false, skipped: true })
}) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    now: () => new Date('2026-07-05T16:00:00.000Z'),
    enforceBilling: false,
    sendSupportTicketNotification
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

test('POST /support/tickets creates a contextual manager support ticket', async () => {
  let notificationTicket = null;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'support_tickets' && query.operation === 'insert') {
      return {
        data: {
          id: 'ticket-1',
          ticket_reference: query.payload.ticket_reference,
          status: query.payload.status,
          priority: query.payload.priority,
          created_at: query.payload.created_at
        },
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({
    supabase,
    sendSupportTicketNotification: async ({ ticket }) => {
      notificationTicket = ticket;
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signManagerToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'vehicle_inspection',
        urgency: 'blocking_today',
        subject: 'Inspection photo is missing',
        description: 'The manager inspection detail is not showing the driver photo.',
        phone: '555-0101',
        request_call: true,
        app_surface: 'manager_portal',
        page_url: '/vehicles',
        context: {
          path: '/vehicles',
          vehicle_id: 'vehicle-1'
        }
      })
    });

    const payload = await response.json();
    const insertCall = supabase.calls.find((call) => call.table === 'support_tickets' && call.operation === 'insert');

    assert.equal(response.status, 201);
    assert.equal(payload.ticket.status, 'new');
    assert.equal(payload.ticket.priority, 'urgent');
    assert.equal(payload.notification.delivered, true);
    assert.equal(insertCall.payload.account_id, 'acct-1');
    assert.equal(insertCall.payload.manager_user_id, 'manager-1');
    assert.equal(insertCall.payload.requester_type, 'manager');
    assert.equal(insertCall.payload.requester_name, 'Morgan Manager');
    assert.equal(insertCall.payload.requester_email, 'manager@example.com');
    assert.equal(insertCall.payload.company_name, 'Bridge Transportation');
    assert.equal(insertCall.payload.category, 'vehicle_inspection');
    assert.equal(insertCall.payload.request_call, true);
    assert.deepEqual(insertCall.payload.context, { path: '/vehicles', vehicle_id: 'vehicle-1' });
    assert.equal(notificationTicket.id, 'ticket-1');
  } finally {
    await server.close();
  }
});

test('POST /support/tickets validates public support request basics', async () => {
  const supabase = new MockSupabase(() => ({ data: null, error: null }));
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Pat Dispatcher',
        email: 'not-an-email',
        description: 'Need help with login.'
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, 'A valid email is required.');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('POST /support/tickets rejects invalid bearer tokens', async () => {
  const supabase = new MockSupabase(() => ({ data: null, error: null }));
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Pat Dispatcher',
        email: 'pat@example.com',
        description: 'Need help with route upload.'
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, 'Invalid or expired token');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('GET /support/tickets lists support tickets for ReadyRoute staff', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'support_tickets' && query.operation === 'select') {
      assert.deepEqual(query.filters, [{ op: 'eq', column: 'status', value: 'new' }]);
      assert.deepEqual(query.order, { column: 'created_at', options: { ascending: false } });
      assert.equal(query.limit, 25);

      return {
        data: [
          {
            id: 'ticket-1',
            ticket_reference: 'RR-TEST-0001',
            subject: 'Cannot see inspection photo',
            status: 'new',
            priority: 'urgent',
            requester_email: 'manager@example.com',
            created_at: '2026-07-05T16:00:00.000Z'
          }
        ],
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({
    supabase
  });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets?status=new&limit=25`, {
      headers: {
        Authorization: `Bearer ${signStaffToken()}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.tickets.length, 1);
    assert.equal(payload.tickets[0].ticket_reference, 'RR-TEST-0001');
  } finally {
    await server.close();
  }
});

test('GET /support/tickets rejects customer manager tokens', async () => {
  const supabase = new MockSupabase(() => ({ data: null, error: null }));
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets`, {
      headers: {
        Authorization: `Bearer ${signManagerToken({ manager_email: 'manager@example.com' })}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.error, 'ReadyRoute staff access required.');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('PATCH /support/tickets/:ticketId updates support ticket workflow fields', async () => {
  let updateCall = null;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'support_tickets' && query.operation === 'update') {
      updateCall = query;

      return {
        data: {
          id: 'ticket-1',
          ticket_reference: 'RR-TEST-0001',
          status: query.payload.status,
          priority: query.payload.priority,
          internal_notes: query.payload.internal_notes,
          resolved_at: query.payload.resolved_at,
          updated_at: query.payload.updated_at
        },
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({
    supabase
  });

  try {
    const response = await fetch(`${server.baseUrl}/support/tickets/ticket-1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${signStaffToken({ staff_role: 'support' })}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'resolved',
        priority: 'high',
        internal_notes: 'Confirmed the manager can view the uploaded photo now.'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ticket.status, 'resolved');
    assert.equal(payload.ticket.priority, 'high');
    assert.equal(updateCall.payload.updated_at, '2026-07-05T16:00:00.000Z');
    assert.equal(updateCall.payload.resolved_at, '2026-07-05T16:00:00.000Z');
    assert.equal(updateCall.payload.internal_notes, 'Confirmed the manager can view the uploaded photo now.');
    assert.deepEqual(updateCall.filters, [{ op: 'eq', column: 'id', value: 'ticket-1' }]);
  } finally {
    await server.close();
  }
});
