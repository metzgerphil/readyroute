const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isOriginCoordinate,
  isUsableCoordinate,
  normalizeCoordinatePair,
  toCoordinateNumber
} = require('./coordinates');

test('coordinate helpers reject origin coordinates and normalize valid pairs', () => {
  assert.equal(toCoordinateNumber('33.12'), 33.12);
  assert.equal(toCoordinateNumber('nope'), null);

  assert.equal(isOriginCoordinate(0, 0), true);
  assert.equal(isOriginCoordinate(null, 0), false);

  assert.equal(isUsableCoordinate(33.12, -117.08), true);
  assert.equal(isUsableCoordinate(0, 0), false);
  assert.equal(isUsableCoordinate('0', '0'), false);
  assert.equal(isUsableCoordinate(91, -117.08), false);

  assert.deepEqual(normalizeCoordinatePair('33.12', '-117.08'), {
    lat: 33.12,
    lng: -117.08
  });
  assert.equal(normalizeCoordinatePair(0, 0), null);
});
