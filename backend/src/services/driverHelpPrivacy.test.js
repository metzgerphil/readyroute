const test = require('node:test');
const assert = require('node:assert/strict');

const { redactConversationContextForAi, redactTextForAi } = require('./driverHelpPrivacy');

test('redactTextForAi removes common personal and package identifiers', () => {
  const result = redactTextForAi('Call 415-555-1212, email driver@example.com, package 123456789012 at 42 Main Street.');
  assert.equal(result.includes('415-555-1212'), false);
  assert.equal(result.includes('driver@example.com'), false);
  assert.equal(result.includes('123456789012'), false);
  assert.equal(result.includes('42 Main Street'), false);
});

test('redactConversationContextForAi redacts the active question history', () => {
  const result = redactConversationContextForAi({
    original_situation: 'Deliver to 900 Market Ave',
    previous_question: 'Tracking 123456789012',
    clarification_history: [{ prompt: 'Where?', answer: '900 Market Ave' }]
  });
  assert.match(result.original_situation, /address removed/);
  assert.match(result.previous_question, /identifier removed/);
  assert.match(result.clarification_history[0].answer, /address removed/);
});
