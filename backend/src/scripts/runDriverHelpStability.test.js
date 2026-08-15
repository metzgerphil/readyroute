const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSummary,
  parseArguments,
  referenceWordingVariations,
  wordingVariations
} = require('./runDriverHelpStability');

test('stability arguments require bounded repeated runs', () => {
  assert.deepEqual(parseArguments([]), { repeat: 3, report: null });
  assert.equal(parseArguments(['--repeat', '5']).repeat, 5);
  assert.throws(() => parseArguments(['--repeat', '0']), /1 to 20/);
});

test('wording variations preserve the authored driver statement', () => {
  const variants = wordingVariations('pickup canceled before I went there');
  assert.equal(variants.length, 3);
  assert.ok(variants.every((value) => /pickup canceled before i went there/i.test(value)));
});

test('reference wording variations cover category order, aliases, and leading zero forms', () => {
  const pickup = referenceWordingVariations('PICKUP_REASON', '24');
  const delivery = referenceWordingVariations('DELIVERY_STATUS', '004');
  assert.ok(pickup.includes('what is code 24 pickup'));
  assert.ok(pickup.includes('PU code 24'));
  assert.ok(pickup.includes('code 24 for pickup'));
  assert.ok(delivery.includes('what is delivery code 004'));
  assert.ok(delivery.includes('delivery status code 4'));
  assert.ok(delivery.includes('code 004 delivery status'));
});

test('stability summary blocks expansion whenever a failure remains', () => {
  const summary = buildSummary({
    args: { repeat: 1 },
    records: [{ is_published: true }],
    cases: [],
    conversations: [],
    outOfCorpus: [],
    runs: [{ assertions: 1, failures: [{ category: 'RETRIEVAL', severity: 'CRITICAL' }] }]
  });
  assert.equal(summary.stability_gate, 'FAIL');
  assert.equal(summary.expansion_gate, 'BLOCKED');
});
