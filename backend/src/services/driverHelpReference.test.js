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
