const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDriverHelpDecision,
  normalizeDriverQuestion,
  selectCanonicalRecordVersions
} = require('./driverHelpRetrieval');

function record(overrides = {}) {
  return {
    knowledge_id: 'TEST-PROCEDURE-001',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Sample indicator appears during a training simulation',
    normalized_description: 'A non-operational fixture used only to test retrieval',
    authoritative_rule: 'Follow the verified sample instruction.',
    concise_answer: 'Follow the verified sample instruction.',
    driver_question_variants: ['sample indicator appeared in training'],
    driver_question_patterns: [],
    clarification_requirements: [],
    required_procedure: [],
    required_documentation: [],
    prohibited_actions: [],
    escalation_requirements: [],
    taxonomy_paths: ['TEST/SAMPLE'],
    ...overrides
  };
}

test('empty corpus always fails closed', () => {
  const decision = buildDriverHelpDecision('What should I do?', []);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
  assert.match(decision.escalation_message, /does not have a verified answer/i);
});

test('exact evaluated variant can return the stored published answer', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared in training', [record()]);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'Follow the verified sample instruction.');
  assert.equal(decision.selected_records[0].knowledge_id, 'TEST-PROCEDURE-001');
});

test('ineligible records never produce definitive instructions', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared in training', [record({
    status: 'PENDING_REVIEW',
    is_published: false
  })]);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
});

test('record-authored clarification requirements control ambiguity handling', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared', [record({
    driver_question_variants: [],
    clarification_requirements: ['which training screen is visible']
  })]);
  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /which training screen is visible/i);
});

test('active approved adjudication can outrank a newer raw version', () => {
  const approved = record({ status: 'READY_ROUTE_APPROVED', version: 1 });
  const newer = record({ status: 'SOURCE_VERIFIED', version: 2 });
  assert.equal(selectCanonicalRecordVersions([newer, approved])[0].status, 'READY_ROUTE_APPROVED');
});

test('normalization is mechanical and contains no corpus-specific aliases', () => {
  assert.equal(normalizeDriverQuestion('  Sámple—Indicator! '), 'sample indicator');
});
