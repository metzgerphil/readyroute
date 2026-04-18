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
    manager_password_hash: initialAccount.manager_password_hash || null
  };
  const managerUser = initialAccount.manager_user || null;

  return {
    account,
    managerUser,
    from(table) {
      assert.ok(['accounts', 'manager_users'].includes(table));

      const query = {
        select() {
          return this;
        },
        eq(column, value) {
          this[column] = value;
          return this;
        },
        async maybeSingle() {
          if (table === 'manager_users') {
            if (!managerUser) {
              return { data: null, error: null };
            }

            if (
              (this.email && this.email !== managerUser.email) ||
              (this.id && this.id !== managerUser.id)
            ) {
              return { data: null, error: null };
            }

            return { data: { ...managerUser }, error: null };
          }

          if (
            (this.manager_email && this.manager_email !== account.manager_email) ||
            (this.id && this.id !== account.id)
          ) {
            return { data: null, error: null };
          }

          return { data: { ...account }, error: null };
        },
        update(payload) {
          return {
            eq(column, value) {
              if (table === 'manager_users') {
                if (managerUser && column === 'id' && value === managerUser.id) {
                  Object.assign(managerUser, payload);
                }

                return Promise.resolve({ error: null });
              }

              if (column === 'id' && value === account.id) {
                account.manager_password_hash = payload.manager_password_hash;
              }

              return Promise.resolve({ error: null });
            }
          };
        }
      };

      return query;
    }
  };
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

test('manager password reset request returns a reset URL in non-production', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const response = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  assert.equal(response.status, 200);
  assert.match(response.body.message, /password reset link/i);
  assert.match(response.body.reset_url, /\/reset-password\?token=/);
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
  const token = new URL(resetUrl).searchParams.get('token');
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

test('manager password reset rejects short passwords', async () => {
  const hash = await bcrypt.hash('OldPassword!123', 10);
  const supabase = createSupabaseStub({ manager_password_hash: hash });
  const app = createApp({ supabase, jwtSecret: 'test-secret', enforceBilling: false });

  const requestResetResponse = await request(app)
    .post('/auth/manager/request-password-reset')
    .send({ email: 'phillovesjoy@gmail.com' });

  const resetUrl = requestResetResponse.body.reset_url;
  const token = new URL(resetUrl).searchParams.get('token');

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
  const token = new URL(resetUrl).searchParams.get('token');
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
