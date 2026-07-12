const assert = require('node:assert/strict');
const test = require('node:test');

const { assertSmokeManagerEmail } = require('./provisionProductionSmokeManager');

test('smoke manager provisioning is restricted to the dedicated identity', () => {
  assert.doesNotThrow(() => assertSmokeManagerEmail('production-smoke@readyroute.test'));
  assert.throws(
    () => assertSmokeManagerEmail('owner@readyroute.org'),
    /Refusing to provision a manager outside the dedicated ReadyRoute smoke identity/
  );
});
