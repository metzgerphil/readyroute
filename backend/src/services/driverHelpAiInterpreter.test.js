const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDriverHelpAiInterpreter,
  resolveDriverHelpAiInterpretationMode,
  responseSchema,
  validateInterpretation
} = require('./driverHelpAiInterpreter');

const candidates = [{
  knowledge_id: 'KNO-PUP-CANCELED-001',
  version: 1,
  canonical_situation: 'A listed pickup is canceled or has no packages',
  clarification_requirements: ['Was any attempt made at the pickup location?']
}];

const configuredEnv = {
  READYROUTE_DRIVER_HELP_AI_INTERPRETATION_ENABLED: 'true',
  READYROUTE_DRIVER_HELP_MODEL: 'test-model',
  OPENAI_API_KEY: 'test-key'
};

test('AI interpretation stays disabled unless separately enabled with credentials', () => {
  assert.equal(createDriverHelpAiInterpreter({ env: {} }), null);
  assert.equal(createDriverHelpAiInterpreter({
    env: {
      READYROUTE_DRIVER_HELP_AI_INTERPRETATION_ENABLED: 'true',
      OPENAI_API_KEY: 'test-key'
    }
  }), null);
});

test('explicit shadow mode enables the interpreter without enabling active answer selection', () => {
  assert.equal(resolveDriverHelpAiInterpretationMode({
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE: 'shadow'
  }), 'SHADOW');
  assert.equal(resolveDriverHelpAiInterpretationMode({
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE: 'off',
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_ENABLED: 'true'
  }), 'OFF');
  assert.equal(resolveDriverHelpAiInterpretationMode({
    READYROUTE_DRIVER_HELP_AI_INTERPRETATION_ENABLED: 'true'
  }), 'ACTIVE');
});

test('AI interpretation sends only constrained routing fields with a strict schema', async () => {
  const calls = [];
  const interpreter = createDriverHelpAiInterpreter({
    env: configuredEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              selection: 'SELECT',
              knowledge_id: 'KNO-PUP-CANCELED-001',
              decision: 'CLARIFY',
              clarification_requirement: 'Was any attempt made at the pickup location?',
              confidence: 0.91
            })
          };
        }
      };
    }
  });

  const request = {
    safety_identifier: 'rr_test-user',
    driver_question: 'pickup cancelled',
    candidate_records: candidates
  };
  const result = await interpreter(request);
  const requestBody = JSON.parse(calls[0].options.body);

  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestBody.safety_identifier, 'rr_test-user');
  assert.doesNotMatch(requestBody.input[1].content[0].text, /rr_test-user/);
  assert.match(requestBody.input[0].content[0].text, /tobacco is not alcohol/i);
  assert.match(requestBody.input[0].content[0].text, /Return NONE when the stated subject is not covered/i);
  assert.match(requestBody.input[0].content[0].text, /reserve NONE for questions whose situation does not safely match/i);
  assert.match(requestBody.input[0].content[0].text, /do not return NONE merely because the subtype is not yet known/i);
  assert.equal(requestBody.text.format.strict, true);
  assert.deepEqual(requestBody.text.format.schema, responseSchema(candidates));
  assert.equal(result.decision, 'CLARIFY');
});

test('interpretation validation accepts only eligible candidates and exact clarification requirements', () => {
  assert.deepEqual(validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-PUP-CANCELED-001',
    decision: 'CLARIFY',
    clarification_requirement: 'Was any attempt made at the pickup location?',
    confidence: 0.9
  }, candidates), {
    selection: 'SELECT',
    knowledge_id: 'KNO-PUP-CANCELED-001',
    decision: 'CLARIFY',
    clarification_requirement: 'Was any attempt made at the pickup location?',
    confidence: 0.9
  });

  assert.equal(validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-NOT-SUPPLIED',
    decision: 'ANSWER',
    clarification_requirement: null,
    confidence: 0.99
  }, candidates), null);
  assert.equal(validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-PUP-CANCELED-001',
    decision: 'CLARIFY',
    clarification_requirement: 'Ask anything you want',
    confidence: 0.99
  }, candidates), null);
  assert.equal(validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-PUP-CANCELED-001',
    decision: 'ANSWER',
    clarification_requirement: null,
    confidence: 0.74
  }, candidates), null);
});

test('provider failures remain catchable for deterministic fallback', async () => {
  const interpreter = createDriverHelpAiInterpreter({
    env: configuredEnv,
    fetchImpl: async () => ({ ok: false, status: 503 })
  });
  await assert.rejects(
    () => interpreter({ driver_question: 'pickup cancelled', candidate_records: candidates }),
    /status 503/
  );
});
