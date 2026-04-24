const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectSuspiciousCoordinateClusters,
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

test('detectSuspiciousCoordinateClusters flags many different addresses collapsed onto one coordinate', () => {
  const stops = Array.from({ length: 9 }, (_, index) => ({
    lat: 33.128929,
    lng: -117.123574,
    address_line1: `${2000 + index} DIFFERENT ST`
  }));

  const result = detectSuspiciousCoordinateClusters(stops);

  assert.equal(result.suspicious_cluster_count, 1);
  assert.equal(result.suspicious_clusters[0].stop_count, 9);
  assert.equal(result.suspicious_clusters[0].distinct_address_count, 9);
});

test('detectSuspiciousCoordinateClusters does not flag many units at the same building address', () => {
  const stops = Array.from({ length: 10 }, (_, index) => ({
    lat: 33.128929,
    lng: -117.123574,
    address_line1: '611 E MISSION AVE',
    address: `611 E MISSION AVE, APT ${index + 1}, ESCONDIDO, CA 92025`
  }));

  const result = detectSuspiciousCoordinateClusters(stops);

  assert.equal(result.suspicious_cluster_count, 0);
  assert.deepEqual(result.suspicious_clusters, []);
});
