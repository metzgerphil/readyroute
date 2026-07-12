const test = require('node:test');
const assert = require('node:assert/strict');

const {
  READYROUTE_STAFF_ROLES,
  readRequiredStaffContext,
  signStaffToken
} = require('./readyRouteStaffAuth');

function createStaffSupabase(staffUser) {
  return {
    from(table) {
      assert.equal(table, 'readyroute_staff_users');
      return {
        select() { return this; },
        eq(column, value) {
          assert.equal(column, 'id');
          assert.equal(value, staffUser.id);
          return this;
        },
        async maybeSingle() {
          return { data: { ...staffUser }, error: null };
        }
      };
    }
  };
}

function createRequest(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

test('staff session uses the current database role', async () => {
  const staffUser = {
    id: 'staff-1',
    email: 'owner@readyroute.org',
    full_name: 'Owner',
    role: 'support',
    is_active: true,
    password_hash: 'hash-current'
  };
  const token = signStaffToken({ ...staffUser, role: 'owner' }, 'staff-session-secret');
  const context = await readRequiredStaffContext(
    createRequest(token),
    'staff-session-secret',
    READYROUTE_STAFF_ROLES,
    { supabase: createStaffSupabase(staffUser), enforceSessionValidation: true }
  );

  assert.equal(context.staff_role, 'support');
});

test('staff session ends after a password change', async () => {
  const previousStaffUser = {
    id: 'staff-1',
    email: 'owner@readyroute.org',
    full_name: 'Owner',
    role: 'owner',
    is_active: true,
    password_hash: 'hash-old'
  };
  const token = signStaffToken(previousStaffUser, 'staff-session-secret');

  await assert.rejects(
    readRequiredStaffContext(
      createRequest(token),
      'staff-session-secret',
      READYROUTE_STAFF_ROLES,
      {
        supabase: createStaffSupabase({ ...previousStaffUser, password_hash: 'hash-new' }),
        enforceSessionValidation: true
      }
    ),
    (error) => error.status === 401 && /sign in again/i.test(error.message)
  );
});
