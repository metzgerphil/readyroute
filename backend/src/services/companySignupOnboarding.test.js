const assert = require('node:assert/strict');
const test = require('node:test');

const { createCompanySignupOnboardingService } = require('./companySignupOnboarding');

class Query {
  constructor(db, table) { this.db = db; this.table = table; this.operation = 'select'; this.filters = []; }
  select(columns) { this.columns = columns; return this; }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  upsert(payload, options) { this.operation = 'upsert'; this.payload = payload; this.options = options; return this; }
  delete() { this.operation = 'delete'; return this; }
  eq(column, value) { this.filters.push({ column, value }); return this; }
  limit(value) { this.limitValue = value; return this; }
  single() { return Promise.resolve(this.db.handle(this)); }
  maybeSingle() { return Promise.resolve(this.db.handle(this)); }
  then(resolve, reject) { return Promise.resolve(this.db.handle(this)).then(resolve, reject); }
}

function createDb(handler) {
  return { from(table) { return new Query(this, table); }, handle: handler };
}

test('public signup onboarding creates the company, owner access, and secure invitation once', async () => {
  const writes = [];
  let managerSelects = 0;
  const db = createDb((query) => {
    if (query.table === 'manager_users' && query.operation === 'select') {
      managerSelects += 1;
      return { data: null, error: null };
    }
    if (query.table === 'accounts' && query.operation === 'insert') {
      writes.push(query);
      assert.equal(query.payload.company_name, 'Taylor Transport');
      assert.equal(query.payload.billing_setup_status, 'succeeded');
      assert.equal(query.payload.billing_activation_status, 'ready');
      return { data: { id: 'acct-1', company_name: 'Taylor Transport', manager_email: 'owner@example.com', subscription_status: 'incomplete', plan: 'starter' }, error: null };
    }
    if (query.table === 'manager_users' && query.operation === 'insert') {
      writes.push(query);
      assert.equal(query.payload.account_id, 'acct-1');
      assert.equal(query.payload.email, 'owner@example.com');
      assert.equal(query.payload.password_hash, null);
      return { data: { id: 'manager-1', account_id: 'acct-1', email: 'owner@example.com', full_name: 'Taylor Owner' }, error: null };
    }
    if (query.table === 'account_internal_profiles' && query.operation === 'upsert') {
      writes.push(query);
      assert.equal(query.payload.onboarding_stage, 'manager_invited');
      return { data: null, error: null };
    }
    if (query.table === 'early_access_signups' && query.operation === 'update') {
      writes.push(query);
      assert.equal(query.payload.account_id, 'acct-1');
      return { data: null, error: null };
    }
    throw new Error(`Unexpected ${query.table}:${query.operation}`);
  });
  const sent = [];
  const service = createCompanySignupOnboardingService({
    supabase: db,
    jwtSecret: 'test-secret',
    managerPortalUrl: 'https://portal.readyroute.org',
    now: () => new Date('2026-08-17T00:00:00.000Z'),
    sendManagerInviteEmail: async (payload) => { sent.push(payload); return { delivered: true, skipped: false }; }
  });

  const result = await service.onboardSignup({
    id: 'signup-1', name: 'Taylor Owner', email: 'owner@example.com', company_csa: 'Taylor Transport',
    billing_setup_status: 'succeeded', billing_interval: 'annual', stripe_customer_id: 'cus-1', stripe_payment_method_id: 'pm-1'
  });

  assert.equal(result.account.id, 'acct-1');
  assert.equal(result.invitation.email_delivery, 'sent');
  assert.equal(result.already_onboarded, false);
  assert.equal(managerSelects, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].inviteUrl, /^https:\/\/portal\.readyroute\.org\/reset-password\?/);
  assert.equal(writes.length, 4);
});

test('public signup onboarding returns the existing company without creating another one', async () => {
  const db = createDb(() => { throw new Error('Database must not be called for an onboarded signup'); });
  const service = createCompanySignupOnboardingService({ supabase: db, jwtSecret: 'test-secret' });
  const result = await service.onboardSignup({
    id: 'signup-1', account_id: 'acct-existing', name: 'Taylor Owner', email: 'owner@example.com', company_csa: 'Taylor Transport'
  });
  assert.equal(result.account.id, 'acct-existing');
  assert.equal(result.already_onboarded, true);
});
