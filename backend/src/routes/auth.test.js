const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createApp } = require('../app');

function createSupabaseStub(initialAccount = {}) {
  const account = {
    id: initialAccount.id || 'account-1',
    manager_email: initialAccount.manager_email || 'phillovesjoy@gmail.com',
    manager_password_hash: initialAccount.manager_password_hash || null,
    company_name: initialAccount.company_name || 'Bridge Transportation'
  };
  const accounts = initialAccount.accounts || [account];
  const managerUsers = initialAccount.manager_users || (initialAccount.manager_user ? [initialAccount.manager_user] : []);
  const managerUser = initialAccount.manager_user || managerUsers[0] || null;
  const driver = initialAccount.driver || null;
  const drivers = initialAccount.drivers || (driver ? [driver] : []);

  return {
    account,
    managerUser,
    driver,
    from(table) {
      assert.ok(['accounts', 'drivers', 'manager_users'].includes(table));

      const query = {
        select() {
          return this;
        },
        eq(column, value) {
          this[column] = value;
          return this;
        },
        ilike(column, value) {
          this[`ilike_${column}`] = value;
          return this;
        },
        limit() {
          return this;
        },
        order() {
          return this;
        },
        then(resolve, reject) {
          if (table === 'drivers') {
            const rows = drivers.filter((candidate) => (
              (!this.email || this.email === candidate.email) &&
              (!this.ilike_username || String(this.ilike_username).toLowerCase() === String(candidate.username || '').toLowerCase()) &&
              (!this.id || this.id === candidate.id)
            )).map((candidate) => ({ ...candidate }));

            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }

          if (table !== 'manager_users') {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }

          const rows = managerUsers
            .filter((row) => (
              (!this.email || this.email === row.email) &&
              (!this.id || this.id === row.id) &&
              (!this.account_id || this.account_id === row.account_id)
            ))
            .sort((left, right) => String(left.account_id).localeCompare(String(right.account_id)));

          return Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(resolve, reject);
        },
        async maybeSingle() {
          if (table === 'drivers') {
            const matchingDriver = drivers.find((candidate) => (
              (!this.email || this.email === candidate.email) &&
              (!this.id || this.id === candidate.id)
            ));
            if (!matchingDriver) {
              return { data: null, error: null };
            }
            return { data: { ...matchingDriver }, error: null };
          }

          if (table === 'manager_users') {
            const row = managerUsers.find((candidate) => (
              (!this.email || this.email === candidate.email) &&
              (!this.id || this.id === candidate.id) &&
              (!this.account_id || this.account_id === candidate.account_id)
            ));

            if (!row) {
              return { data: null, error: null };
            }

            return { data: { ...row }, error: null };
          }

          const matchingAccount = accounts.find((candidate) => (
            (!this.manager_email || this.manager_email === candidate.manager_email) &&
            (!this.id || this.id === candidate.id)
          ));
          if (!matchingAccount) {
            return { data: null, error: null };
          }
          return { data: { ...matchingAccount }, error: null };
        },
        update(payload) {
          const filters = {};
          return {
            eq(column, value) {
              filters[column] = value;
              return this;
            },
            then(resolve, reject) {
              if (table === 'manager_users') {
                const row = managerUsers.find((candidate) => (
                  (!filters.id || filters.id === candidate.id)
                  && (!filters.account_id || filters.account_id === candidate.account_id)
                ));
                if (row) Object.assign(row, payload);
              } else if (table === 'drivers') {
                const row = drivers.find((candidate) => (
                  (!filters.id || filters.id === candidate.id)
                  && (!filters.account_id || filters.account_id === candidate.account_id)
                ));
                if (row) Object.assign(row, payload);
              } else if (!filters.id || filters.id === account.id) {
                Object.assign(account, payload);
              }
              return Promise.resolve({ error: null }).then(resolve, reject);
            }
          };
        }
      };

      return query;
    }
  };
}

class AuthRouteMockQueryBuilder {
  constructor(supabase, table) {
    this.supabase = supabase;
    this.table = table;
    this.operation = 'select';
    this.state = {
      table,
      filters: [],
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

class AuthRouteMockSupabase {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }

  from(table) {
    return new AuthRouteMockQueryBuilder(this, table);
  }

  execute(query) {
    this.calls.push(query);
    return this.handler(query, this.calls);
  }
}

test('manager login supports manager_users records', async () => {
  const hash = await bcrypt.hash('VladPass!2026', 10);
  const supabase = createSupabaseStub({
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_user: {
      id: 'manager-user-1',
      account_id: 'account-1',
      email: 'vlad@example.com',
      password_hash: hash,
      full_name: 'Vlad Fedoryshyn',
      is_active: true
    }
  });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const response = await request(app)
    .post('/auth/manager/login')
    .send({ email: 'vlad@example.com', password: 'VladPass!2026' });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.account_id, 'account-1');
  assert.equal(response.body.user.manager_user_id, 'manager-user-1');
  assert.equal(response.body.user.email, 'vlad@example.com');
});

test('manager login authenticates the matching CSA instead of the first email match', async () => {
  const firstHash = await bcrypt.hash('FirstPass!2026', 10);
  const secondHash = await bcrypt.hash('SecondPass!2026', 10);
  const supabase = createSupabaseStub({
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_users: [
      {
        id: 'manager-user-1',
        account_id: 'account-1',
        email: 'vlad@example.com',
        password_hash: firstHash,
        full_name: 'Vlad Fedoryshyn',
        is_active: true
      },
      {
        id: 'manager-user-2',
        account_id: 'account-2',
        email: 'vlad@example.com',
        password_hash: secondHash,
        full_name: 'Vlad Fedoryshyn',
        is_active: true
      }
    ]
  });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const response = await request(app)
    .post('/auth/manager/login')
    .send({ email: 'vlad@example.com', password: 'SecondPass!2026' });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.account_id, 'account-2');
  assert.equal(response.body.user.manager_user_id, 'manager-user-2');

  const payload = jwt.verify(response.body.token, 'test-secret');
  assert.equal(payload.account_id, 'account-2');
  assert.equal(payload.manager_user_id, 'manager-user-2');
});

test('mobile login returns both portal tokens for a linked manager-driver identity', async () => {
  const secret = '2468';
  const driverPinHash = await bcrypt.hash(secret, 10);
  const managerPasswordHash = await bcrypt.hash(secret, 10);
  const supabase = createSupabaseStub({
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_user: {
      id: 'manager-user-1',
      account_id: 'account-1',
      email: 'vlad@example.com',
      password_hash: managerPasswordHash,
      full_name: 'Vlad Fedoryshyn',
      is_active: true
    },
    driver: {
      id: 'driver-1',
      account_id: 'account-1',
      name: 'Vlad Fedoryshyn',
      email: 'vlad@example.com',
      pin: driverPinHash,
      is_active: true
    }
  });
  const authorizeDriverDevice = async (_supabase, request) => ({
    id: 'device-session-1',
    device_hash: `hash:${request.deviceId}`
  });
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    requireDriverDeviceId: true,
    authorizeDriverDevice
  });

  const response = await request(app)
    .post('/auth/mobile/login')
    .send({
      email: 'vlad@example.com',
      secret,
      device_id: '12345678-1234-1234-1234-123456789012',
      device_name: 'ios ReadyRoute device'
    });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.portals, ['driver', 'manager']);

  const driverPayload = jwt.verify(response.body.driver_token, 'test-secret');
  const managerPayload = jwt.verify(response.body.manager_token, 'test-secret');

  assert.equal(driverPayload.driver_id, 'driver-1');
  assert.equal(driverPayload.role, 'driver');
  assert.equal(driverPayload.email, 'vlad@example.com');
  assert.equal(driverPayload.device_session_id, 'device-session-1');
  assert.equal(managerPayload.manager_user_id, 'manager-user-1');
  assert.equal(managerPayload.role, 'manager');
});

test('mobile login selects the credential-matched company when one email has multiple driver memberships', async () => {
  const bridgeSecret = 'BridgeDriver!2026';
  const supabase = createSupabaseStub({
    accounts: [
      { id: 'account-smoke', company_name: 'Smoke Test ReadyRoute Account' },
      { id: 'account-bridge', company_name: 'Bridge Transportation' }
    ],
    manager_users: [{
      id: 'manager-bridge',
      account_id: 'account-bridge',
      email: 'phillovesjoy@gmail.com',
      password_hash: await bcrypt.hash(bridgeSecret, 10),
      full_name: 'Phil Metzger',
      is_active: true
    }],
    drivers: [
      {
        id: 'driver-smoke',
        account_id: 'account-smoke',
        name: 'Smoke Test Driver',
        email: 'phillovesjoy@gmail.com',
        password_hash: await bcrypt.hash('DifferentSmokePassword!2026', 10),
        is_active: true
      },
      {
        id: 'driver-bridge',
        account_id: 'account-bridge',
        name: 'Phil Metzger',
        email: 'phillovesjoy@gmail.com',
        password_hash: await bcrypt.hash(bridgeSecret, 10),
        is_active: true
      }
    ]
  });
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    requireDriverDeviceId: true,
    authorizeDriverDevice: async () => ({
      id: 'device-session-bridge',
      device_hash: 'device-hash-bridge'
    })
  });

  const response = await request(app)
    .post('/auth/mobile/login')
    .send({
      email: 'phillovesjoy@gmail.com',
      secret: bridgeSecret,
      device_id: '12345678-1234-1234-1234-123456789012'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.account_id, 'account-bridge');
  assert.equal(response.body.user.company_name, 'Bridge Transportation');
  assert.equal(jwt.verify(response.body.driver_token, 'test-secret').driver_id, 'driver-bridge');
  assert.equal(jwt.verify(response.body.manager_token, 'test-secret').account_id, 'account-bridge');
});

test('legacy driver login accepts an established password as well as a four-digit PIN', async () => {
  const password = 'SecureDriverPassword!2026';
  const passwordHash = await bcrypt.hash(password, 10);
  const supabase = createSupabaseStub({
    driver: {
      id: 'driver-password-1',
      account_id: 'account-1',
      name: 'Password Driver',
      email: 'password-driver@example.com',
      password_hash: passwordHash,
      is_active: true
    }
  });
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    requireDriverDeviceId: true,
    authorizeDriverDevice: async () => ({
      id: 'device-session-password-1',
      device_hash: 'device-hash-password-1'
    })
  });

  const response = await request(app)
    .post('/auth/driver/login')
    .send({
      email: 'password-driver@example.com',
      password,
      device_id: '12345678-1234-1234-1234-123456789012'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.driver_id, 'driver-password-1');
  assert.equal(jwt.verify(response.body.token, 'test-secret').device_session_id, 'device-session-password-1');
});

test('driver can replace the current credential with a personal four-digit PIN', async () => {
  const driverState = {
    id: 'driver-pin-change-1',
    account_id: 'account-1',
    name: 'PIN Change Driver',
    email: 'pin-change@example.com',
    pin: await bcrypt.hash('2468', 10),
    password_hash: null,
    is_active: true
  };
  const supabase = createSupabaseStub({ driver: driverState });
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    requireDriverDeviceId: true,
    authorizeDriverDevice: async () => ({
      id: 'device-session-pin-change-1',
      device_hash: 'device-hash-pin-change-1'
    })
  });

  const login = await request(app)
    .post('/auth/driver/login')
    .send({
      email: driverState.email,
      pin: '2468',
      device_id: '12345678-1234-1234-1234-123456789012'
    });
  assert.equal(login.status, 200);

  const change = await request(app)
    .post('/auth/driver/change-pin')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ current_credential: '2468', new_pin: '8642' });
  assert.equal(change.status, 200);
  assert.equal(driverState.password_hash, null);
  assert.equal(await bcrypt.compare('8642', driverState.pin), true);

  const oldPinLogin = await request(app)
    .post('/auth/driver/login')
    .send({
      email: driverState.email,
      pin: '2468',
      device_id: '12345678-1234-1234-1234-123456789012'
    });
  assert.equal(oldPinLogin.status, 401);

  const newPinLogin = await request(app)
    .post('/auth/driver/login')
    .send({
      email: driverState.email,
      pin: '8642',
      device_id: '12345678-1234-1234-1234-123456789012'
    });
  assert.equal(newPinLogin.status, 200);
});

test('driver invitation lets every company driver choose a four-digit PIN', async () => {
  const invitedAt = new Date().toISOString();
  const driverState = {
    id: 'driver-pin-choice-1',
    account_id: 'account-1',
    name: 'PIN Choice Driver',
    email: 'pin-choice@example.com',
    password_hash: null,
    invited_at: invitedAt,
    invite_accepted_at: null,
    is_active: true
  };
  const supabase = new AuthRouteMockSupabase(async (query) => {
    if (query.table === 'drivers' && query.operation === 'select') {
      return { data: { ...driverState }, error: null };
    }

    if (query.table === 'drivers' && query.operation === 'update') {
      assert.equal(await bcrypt.compare('2468', query.payload.password_hash), true);
      assert.equal(query.payload.pin, query.payload.password_hash);
      Object.assign(driverState, query.payload);
      return { data: null, error: null };
    }

    throw new Error(`Unexpected query ${query.table}:${query.operation}`);
  });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });
  const token = jwt.sign({
    purpose: 'driver_invite',
    driver_id: driverState.id,
    account_id: driverState.account_id,
    email: driverState.email,
    invited_at: invitedAt
  }, 'test-secret', { expiresIn: '7d' });

  const invalidResponse = await request(app)
    .post('/auth/driver/accept-invite')
    .send({ token, password: '24680', credential_type: 'pin' });
  assert.equal(invalidResponse.status, 400);
  assert.match(invalidResponse.body.error, /exactly 4 digits/i);

  const response = await request(app)
    .post('/auth/driver/accept-invite')
    .send({ token, password: '2468', credential_type: 'pin' });

  assert.equal(response.status, 200);
  assert.match(response.body.message, /driver pin established/i);
  assert.ok(driverState.invite_accepted_at);
});

test('legacy driver login accepts the username established from the invitation', async () => {
  const password = 'SecureDriverPassword!2026';
  const passwordHash = await bcrypt.hash(password, 10);
  const supabase = createSupabaseStub({
    driver: {
      id: 'driver-username-1',
      account_id: 'account-1',
      name: 'Phil Metzger',
      email: 'phillovesjoy@gmail.com',
      username: 'metzgerphil',
      password_hash: passwordHash,
      is_active: true
    }
  });
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    requireDriverDeviceId: true,
    authorizeDriverDevice: async () => ({
      id: 'device-session-username-1',
      device_hash: 'device-hash-username-1'
    })
  });

  const response = await request(app)
    .post('/auth/driver/login')
    .send({
      identifier: 'metzgerphil',
      password,
      device_id: '12345678-1234-1234-1234-123456789012'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.driver_id, 'driver-username-1');
  assert.equal(response.body.user.email, 'phillovesjoy@gmail.com');
});

test('public manager trial signup is disabled unless explicitly enabled', async () => {
  const originalPublicTrials = process.env.READYROUTE_ENABLE_PUBLIC_TRIALS;
  delete process.env.READYROUTE_ENABLE_PUBLIC_TRIALS;

  try {
    const supabase = createSupabaseStub();
    const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

    const response = await request(app)
      .post('/auth/manager/start-trial')
      .send({
        company_name: 'Bridge Transportation',
        full_name: 'Phillip Metzger',
        email: 'phillovesjoy@gmail.com',
        password: 'StrongPass!2026',
        vehicle_count: 15
      });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'Public workspace creation is currently disabled. Please request access through readyroute.org/mvp.');
    assert.equal(response.body.redirect_url, 'https://readyroute.org/mvp');
  } finally {
    if (originalPublicTrials === undefined) {
      delete process.env.READYROUTE_ENABLE_PUBLIC_TRIALS;
    } else {
      process.env.READYROUTE_ENABLE_PUBLIC_TRIALS = originalPublicTrials;
    }
  }
});

test('public manager trial signup seeds route billing commitment before checkout', async () => {
  const originalPublicTrials = process.env.READYROUTE_ENABLE_PUBLIC_TRIALS;
  process.env.READYROUTE_ENABLE_PUBLIC_TRIALS = 'true';
  const accountState = {
    id: 'acct-trial',
    company_name: 'Bridge Transportation',
    manager_email: 'owner@example.com',
    stripe_customer_id: null,
    vehicle_count: 15,
    plan: 'starter'
  };

  try {
    const supabase = new AuthRouteMockSupabase((query) => {
      if (query.table === 'manager_users' && query.operation === 'select') {
        return { data: [], error: null };
      }

      if (query.table === 'accounts' && query.operation === 'select') {
        const emailFilter = query.filters.find((filter) => filter.column === 'manager_email');

        if (emailFilter) {
          return { data: null, error: null };
        }

        return { data: { ...accountState }, error: null };
      }

      if (query.table === 'accounts' && query.operation === 'insert') {
        assert.equal(query.payload.company_name, 'Bridge Transportation');
        assert.equal(query.payload.manager_email, 'owner@example.com');
        assert.equal(query.payload.vehicle_count, 15);
        return {
          data: {
            id: accountState.id,
            company_name: accountState.company_name,
            manager_email: accountState.manager_email,
            stripe_customer_id: null,
            vehicle_count: 15
          },
          error: null
        };
      }

      if (query.table === 'manager_users' && query.operation === 'insert') {
        assert.equal(query.payload.account_id, accountState.id);
        assert.equal(query.payload.email, 'owner@example.com');
        assert.equal(query.payload.full_name, 'Phil Manager');
        return { data: null, error: null };
      }

      if (query.table === 'account_billing_settings' && query.operation === 'upsert') {
        assert.equal(query.payload.account_id, accountState.id);
        assert.equal(query.payload.committed_route_count, 15);
        assert.equal(query.options.onConflict, 'account_id');
        return {
          data: {
            committed_route_count: 15,
            billing_rate_cents: 1500,
            currency: 'usd',
            free_month_started_on: null,
            free_month_ends_on: null,
            is_billing_exempt: false
          },
          error: null
        };
      }

      if (query.table === 'accounts' && query.operation === 'update') {
        if (query.payload.stripe_customer_id) {
          accountState.stripe_customer_id = query.payload.stripe_customer_id;
        }
        return { data: null, error: null };
      }

      throw new Error(`Unexpected query ${query.table}:${query.operation}`);
    });

    const stripeClient = {
      customers: {
        create: async (payload) => {
          assert.equal(payload.email, 'owner@example.com');
          assert.equal(payload.metadata.account_id, accountState.id);
          return { id: 'cus_trial' };
        }
      },
      checkout: {
        sessions: {
          create: async (payload) => {
            assert.equal(payload.line_items[0].quantity, 15);
            assert.equal(payload.subscription_data.trial_period_days, 30);
            assert.equal(payload.subscription_data.metadata.account_id, accountState.id);
            return { id: 'cs_trial', url: 'https://checkout.stripe.test/cs_trial' };
          }
        }
      }
    };
    const app = createApp({
      supabase,
      jwtSecret: 'test-secret',
      stripeClient,
      stripePriceId: 'price_route',
      trialDays: 30,
      enforceBilling: false
    });

    const response = await request(app)
      .post('/auth/manager/start-trial')
      .send({
        company_name: 'Bridge Transportation',
        full_name: 'Phil Manager',
        email: 'owner@example.com',
        password: 'StrongPass!2026',
        route_count: 15
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.checkout_url, 'https://checkout.stripe.test/cs_trial');
  } finally {
    if (originalPublicTrials === undefined) {
      delete process.env.READYROUTE_ENABLE_PUBLIC_TRIALS;
    } else {
      process.env.READYROUTE_ENABLE_PUBLIC_TRIALS = originalPublicTrials;
    }
  }
});

test('manager session can request driver mode even before a route is assigned', async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const managerPasswordHash = await bcrypt.hash('VladPass!2026', 10);

  try {
    const supabase = createSupabaseStub({
      manager_email: 'owner@example.com',
      manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
      manager_user: {
        id: 'manager-user-1',
        account_id: 'account-1',
        email: 'vlad@example.com',
        password_hash: managerPasswordHash,
        full_name: 'Vlad Fedoryshyn',
        is_active: true
      }
    });
    const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

    const loginResponse = await request(app)
      .post('/auth/manager/login')
      .send({ email: 'vlad@example.com', password: 'VladPass!2026' });

    const response = await request(app)
      .post('/auth/mobile/manager-driver-session')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .send({});

    assert.equal(response.status, 200);
    assert.equal(response.body.driver_mode_source, 'manager');

    const driverPayload = jwt.verify(response.body.driver_token, 'test-secret');
    assert.equal(driverPayload.driver_id, 'manager-user-1');
    assert.equal(driverPayload.account_id, 'account-1');
    assert.equal(driverPayload.role, 'driver');
    assert.equal(driverPayload.driver_mode_source, 'manager');
  } finally {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});

test('manager requests reject a selected CSA id that does not match the token workspace', async () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const managerPasswordHash = await bcrypt.hash('VladPass!2026', 10);

  try {
    const supabase = createSupabaseStub({
      manager_email: 'owner@example.com',
      manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
      manager_user: {
        id: 'manager-user-1',
        account_id: 'account-1',
        email: 'vlad@example.com',
        password_hash: managerPasswordHash,
        full_name: 'Vlad Fedoryshyn',
        is_active: true
      }
    });
    const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

    const loginResponse = await request(app)
      .post('/auth/manager/login')
      .send({ email: 'vlad@example.com', password: 'VladPass!2026' });

    const response = await request(app)
      .post('/auth/mobile/manager-driver-session')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .set('X-ReadyRoute-CSA-Id', 'account-2')
      .send({});

    assert.equal(response.status, 409);
    assert.match(response.body.error, /selected csa/i);
  } finally {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});

test('manager password reset request returns a reset URL in non-production', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const sentEmails = [];
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    sendManagerPasswordResetEmail: async (payload) => {
      sentEmails.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });

  const response = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  assert.equal(response.status, 200);
  assert.match(response.body.message, /password reset email sent/i);
  assert.match(response.body.reset_url, /\?reset=/);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'phillovesjoy@gmail.com');
  assert.equal(sentEmails[0].companyName, 'Bridge Transportation');
});

test('manager password reset ignores inactive duplicate manager users', async () => {
  const activeHash = await bcrypt.hash('ActivePassword!123', 10);
  const inactiveHash = await bcrypt.hash('InactivePassword!123', 10);
  const supabase = createSupabaseStub({
    id: 'bridge-account',
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_users: [
      {
        id: 'inactive-manager-user',
        account_id: 'pv-delivery-account',
        email: 'phillovesjoy@gmail.com',
        password_hash: inactiveHash,
        full_name: null,
        is_active: false
      },
      {
        id: 'active-manager-user',
        account_id: 'bridge-account',
        email: 'phillovesjoy@gmail.com',
        password_hash: activeHash,
        full_name: 'Phillip Metzger',
        is_active: true
      }
    ]
  });
  const sentEmails = [];
  const app = createApp({
    supabase,
    jwtSecret: 'test-secret',
    enforceBilling: false,
    sendManagerPasswordResetEmail: async (payload) => {
      sentEmails.push(payload);
      return { delivered: true, skipped: false, provider_id: 'email-1' };
    }
  });

  const response = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  assert.equal(response.status, 200);
  assert.match(response.body.message, /password reset email sent/i);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'phillovesjoy@gmail.com');

  const token = new URL(response.body.reset_url).searchParams.get('reset');
  const tokenPayload = jwt.verify(token, 'test-secret');
  assert.equal(tokenPayload.manager_user_id, 'active-manager-user');
  assert.equal(tokenPayload.account_id, 'bridge-account');
});

test('manager password reset request fails honestly in production when email delivery is unavailable', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  let response;

  try {
    const app = createApp({
      supabase,
      jwtSecret: 'test-secret',
      enforceBilling: false,
      sendManagerPasswordResetEmail: async () => ({
        delivered: false,
        skipped: true,
        reason: 'Email service is not configured'
      })
    });

    response = await request(app)
      .post('/auth/manager/request-password-reset')
      .send({ email: 'phillovesjoy@gmail.com' });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }

  assert.equal(response.status, 503);
  assert.match(response.body.error, /not configured/i);
});

test('manager password reset request fails clearly in production when email delivery throws', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  let response;

  try {
    const app = createApp({
      supabase,
      jwtSecret: 'test-secret',
      enforceBilling: false,
      sendManagerPasswordResetEmail: async () => {
        throw new Error('Resend email failed: domain not verified');
      }
    });

    response = await request(app)
      .post('/auth/manager/request-password-reset')
      .send({ email: 'phillovesjoy@gmail.com' });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }

  assert.equal(response.status, 503);
  assert.match(response.body.error, /could not be sent/i);
});

test('manager password reset updates the password and invalidates the old one', async () => {
  const oldPassword = 'OldPassword!123';
  const newPassword = 'TempReset!2026';
  const hash = await bcrypt.hash(oldPassword, 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const requestResetResponse = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  const resetUrl = requestResetResponse.body.reset_url;
  const token = new URL(resetUrl).searchParams.get('reset');
  assert.ok(token);

  const resetResponse = await request(app)
    .post('/auth/manager/reset-password')
    .send({ token, password: newPassword });

  assert.equal(resetResponse.status, 200);
  assert.match(resetResponse.body.message, /Password updated/i);
  assert.equal(await bcrypt.compare(oldPassword, supabase.account.manager_password_hash), false);
  assert.equal(await bcrypt.compare(newPassword, supabase.account.manager_password_hash), true);

  const tokenPayload = jwt.verify(token, 'test-secret');
  assert.notEqual(
    tokenPayload.pwdv,
    require('crypto').createHash('sha256').update(supabase.account.manager_password_hash).digest('hex').slice(0, 16)
  );
});

test('authenticated manager can change their password from settings', async () => {
  const oldPassword = 'OldPassword!123';
  const newPassword = 'SettingsPass!2026';
  const hash = await bcrypt.hash(oldPassword, 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  try {
    const loginResponse = await request(app)
      .post('/auth/manager/login')
      .send({ email: 'phillovesjoy@gmail.com', password: oldPassword });

    assert.equal(loginResponse.status, 200);

    const response = await request(app)
      .post('/auth/manager/change-password')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .send({
        current_password: oldPassword,
        new_password: newPassword
      });

    assert.equal(response.status, 200);
    assert.match(response.body.message, /password updated/i);
    assert.equal(await bcrypt.compare(oldPassword, supabase.account.manager_password_hash), false);
    assert.equal(await bcrypt.compare(newPassword, supabase.account.manager_password_hash), true);
  } finally {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});

test('authenticated manager password change rejects an incorrect current password', async () => {
  const oldPassword = 'OldPassword!123';
  const hash = await bcrypt.hash(oldPassword, 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  try {
    const loginResponse = await request(app)
      .post('/auth/manager/login')
      .send({ email: 'phillovesjoy@gmail.com', password: oldPassword });

    const response = await request(app)
      .post('/auth/manager/change-password')
      .set('Authorization', `Bearer ${loginResponse.body.token}`)
      .send({
        current_password: 'WrongPassword!123',
        new_password: 'SettingsPass!2026'
      });

    assert.equal(response.status, 401);
    assert.match(response.body.error, /current password/i);
    assert.equal(await bcrypt.compare(oldPassword, supabase.account.manager_password_hash), true);
  } finally {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  }
});

test('manager password reset rejects short passwords', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const requestResetResponse = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  const resetUrl = requestResetResponse.body.reset_url;
  const token = new URL(resetUrl).searchParams.get('reset');

  const resetResponse = await request(app)
    .post('/auth/manager/reset-password')
    .send({ token, password: 'short' });

  assert.equal(resetResponse.status, 400);
  assert.match(resetResponse.body.error, /at least 10 characters/i);
});

test('manager password reset updates manager_users passwords', async () => {
  const oldPassword = 'OldPassword!123';
  const newPassword = 'VladReset!2026';
  const hash = await bcrypt.hash(oldPassword, 10);
  const supabase = createSupabaseStub({
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_user: {
      id: 'manager-user-1',
      account_id: 'account-1',
      email: 'vlad@example.com',
      password_hash: hash,
      full_name: 'Vlad Fedoryshyn',
      is_active: true
    }
  });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const requestResetResponse = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'vlad@example.com' });

  const resetUrl = requestResetResponse.body.reset_url;
  const token = new URL(resetUrl).searchParams.get('reset');
  assert.ok(token);

  const resetResponse = await request(app)
    .post('/auth/manager/reset-password')
    .send({ token, password: newPassword });

  assert.equal(resetResponse.status, 200);
  assert.equal(await bcrypt.compare(newPassword, supabase.managerUser.password_hash), true);
});

test('manager invite token lets a pending manager user set their own password', async () => {
  const pendingInvite = {
    id: 'manager-user-1',
    account_id: 'account-1',
    email: 'vlad@example.com',
    password_hash: null,
    full_name: 'Vlad Fedoryshyn',
    is_active: true,
    accepted_at: null
  };
  const supabase = createSupabaseStub({
    manager_email: 'owner@example.com',
    manager_password_hash: await bcrypt.hash('OwnerPass!2026', 10),
    manager_user: pendingInvite
  });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const inviteToken = jwt.sign(
    {
      account_id: 'account-1',
      manager_user_id: 'manager-user-1',
      email: 'vlad@example.com',
      purpose: 'manager_invite'
    },
    'test-secret',
    { expiresIn: '1h' }
  );

  const response = await request(app)
    .post('/auth/manager/reset-password')
    .send({ token: inviteToken, password: 'VladPass!2026' });

  assert.equal(response.status, 200);
  assert.equal(await bcrypt.compare('VladPass!2026', supabase.managerUser.password_hash), true);
  assert.ok(supabase.managerUser.accepted_at);
});
