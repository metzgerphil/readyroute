const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeGroundedDecision,
  validateGroundedComposition
} = require('./driverHelpGroundedComposition');

function eligibleRecord(overrides = {}) {
  return {
    knowledge_id: 'KNO-TEST-006',
    version: '1.0.0',
    status: 'SOURCE_VERIFIED',
    is_published: true,
    authoritative_rule: 'Use status code 006 when the recipient refuses the package.',
    concise_answer: 'Apply status code 006 and keep the package in your custody.',
    more_info_answer: 'Return the package to the station.',
    required_procedure: [
      'Apply status code 006.',
      'Keep the package in your custody.',
      'Return the package to the station.'
    ],
    required_documentation: [],
    prohibited_actions: ['Do not leave the package at the stop.'],
    escalation_requirements: [],
    ...overrides
  };
}

function answerDecision(record = eligibleRecord()) {
  return {
    response_mode: 'ANSWER',
    answer_type: 'OPERATIONAL',
    answer: record.concise_answer,
    more_info: record.more_info_answer,
    answer_structure: null,
    selected_records: [record],
    candidates: []
  };
}

test('accepts a clearer answer grounded to eligible canonical fields', async () => {
  const decision = answerDecision();
  const result = await composeGroundedDecision(decision, async () => ({
    answer: 'Use code 006. Keep the package with you and return it to the station.',
    more_info: null,
    answer_structure: null,
    grounding: [{
      output_path: 'answer',
      knowledge_id: 'KNO-TEST-006',
      source_paths: ['concise_answer', 'required_procedure']
    }]
  }));

  assert.equal(result.composition_mode, 'GROUNDED_AI');
  assert.match(result.answer, /code 006/i);
  assert.equal(result.composition_validation.valid, true);
});

test('preserves verified deterministic answer structure when AI only rewrites prose', async () => {
  const decision = {
    ...answerDecision(),
    answer_structure: { heading: 'What to do', steps: ['Apply status code 006.'] }
  };
  const result = await composeGroundedDecision(decision, async () => ({
    answer: 'Use code 006 and keep the package with you.',
    more_info: null,
    answer_structure: null,
    grounding: [{
      output_path: 'answer',
      knowledge_id: 'KNO-TEST-006',
      source_paths: ['concise_answer']
    }]
  }));

  assert.equal(result.composition_mode, 'GROUNDED_AI');
  assert.deepEqual(result.answer_structure, decision.answer_structure);
});

test('rejects an invented operational code and uses the deterministic answer', async () => {
  const decision = answerDecision();
  const result = await composeGroundedDecision(decision, async () => ({
    answer: 'Use code 007 and leave the package.',
    more_info: null,
    answer_structure: null,
    grounding: [{
      output_path: 'answer',
      knowledge_id: 'KNO-TEST-006',
      source_paths: ['concise_answer']
    }]
  }));

  assert.equal(result.composition_mode, 'DETERMINISTIC_FALLBACK');
  assert.equal(result.answer, decision.answer);
  assert.equal(result.composition_validation.reason, 'unsupported_operational_number');
});

test('rejects grounding to an unselected record or unsupported field', () => {
  const record = eligibleRecord();
  const unknownRecord = validateGroundedComposition({
    answer: 'Apply status code 006.',
    grounding: [{
      output_path: 'answer',
      knowledge_id: 'KNO-OTHER',
      source_paths: ['concise_answer']
    }]
  }, [record]);
  const unsupportedField = validateGroundedComposition({
    answer: 'Apply status code 006.',
    grounding: [{
      output_path: 'answer',
      knowledge_id: record.knowledge_id,
      source_paths: ['driver_question_variants']
    }]
  }, [record]);

  assert.equal(unknownRecord.reason, 'invalid_grounding');
  assert.equal(unsupportedField.reason, 'invalid_grounding');
});

test('does not call the composer for clarifications or exact reference answers', async () => {
  let calls = 0;
  const composer = async () => {
    calls += 1;
    return 'NONE';
  };
  const clarification = await composeGroundedDecision({
    response_mode: 'CLARIFY',
    selected_records: [eligibleRecord()]
  }, composer);
  const reference = await composeGroundedDecision({
    ...answerDecision(),
    answer_type: 'REFERENCE'
  }, composer);

  assert.equal(calls, 0);
  assert.equal(clarification.composition_mode, 'DETERMINISTIC');
  assert.equal(reference.composition_mode, 'DETERMINISTIC');
});

test('falls back safely when the composer errors or declines', async () => {
  const decision = answerDecision();
  const errored = await composeGroundedDecision(decision, async () => {
    throw new Error('model unavailable');
  });
  const declined = await composeGroundedDecision(decision, async () => 'NONE');

  assert.equal(errored.composition_validation.reason, 'composer_error');
  assert.equal(declined.composition_validation.reason, 'composer_declined');
  assert.equal(errored.answer, decision.answer);
  assert.equal(declined.answer, decision.answer);
});

test('falls back when a critical composed answer drops a required instruction', async () => {
  const decision = {
    ...answerDecision(),
    required_answer_patterns: ['(?:do not|never)', '(?:sign|signature)'],
    answer: 'Do not sign for the recipient.'
  };
  const result = await composeGroundedDecision(decision, async () => ({
    answer: 'Complete the normal delivery prompts.',
    more_info: null,
    answer_structure: null,
    grounding: [{
      output_path: 'answer',
      knowledge_id: 'KNO-TEST-006',
      source_paths: ['required_procedure']
    }]
  }));

  assert.equal(result.composition_mode, 'DETERMINISTIC_FALLBACK');
  assert.equal(result.answer, 'Do not sign for the recipient.');
  assert.equal(result.composition_validation.reason, 'missing_required_driver_instruction');
});
