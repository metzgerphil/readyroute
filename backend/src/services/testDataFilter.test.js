const assert = require('assert');
const test = require('node:test');

const { filterProductionRows, isProductionTestArtifact } = require('./testDataFilter');

test('isProductionTestArtifact prefers explicit test flags', () => {
  assert.equal(isProductionTestArtifact({ name: 'Real Driver', is_test: true }), true);
  assert.equal(isProductionTestArtifact({ name: 'Real Truck', test_data: 'true' }), true);
  assert.equal(isProductionTestArtifact({ name: 'Real Driver', is_test: false, test_data: false }), false);
  assert.equal(isProductionTestArtifact({ name: 'Test Driver E2E', is_test: false }), false);
});

test('isProductionTestArtifact detects readyroute test email accounts', () => {
  assert.equal(isProductionTestArtifact({ email: 'driver@readyroute.test' }), true);
  assert.equal(isProductionTestArtifact({ email: 'driver@example.com' }), false);
});

test('isProductionTestArtifact detects smoke and QA artifacts without matching ordinary text', () => {
  assert.equal(isProductionTestArtifact({ name: 'Smoke Test Maintenance' }), true);
  assert.equal(isProductionTestArtifact({ name: 'QA Artifact Truck' }), true);
  assert.equal(isProductionTestArtifact({ name: 'Contest Route' }), false);
});

test('filterProductionRows removes only test artifacts', () => {
  const rows = [
    { id: 'real', name: 'Adrian Morales' },
    { id: 'flagged', name: 'Display Driver', is_test: true },
    { id: 'email', email: 'smoke@readyroute.test' },
    { id: 'smoke', service_type: 'Smoke Test Maintenance' }
  ];

  assert.deepEqual(filterProductionRows(rows).map((row) => row.id), ['real']);
});
