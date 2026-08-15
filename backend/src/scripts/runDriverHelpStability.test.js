const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSummary,
  parseArguments,
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
