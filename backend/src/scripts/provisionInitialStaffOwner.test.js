const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeEmail, validateEmail } = require('./provisionInitialStaffOwner');

test('normalizeEmail prepares a staff owner email for a unique lookup', () => {
  assert.equal(normalizeEmail('  Phillip@Example.COM '), 'phillip@example.com');
});

test('validateEmail rejects malformed staff owner emails', () => {
  assert.throws(() => validateEmail('not-an-email'), /valid staff owner email/);
  assert.doesNotThrow(() => validateEmail('phillip@example.com'));
});
