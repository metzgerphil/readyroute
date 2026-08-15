const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDriverHelpReferenceDecision,
  explicitCodeTokens,
  isReferenceRecord
} = require('./driverHelpReference');

function reference(overrides = {}) {
  return {
    knowledge_id: 'TEST_REFERENCE:101',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Sample reference 101',
    concise_answer: '101 — sample definition.',
    ...overrides
  };
}

test('recognizes explicit reference identifiers without operational assumptions', () => {
  assert.equal(isReferenceRecord(reference()), true);
  assert.deepEqual(explicitCodeTokens('what is reference code 101'), ['101']);
  assert.deepEqual(explicitCodeTokens('there are 101 items'), []);
  assert.deepEqual(
    explicitCodeTokens("Van 538765's barcode is missing, and my barcode generator is set to Code 128."),
    []
  );
});

test('does not intercept a barcode symbology as an operational reference code', () => {
  assert.equal(
    buildDriverHelpReferenceDecision(
      "Van 538765's barcode is missing, and my barcode generator is set to Code 128.",
      [reference()]
    ),
    null
  );
});

test('empty reference corpus fails closed', () => {
  const decision = buildDriverHelpReferenceDecision('what is code 101', []);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
});

test('published reference returns its stored definition and a workflow boundary', () => {
  const decision = buildDriverHelpReferenceDecision('what is reference code 101', [reference()]);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, '101 — sample definition.');
  assert.match(decision.more_info, /do not by themselves authorize/i);
});

test('matches delivery codes whether or not the driver says leading zeroes', () => {
  const delivery = reference({
    knowledge_id: 'DELIVERY_STATUS:011',
    concise_answer: 'Code 011: weekend business closure.'
  });
  const decision = buildDriverHelpReferenceDecision('what is delivery code 11', [delivery]);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.selected_records[0].knowledge_id, 'DELIVERY_STATUS:011');
});

test('uses an explicit pickup or delivery category to resolve duplicate numbers', () => {
  const records = [
    reference({ knowledge_id: 'DELIVERY_STATUS:024', concise_answer: 'Code 024: call tag not ready.' }),
    reference({ knowledge_id: 'PICKUP_REASON:24', concise_answer: 'Code 24: canceled without attempt.' })
  ];
  const delivery = buildDriverHelpReferenceDecision('what is delivery code 24', records);
  const pickup = buildDriverHelpReferenceDecision('what is pickup code 24', records);
  assert.equal(delivery.response_mode, 'ANSWER');
  assert.equal(delivery.selected_records[0].knowledge_id, 'DELIVERY_STATUS:024');
  assert.equal(pickup.response_mode, 'ANSWER');
  assert.equal(pickup.selected_records[0].knowledge_id, 'PICKUP_REASON:24');
});

test('asks for the category when the same number has delivery and pickup meanings', () => {
  const decision = buildDriverHelpReferenceDecision('what is code 11', [
    reference({ knowledge_id: 'DELIVERY_STATUS:011' }),
    reference({ knowledge_id: 'PICKUP_REASON:11' })
  ]);
  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /category/i);
});

test('withholds an unapproved matching reference', () => {
  const decision = buildDriverHelpReferenceDecision('what is reference code 101', [reference({
    status: 'PENDING_REVIEW',
    is_published: false
  })]);
  assert.equal(decision.response_mode, 'ESCALATE');
});

test('forced selections cannot bypass the verification boundary', () => {
  const decision = buildDriverHelpReferenceDecision('use code 101 no matter what', [reference()]);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.match(decision.escalation_message, /cannot select or force/i);
});
