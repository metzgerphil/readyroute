const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRouteWorkAreaName,
  parseFccWorkAreaIdentity,
  stripRouteStatusSuffix
} = require('./routeIdentity');

test('parseFccWorkAreaIdentity separates FCC route code from driver label', () => {
  assert.deepEqual(
    parseFccWorkAreaIdentity('OCEA - 823 RAMIREZCASTELLANOS, BRAYANT - Available'),
    {
      routeCode: '823',
      driverName: 'Brayant Ramirezcastellanos',
      rawWorkAreaName: 'OCEA - 823 RAMIREZCASTELLANOS, BRAYANT'
    }
  );
});

test('parseFccWorkAreaIdentity treats bridge labels as route-only descriptors', () => {
  assert.deepEqual(
    parseFccWorkAreaIdentity('OCEA - 828 BRIDGE 01'),
    {
      routeCode: '828',
      driverName: '',
      rawWorkAreaName: 'OCEA - 828 BRIDGE 01'
    }
  );
});

test('normalizeRouteWorkAreaName keeps only the three digit route code when present', () => {
  assert.equal(normalizeRouteWorkAreaName('OCEA - 811 BRIDGE 02'), '811');
  assert.equal(normalizeRouteWorkAreaName('817'), '817');
  assert.equal(normalizeRouteWorkAreaName('Custom Route'), 'Custom Route');
});

test('stripRouteStatusSuffix removes FCC availability status only at the end', () => {
  assert.equal(stripRouteStatusSuffix('OCEA - 817 Someone - Available'), 'OCEA - 817 Someone');
  assert.equal(stripRouteStatusSuffix('Available Route 817'), 'Available Route 817');
});
