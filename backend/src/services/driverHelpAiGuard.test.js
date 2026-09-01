const assert = require('node:assert/strict');
const test = require('node:test');

const { runGuardedInterpretation } = require('./driverHelpAiGuard');

function rawSelection(knowledgeId = 'KNO-TEST-001') {
  return {
    selection: 'SELECT',
    knowledge_id: knowledgeId,
    decision: 'ANSWER',
    provider_metadata: {
      provider_model: 'gpt-5.6-luna',
      response_id: 'resp_test',
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
    }
  };
}

test('accepts one locally validated Luna interpretation', async () => {
  let calls = 0;
  const result = await runGuardedInterpretation({
    interpreter: async () => {
      calls += 1;
      return rawSelection();
    },
    request: {},
    validate: (raw) => ({
      knowledge_id: raw.knowledge_id,
      decision: raw.decision,
      confidence: 0.98
    }),
    defaultModel: 'gpt-5.6-luna'
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'VALID');
  assert.equal(result.interpretation.knowledge_id, 'KNO-TEST-001');
  assert.equal(result.call_count, 1);
  assert.equal(result.usage.model_usage['gpt-5.6-luna'].calls, 1);
});

test('does not retry a deliberate no-match result', async () => {
  let calls = 0;
  const result = await runGuardedInterpretation({
    interpreter: async () => {
      calls += 1;
      return { selection: 'NONE', decision: 'NONE' };
    },
    request: {},
    validate: () => null
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'NO_MATCH');
  assert.equal(result.call_count, 1);
});

test('retries one provider failure and accepts the successful retry', async () => {
  let calls = 0;
  const result = await runGuardedInterpretation({
    interpreter: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      return rawSelection();
    },
    request: {},
    validate: (raw) => ({
      knowledge_id: raw.knowledge_id,
      decision: raw.decision,
      confidence: 0.95
    })
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'VALID');
  assert.deepEqual(result.attempts.map((attempt) => attempt.status), ['ERROR', 'VALID']);
});

test('fails closed after two provider failures', async () => {
  let calls = 0;
  const result = await runGuardedInterpretation({
    interpreter: async () => {
      calls += 1;
      throw new Error('unavailable');
    },
    request: {},
    validate: () => null
  });

  assert.equal(calls, 2);
  assert.equal(result.status, 'ERROR');
  assert.equal(result.interpretation, null);
});
