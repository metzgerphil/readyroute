import test from 'node:test';
import assert from 'node:assert/strict';
import { answerSections, mayContinue, pendingRequest } from './staffAnswerLab.js';
test('partial instructions and follow-up remain visible together', () => {
  const result = { session_id: 'saved', response_mode: 'ANSWER', partial_answer: true, clarification_prompt: 'Which situation?', answer_structure: { sections: [{ direct_answer: 'Approved part', steps: ['Step 1'], documentation: ['Record it'] }] } };
  assert.equal(mayContinue(result), true);
  assert.equal(answerSections(result)[0].documentation[0], 'Record it');
  assert.equal(mayContinue({ response_mode: 'ANSWER' }), false);
});
test('retry preserves the original request and conversation even after a draft changes', () => {
  const saved = { request_id: 'original-request', question: 'original question', session_id: 'first' };
  assert.deepEqual(pendingRequest('changed', 'other', saved, 'new'), saved);
  assert.deepEqual(pendingRequest(' new situation ', null, null, 'new-id'), { request_id: 'new-id', question: 'new situation' });
});
test('released answer fields remain available in comparison', () => {
  const sections = answerSections({ answer: 'Answer', answer_structure: { procedure_steps: ['Procedure'], escalation_requirements: ['Ask management'] } });
  assert.equal(sections[0].direct_answer, 'Answer');
  assert.deepEqual(sections[0].procedure_steps, ['Procedure']);
  assert.deepEqual(sections[0].escalation, ['Ask management']);
});
