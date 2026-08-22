import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendRraTestLogEntry,
  buildRraTestLogEntry,
  formatRraTestLog,
  summarizeRraTestLogEntry
} from './rraTestLog.js';

test('builds a shareable RRA test entry with displayed output and diagnostics', () => {
  const entry = buildRraTestLogEntry('Business is closed.', {
    response_mode: 'CLARIFY',
    clarification_prompt: 'Is release permitted?',
    candidates: [{ knowledge_id: 'KNO-1', score: 88 }],
    interpretation_mode: 'GROUNDED_AI',
    composition_mode: 'GROUNDED_AI',
    composition_validation: { valid: true, usage: { estimated_cost_usd: 0.001 } }
  }, '2026-08-15T14:00:00.000Z');

  assert.equal(entry.question, 'Business is closed.');
  assert.equal(entry.displayed_response.clarification_prompt, 'Is release permitted?');
  assert.equal(entry.diagnostics.candidates[0].knowledge_id, 'KNO-1');
  assert.equal(entry.diagnostics.composition_mode, 'GROUNDED_AI');
  assert.equal(entry.diagnostics.composition_validation.usage.estimated_cost_usd, 0.001);
  assert.equal(summarizeRraTestLogEntry(entry), 'Is release permitted?');
});

test('formats the complete ordered test log for copying', () => {
  const entries = [buildRraTestLogEntry('Question one', { response_mode: 'ANSWER', answer: 'Answer one' })];
  const exported = JSON.parse(formatRraTestLog(entries, '2026-08-15T14:01:00.000Z'));

  assert.equal(exported.test_count, 1);
  assert.equal(exported.tests[0].question, 'Question one');
  assert.equal(exported.tests[0].displayed_response.answer, 'Answer one');
});

test('keeps the most recent 50 test entries', () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({ question: `Question ${index}` }));
  const updated = appendRraTestLogEntry(entries, { question: 'Newest question' });

  assert.equal(updated.length, 50);
  assert.equal(updated[0].question, 'Question 1');
  assert.equal(updated[49].question, 'Newest question');
});
