const test = require('node:test');
const assert = require('node:assert/strict');

const { hashDeviceId, normalizeDeviceId } = require('./driverDeviceSession');

test('normalizes a bounded opaque mobile device identifier', () => {
  assert.equal(normalizeDeviceId('12345678-1234-1234-1234-123456789012'), '12345678-1234-1234-1234-123456789012');
  assert.equal(normalizeDeviceId('short'), null);
  assert.equal(normalizeDeviceId('bad device identifier with spaces'), null);
});

test('stores only a deterministic hash of the device identifier', () => {
  const raw = '12345678-1234-1234-1234-123456789012';
  assert.equal(hashDeviceId(raw).length, 64);
  assert.notEqual(hashDeviceId(raw), raw);
  assert.equal(hashDeviceId(raw), hashDeviceId(raw));
});
