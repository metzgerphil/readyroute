const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
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
    this.state.upsertOptions = options;
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

function signManagerToken() {
  return jwt.sign(
    {
      account_id: 'acct-1',
      manager_user_id: 'manager-1',
      manager_email: 'manager@example.com',
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
      staff_name: overrides.staff_name || 'ReadyRoute Admin',
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
  sendReadyRouteStaffInviteEmail,
  sendReadyRouteStaffPasswordResetEmail
}) {
  const app = createApp({
    supabase,
    jwtSecret: process.env.JWT_SECRET,
    now: () => new Date('2026-07-05T16:00:00.000Z'),
    enforceBilling: false,
    sendReadyRouteStaffInviteEmail,
    sendReadyRouteStaffPasswordResetEmail
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

function getPasswordVersion(hash) {
  return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
}

test('POST /staff/login returns a ReadyRoute staff token', async () => {
  const passwordHash = await bcrypt.hash('supersecure123', 10);
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true,
          created_at: '2026-07-05T15:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'update') {
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ADMIN@readyroute.org',
        password: 'supersecure123'
      })
    });
    const payload = await response.json();
    const decoded = jwt.verify(payload.token, process.env.JWT_SECRET);

    assert.equal(response.status, 200);
    assert.equal(decoded.role, 'readyroute_staff');
    assert.equal(decoded.staff_role, 'owner');
    assert.equal(payload.user.email, 'admin@readyroute.org');
  } finally {
    await server.close();
  }
});

test('POST /staff/change-password updates the signed-in staff password', async () => {
  let passwordHash = await bcrypt.hash('oldsecure123', 10);
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true,
          created_at: '2026-07-05T15:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'update') {
      assert.equal(query.payload.updated_at, '2026-07-05T16:00:00.000Z');
      passwordHash = query.payload.password_hash;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signStaffToken()}`
      },
      body: JSON.stringify({
        current_password: 'oldsecure123',
        new_password: 'newsecure456'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.message, 'Password updated.');
    assert.equal(await bcrypt.compare('oldsecure123', passwordHash), false);
    assert.equal(await bcrypt.compare('newsecure456', passwordHash), true);
  } finally {
    await server.close();
  }
});

test('POST /staff/change-password rejects an incorrect current password', async () => {
  const passwordHash = await bcrypt.hash('oldsecure123', 10);
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'update') {
      throw new Error('Password should not be updated');
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signStaffToken()}`
      },
      body: JSON.stringify({
        current_password: 'wrong-password',
        new_password: 'newsecure456'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, 'Current password is incorrect.');
  } finally {
    await server.close();
  }
});

test('POST /staff/request-password-reset sends a reset link for active staff', async () => {
  const passwordHash = await bcrypt.hash('oldsecure123', 10);
  const sentEmails = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true
        },
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({
    supabase,
    sendReadyRouteStaffPasswordResetEmail: async (payload) => {
      sentEmails.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/staff/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ADMIN@readyroute.org' })
    });
    const payload = await response.json();
    const resetUrl = new URL(sentEmails[0].resetUrl);
    const token = resetUrl.searchParams.get('token');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    assert.equal(response.status, 200);
    assert.match(payload.message, /password reset email sent/i);
    assert.match(payload.reset_url, /\/readyroute\/reset-password\?token=/);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'admin@readyroute.org');
    assert.equal(decoded.purpose, 'readyroute_staff_password_reset');
    assert.equal(decoded.staff_user_id, 'staff-1');
    assert.equal(decoded.pwdv, getPasswordVersion(passwordHash));
  } finally {
    await server.close();
  }
});

test('POST /staff/reset-password updates a staff password and invalidates the old version', async () => {
  let passwordHash = await bcrypt.hash('oldsecure123', 10);
  const token = jwt.sign(
    {
      staff_user_id: 'staff-1',
      email: 'admin@readyroute.org',
      purpose: 'readyroute_staff_password_reset',
      pwdv: getPasswordVersion(passwordHash)
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return {
        data: {
          id: 'staff-1',
          email: 'admin@readyroute.org',
          full_name: 'ReadyRoute Admin',
          password_hash: passwordHash,
          role: 'owner',
          is_active: true
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'update') {
      passwordHash = query.payload.password_hash;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        password: 'newsecure456'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.message, 'Password updated. You can sign in now.');
    assert.equal(await bcrypt.compare('oldsecure123', passwordHash), false);
    assert.equal(await bcrypt.compare('newsecure456', passwordHash), true);

    const reusedResponse = await fetch(`${server.baseUrl}/staff/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        password: 'anothersecure789'
      })
    });
    const reusedPayload = await reusedResponse.json();

    assert.equal(reusedResponse.status, 400);
    assert.equal(reusedPayload.error, 'Reset link is invalid or expired.');
  } finally {
    await server.close();
  }
});

test('POST /staff/invites creates an invite and sends the invite email', async () => {
  const sentInvites = [];
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'readyroute_staff_invites' && query.operation === 'insert') {
      assert.equal(query.payload.email, 'support@readyroute.org');
      assert.equal(query.payload.role, 'support');
      assert.equal(query.payload.status, 'pending');
      assert.ok(query.payload.token_hash);

      return {
        data: {
          id: 'invite-1',
          email: query.payload.email,
          full_name: query.payload.full_name,
          role: query.payload.role,
          status: query.payload.status,
          invited_by_staff_user_id: query.payload.invited_by_staff_user_id,
          expires_at: query.payload.expires_at,
          created_at: query.payload.created_at,
          updated_at: query.payload.updated_at
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_invites' && query.operation === 'update') {
      return { data: null, error: null };
    }

    if (query.table === 'readyroute_staff_audit_log' && query.operation === 'insert') {
      assert.equal(query.payload.action, 'staff.invite_created');
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({
    supabase,
    sendReadyRouteStaffInviteEmail: async (payload) => {
      sentInvites.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-invite-1' };
    }
  });

  try {
    const response = await fetch(`${server.baseUrl}/staff/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signStaffToken({ staff_role: 'owner' })}`
      },
      body: JSON.stringify({
        email: 'SUPPORT@readyroute.org',
        full_name: 'Support Person',
        role: 'support'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.invite.email, 'support@readyroute.org');
    assert.equal(payload.invite.email_provider_id, 'email-invite-1');
    assert.equal(sentInvites.length, 1);
    assert.equal(sentInvites[0].to, 'support@readyroute.org');
    assert.match(sentInvites[0].inviteUrl, /\/readyroute\/accept-invite\?token=/);
  } finally {
    await server.close();
  }
});

test('POST /staff/invites/accept creates a staff user from an invite token', async () => {
  const inviteToken = 'opaque-invite-token';
  const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
  let inviteAccepted = false;
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_invites' && query.operation === 'select') {
      assert.equal(query.filters.find((filter) => filter.column === 'token_hash')?.value, tokenHash);
      return {
        data: {
          id: 'invite-1',
          email: 'support@readyroute.org',
          full_name: 'Support Person',
          role: 'support',
          status: 'pending',
          expires_at: '2026-07-06T16:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'select') {
      return { data: null, error: null };
    }

    if (query.table === 'readyroute_staff_users' && query.operation === 'insert') {
      assert.equal(query.payload.email, 'support@readyroute.org');
      assert.equal(query.payload.role, 'support');
      assert.ok(query.payload.password_hash);
      return {
        data: {
          id: 'staff-support',
          email: query.payload.email,
          full_name: query.payload.full_name,
          role: query.payload.role,
          is_active: true,
          invited_at: query.payload.invited_at,
          accepted_at: query.payload.accepted_at,
          created_at: query.payload.created_at,
          updated_at: query.payload.updated_at
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_invites' && query.operation === 'update') {
      inviteAccepted = true;
      assert.equal(query.payload.status, 'accepted');
      assert.equal(query.payload.accepted_by_staff_user_id, 'staff-support');
      return { data: null, error: null };
    }

    if (query.table === 'readyroute_staff_audit_log' && query.operation === 'insert') {
      assert.equal(query.payload.action, 'staff.invite_accepted');
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/invites/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: inviteToken,
        password: 'newsecure456'
      })
    });
    const payload = await response.json();
    const decoded = jwt.verify(payload.token, process.env.JWT_SECRET);

    assert.equal(response.status, 201);
    assert.equal(inviteAccepted, true);
    assert.equal(payload.user.email, 'support@readyroute.org');
    assert.equal(decoded.role, 'readyroute_staff');
    assert.equal(decoded.staff_role, 'support');
  } finally {
    await server.close();
  }
});

test('GET /staff/accounts rejects customer manager tokens', async () => {
  const supabase = new MockSupabase(() => ({ data: null, error: null }));
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/accounts`, {
      headers: {
        Authorization: `Bearer ${signManagerToken()}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.error, 'ReadyRoute staff access required');
    assert.equal(supabase.calls.length, 0);
  } finally {
    await server.close();
  }
});

test('GET /staff/accounts returns CRM account summaries for staff', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts') {
      return {
        data: [
          {
            id: 'acct-1',
            company_name: 'Bridge Transportation',
            manager_email: 'owner@example.com',
            subscription_status: 'active',
            plan: 'starter',
            vehicle_count: 12,
            stripe_customer_id: 'cus_123',
            stripe_subscription_id: 'sub_123',
            created_at: '2026-07-01T12:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'account_internal_profiles') {
      return {
        data: [
          {
            account_id: 'acct-1',
            lifecycle_status: 'onboarding',
            onboarding_stage: 'FedEx setup',
            internal_notes: 'Needs route import help.',
            updated_at: '2026-07-05T15:00:00.000Z'
          }
        ],
        error: null
      };
    }

    if (query.table === 'manager_users') {
      return { data: [{ account_id: 'acct-1', is_active: true }], error: null };
    }

    if (query.table === 'drivers') {
      return { data: [{ account_id: 'acct-1', is_active: true }, { account_id: 'acct-1', is_active: false }], error: null };
    }

    if (query.table === 'support_tickets') {
      return {
        data: [
          {
            id: 'ticket-1',
            account_id: 'acct-1',
            ticket_reference: 'RR-TEST',
            subject: 'Inspection photo missing',
            status: 'new',
            priority: 'urgent',
            created_at: '2026-07-05T16:00:00.000Z'
          }
        ],
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/accounts`, {
      headers: {
        Authorization: `Bearer ${signStaffToken({ staff_role: 'support' })}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.accounts.length, 1);
    assert.equal(payload.accounts[0].internal_profile.lifecycle_status, 'onboarding');
    assert.equal(payload.accounts[0].counts.active_managers, 1);
    assert.equal(payload.accounts[0].counts.active_drivers, 1);
    assert.equal(payload.accounts[0].counts.open_support_tickets, 1);
    assert.equal(payload.accounts[0].counts.urgent_support_tickets, 1);
  } finally {
    await server.close();
  }
});

test('GET /staff/accounts/:accountId returns detail, usage, and timeline', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'accounts') {
      return {
        data: {
          id: 'acct-1',
          company_name: 'Bridge Transportation',
          manager_email: 'owner@example.com',
          subscription_status: 'active',
          plan: 'starter',
          vehicle_count: 12,
          stripe_customer_id: 'cus_123',
          stripe_subscription_id: 'sub_123',
          created_at: '2026-07-01T12:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'account_internal_profiles') {
      return {
        data: {
          account_id: 'acct-1',
          lifecycle_status: 'active',
          onboarding_stage: 'Launched',
          internal_notes: 'Healthy account.',
          updated_at: '2026-07-05T15:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'manager_users') {
      return { data: [{ id: 'manager-1', account_id: 'acct-1', email: 'owner@example.com', is_active: true }], error: null };
    }

    if (query.table === 'drivers') {
      return { data: [{ id: 'driver-1', account_id: 'acct-1', name: 'Driver One', is_active: true }], error: null };
    }

    if (query.table === 'support_tickets') {
      return {
        data: [{ id: 'ticket-1', ticket_reference: 'RR-1', status: 'new', priority: 'normal', subject: 'Help', created_at: '2026-07-05T12:00:00.000Z' }],
        error: null
      };
    }

    if (query.table === 'account_billing_settings') {
      return { data: { account_id: 'acct-1', committed_route_count: 10, billing_rate_cents: 1500, currency: 'usd' }, error: null };
    }

    if (query.table === 'billable_route_months') {
      return { data: [{ id: 'route-month-1', route_key: '817', route_display_name: '817', status: 'pending', last_imported_at: '2026-07-04T12:00:00.000Z' }], error: null };
    }

    if (query.table === 'routes') {
      return { data: [{ id: 'route-1', work_area_name: '817', date: '2026-07-04', status: 'completed', total_stops: 120, completed_stops: 120 }], error: null };
    }

    if (query.table === 'readyroute_staff_audit_log') {
      return {
        data: [{ id: 'audit-1', action: 'account.profile_updated', account_id: 'acct-1', staff_email: 'admin@readyroute.org', metadata: {}, created_at: '2026-07-05T14:00:00.000Z' }],
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/accounts/acct-1`, {
      headers: {
        Authorization: `Bearer ${signStaffToken({ staff_role: 'support' })}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.account.id, 'acct-1');
    assert.equal(payload.billing_settings.committed_route_count, 10);
    assert.equal(payload.routes[0].id, 'route-1');
    assert.equal(payload.timeline.length > 0, true);
  } finally {
    await server.close();
  }
});

test('GET /staff/operating-costs returns a monthly ReadyRoute cost ledger', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_operating_costs') {
      assert.deepEqual(query.filters.find((filter) => filter.column === 'period_month'), {
        op: 'eq',
        column: 'period_month',
        value: '2026-07-01'
      });
      return {
        data: [
          {
            id: 'op-cost-1',
            period_month: '2026-07-01',
            category: 'ai_tools',
            vendor: 'Codex',
            amount_cents: 8500,
            billing_date: '2026-07-05',
            is_recurring: true,
            created_at: '2026-07-05T16:00:00.000Z'
          },
          {
            id: 'op-cost-2',
            period_month: '2026-07-01',
            category: 'domains',
            vendor: 'Domain registrar',
            amount_cents: 3500,
            billing_date: '2026-07-02',
            is_recurring: false,
            created_at: '2026-07-02T16:00:00.000Z'
          }
        ],
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/operating-costs?period_month=2026-07`, {
      headers: {
        Authorization: `Bearer ${signStaffToken({ staff_role: 'support' })}`
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.operating_costs.length, 2);
    assert.equal(payload.summary.total_cost_cents, 12000);
    assert.equal(payload.summary.recurring_cost_cents, 8500);
    assert.equal(payload.summary.one_time_cost_cents, 3500);
  } finally {
    await server.close();
  }
});

test('POST /staff/operating-costs saves a ReadyRoute-wide operating cost', async () => {
  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_operating_costs' && query.operation === 'insert') {
      assert.equal(query.payload.period_month, '2026-07-01');
      assert.equal(query.payload.category, 'google_cloud_run');
      assert.equal(query.payload.vendor, 'Google Cloud Run');
      assert.equal(query.payload.amount_cents, 4200);
      assert.equal(query.payload.is_recurring, true);
      return {
        data: {
          id: 'op-cost-1',
          ...query.payload,
          created_at: '2026-07-05T16:00:00.000Z'
        },
        error: null
      };
    }

    if (query.table === 'readyroute_staff_audit_log' && query.operation === 'insert') {
      assert.equal(query.payload.action, 'operating_cost.created');
      assert.equal(query.payload.target_type, 'readyroute_operating_cost');
      return { data: null, error: null };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/operating-costs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signStaffToken({ staff_role: 'owner' })}`
      },
      body: JSON.stringify({
        period_month: '2026-07',
        category: 'google_cloud_run',
        vendor: 'Google Cloud Run',
        amount_cents: 4200,
        billing_date: '2026-07-05',
        is_recurring: true,
        notes: 'Monthly backend estimate.'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.operating_cost.vendor, 'Google Cloud Run');
    assert.equal(payload.operating_cost.amount_cents, 4200);
  } finally {
    await server.close();
  }
});

test('POST /staff/bootstrap creates the first staff user when the bootstrap secret matches', async () => {
  const originalSecret = process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET;
  process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET = 'bootstrap-secret';

  const supabase = new MockSupabase((query) => {
    if (query.table === 'readyroute_staff_users' && query.operation === 'insert') {
      assert.equal(query.payload.email, 'owner@readyroute.org');
      assert.equal(query.payload.role, 'owner');
      assert.ok(query.payload.password_hash);

      return {
        data: {
          id: 'staff-owner',
          email: query.payload.email,
          full_name: query.payload.full_name,
          role: query.payload.role,
          is_active: true,
          invited_at: query.payload.invited_at,
          accepted_at: query.payload.accepted_at,
          created_at: query.payload.created_at,
          updated_at: query.payload.updated_at
        },
        error: null
      };
    }

    return { data: null, error: null };
  });
  const server = await startTestServer({ supabase });

  try {
    const response = await fetch(`${server.baseUrl}/staff/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReadyRoute-Bootstrap-Secret': 'bootstrap-secret'
      },
      body: JSON.stringify({
        email: 'owner@readyroute.org',
        full_name: 'Owner User',
        password: 'supersecure123',
        role: 'owner'
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.staff_user.email, 'owner@readyroute.org');
  } finally {
    if (originalSecret == null) {
      delete process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET;
    } else {
      process.env.READYROUTE_STAFF_BOOTSTRAP_SECRET = originalSecret;
    }
    await server.close();
  }
});
