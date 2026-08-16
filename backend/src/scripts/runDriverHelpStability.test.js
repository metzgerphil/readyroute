const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSummary,
  parseArguments,
  referenceWordingVariations,
  validateExpectedPresentation,
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

test('stability presentation checks reject a generic record answer when a compact branch answer is required', () => {
  const failures = validateExpectedPresentation({
    response_mode: 'ANSWER',
    answer: 'Review the complete premium-service rules.',
    answer_structure: { direct_answer: 'Review the complete premium-service rules.' }
  }, {
    answer_override: { direct_answer: 'No. Deliver Evening service only during the 5–8 p.m. window.' }
  }, {
    suite: 'TEST', caseId: 'SPECIFICITY', run: 1, input: 'Can I deliver at 4:45?'
  });
  assert.equal(failures[0].category, 'ANSWER_SPECIFICITY');
});
