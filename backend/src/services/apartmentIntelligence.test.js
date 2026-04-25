const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractUnitNumber,
  normalizeStoredFloor,
  normalizeBuildingAddress,
  predictFloor
} = require('./apartmentIntelligence');
const { buildCorrectionKey } = require('./locationCorrections');

test('extractUnitNumber finds apartment-style unit numbers', () => {
  assert.equal(extractUnitNumber('APT A'), 'A');
  assert.equal(extractUnitNumber('Unit 304'), '304');
  assert.equal(extractUnitNumber('# 12'), '12');
  assert.equal(extractUnitNumber('SPACE 7'), '7');
  assert.equal(extractUnitNumber('STE 100'), null);
});

test('predictFloor follows the apartment heuristic', () => {
  assert.deepEqual(predictFloor('304'), { floor: 3, confidence: 'high' });
  assert.deepEqual(predictFloor('1204'), { floor: 12, confidence: 'medium' });
  assert.deepEqual(predictFloor('12'), { floor: 1, confidence: 'low' });
  assert.equal(predictFloor('APT B'), null);
});

test('normalizeStoredFloor keeps unknown apartment floors null', () => {
  assert.equal(normalizeStoredFloor(null), null);
  assert.equal(normalizeStoredFloor(''), null);
  assert.equal(normalizeStoredFloor(0), null);
  assert.equal(normalizeStoredFloor('0'), null);
  assert.equal(normalizeStoredFloor(3), 3);
});

test('normalizeBuildingAddress keeps a stable building key', () => {
  assert.equal(
    normalizeBuildingAddress('444 East 4th Avenue, Escondido, CA 92025', 'APT 1008'),
    '444 east 4th ave'
  );
  assert.equal(
    normalizeBuildingAddress('1314 South Juniper Street, Escondido, CA 92025', 'APT A'),
    '1314 south juniper st'
  );
});

test('buildCorrectionKey keeps unit-level corrections distinct', () => {
  assert.deepEqual(
    buildCorrectionKey({
      address: '444 East 4th Avenue, Escondido, CA 92025',
      address_line2: 'APT 1008'
    }),
    {
      normalized_address: '444 east 4th ave',
      unit_number: '1008'
    }
  );
});
