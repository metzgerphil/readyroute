const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCancellationSchedule,
  getAccountAccess,
  getEffectiveAccountStatus
} = require('./accountLifecycle');

test('buildCancellationSchedule retains data for 60 days after service ends', () => {
  const schedule = buildCancellationSchedule({
    now: new Date('2026-07-11T20:00:00.000Z'),
    serviceEndsAt: new Date('2026-07-31T23:59:59.000Z')
  });

  assert.equal(schedule.account_status, 'canceling');
  assert.equal(schedule.cancellation_requested_at, '2026-07-11T20:00:00.000Z');
  assert.equal(schedule.service_ends_at, '2026-07-31T23:59:59.000Z');
  assert.equal(schedule.retention_ends_at, '2026-09-29T23:59:59.000Z');
});

test('expired cancellation becomes retained without waiting for a database sweep', () => {
  const account = {
    account_status: 'canceling',
    service_ends_at: '2026-07-10T00:00:00.000Z'
  };

  assert.equal(getEffectiveAccountStatus(account, new Date('2026-07-11T00:00:00.000Z')), 'retained');
  assert.equal(getAccountAccess(account, { method: 'GET', now: new Date('2026-07-11T00:00:00.000Z') }).allowed, true);
  assert.equal(getAccountAccess(account, { method: 'POST', now: new Date('2026-07-11T00:00:00.000Z') }).allowed, false);
});

test('active and pre-end-date canceling accounts remain writable', () => {
  const now = new Date('2026-07-11T00:00:00.000Z');

  assert.equal(getAccountAccess({ account_status: 'active' }, { method: 'POST', now }).allowed, true);
  assert.equal(getAccountAccess({
    account_status: 'canceling',
    service_ends_at: '2026-08-01T00:00:00.000Z'
  }, { method: 'POST', now }).allowed, true);
});
