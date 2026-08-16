const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDriverHelpAiInterpreter,
  emptyFacts,
  matchesExplicitOutOfCorpusException,
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
            id: 'resp_test_123',
            output_text: JSON.stringify({
              selection: 'SELECT',
              knowledge_id: 'KNO-PUP-CANCELED-001',
              decision: 'CLARIFY',
              answer_pattern_id: null,
              clarification_requirement: 'Was any attempt made at the pickup location?',
              facts: {
                ...emptyFacts(),
                operational_area: 'PICKUP'
              },
              confidence: 0.91
            }),
            usage: {
              input_tokens: 120,
              input_tokens_details: { cached_tokens: 20 },
              output_tokens: 30,
              output_tokens_details: { reasoning_tokens: 10 },
              total_tokens: 150
            }
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
  assert.deepEqual(requestBody.reasoning, { effort: 'low', context: 'current_turn' });
  assert.equal(requestBody.text.verbosity, 'low');
  assert.equal(requestBody.text.format.strict, true);
  assert.deepEqual(requestBody.text.format.schema, responseSchema(candidates));
  assert.equal(result.decision, 'CLARIFY');
  assert.equal(result.facts.operational_area, 'PICKUP');
  assert.equal(result.provider_metadata.response_id, 'resp_test_123');
  assert.equal(result.provider_metadata.usage.input_tokens, 120);
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
    answer_pattern_id: null,
    clarification_requirement: 'Was any attempt made at the pickup location?',
    facts: emptyFacts(),
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

test('generic signature-package questions always collect the signature service first', () => {
  const signatureCandidates = [
    {
      knowledge_id: 'KNO-DEL-SIG-ASR-001',
      clarification_requirements: ['Was valid government ID presented?'],
      driver_question_patterns: []
    },
    {
      knowledge_id: 'KNO-DEL-SIG-DSR-001',
      clarification_requirements: ['What signature service does FORGE show?'],
      driver_question_patterns: []
    }
  ];
  const result = validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-DEL-SIG-ASR-001',
    decision: 'CLARIFY',
    answer_pattern_id: null,
    clarification_requirement: 'Was valid government ID presented?',
    facts: { recipient_present: 'NO' },
    confidence: 0.96
  }, signatureCandidates, undefined, 'I have a signature package and nobody is home.');

  assert.equal(result.knowledge_id, 'KNO-DEL-SIG-DSR-001');
  assert.equal(result.decision, 'CLARIFY');
  assert.equal(result.clarification_requirement, 'What signature service does FORGE show?');
  assert.equal(result.facts.recipient_present, 'NO');
});

test('a verbal shipper claim cannot override an explicit signature requirement', () => {
  const shipperCandidate = {
    knowledge_id: 'KNO-DEL-SHIPPER-RELEASE-001',
    clarification_requirements: [],
    driver_question_patterns: [{
      pattern_id: 'KNO-DEL-SHIPPER-RELEASE-001::2',
      utterance: 'The customer says the shipper told them I can just leave it, no signature needed. Is that true?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
    }]
  };
  const signatureCandidate = {
    knowledge_id: 'KNO-DEL-SIG-DSR-001',
    clarification_requirements: ['What signature service does FORGE show?'],
    driver_question_patterns: []
  };
  const result = validateInterpretation({
    selection: 'SELECT',
    knowledge_id: signatureCandidate.knowledge_id,
    decision: 'CLARIFY',
    answer_pattern_id: null,
    clarification_requirement: 'What signature service does FORGE show?',
    facts: { signature_service: 'UNKNOWN' },
    confidence: 0.97
  }, [signatureCandidate, shipperCandidate], undefined,
  'The package says signature required, but the customer says the shipper told me to leave it.');

  assert.equal(result.knowledge_id, shipperCandidate.knowledge_id);
  assert.equal(result.decision, 'ANSWER');
  assert.equal(result.answer_pattern_id, 'KNO-DEL-SHIPPER-RELEASE-001::2');
});

test('explicit out-of-corpus exceptions reject a model selection that crosses the boundary', () => {
  const placementCandidates = [{
    knowledge_id: 'KNO-DEL-PLACEMENT-HAZARD-001',
    exceptions: ['[OUT_OF_CORPUS] package inside customer garage'],
    clarification_requirements: ['Is the package eligible for driver release?']
  }];
  const question = "Can I leave this package inside a customer's garage?";
  assert.equal(matchesExplicitOutOfCorpusException(question, placementCandidates[0]), true);
  assert.equal(validateInterpretation({
    selection: 'SELECT',
    knowledge_id: 'KNO-DEL-PLACEMENT-HAZARD-001',
    decision: 'CLARIFY',
    clarification_requirement: 'Is the package eligible for driver release?',
    confidence: 0.99
  }, placementCandidates, undefined, question), null);
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

test('provider failures preserve safe rate-limit diagnostics', async () => {
  const interpreter = createDriverHelpAiInterpreter({
    env: configuredEnv,
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: {
        get(name) {
          return {
            'x-request-id': 'req_test_123',
            'x-ratelimit-remaining-tokens': '0',
            'x-ratelimit-reset-tokens': '45s'
          }[name] || null;
        }
      },
      async text() {
        return JSON.stringify({
          error: {
            code: 'rate_limit_exceeded',
            type: 'tokens',
            message: 'Please retry after the token window resets.'
          }
        });
      }
    })
  });

  await assert.rejects(
    () => interpreter({ driver_question: 'pickup cancelled', candidate_records: candidates }),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.provider_code, 'rate_limit_exceeded');
      assert.equal(error.provider_type, 'tokens');
      assert.equal(error.request_id, 'req_test_123');
      assert.equal(error.rate_limit.remaining_tokens, '0');
      assert.equal(error.rate_limit.reset_tokens, '45s');
      return true;
    }
  );
});
