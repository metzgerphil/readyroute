const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDriverHelpAiComposer,
  responseSchema
} = require('./driverHelpAiComposer');

const configuredEnv = {
  READYROUTE_DRIVER_HELP_AI_ENABLED: 'true',
  READYROUTE_DRIVER_HELP_MODEL: 'test-model',
  OPENAI_API_KEY: 'test-key'
};

test('stays disabled unless explicitly enabled with a model and API key', () => {
  assert.equal(createDriverHelpAiComposer({ env: {} }), null);
  assert.equal(createDriverHelpAiComposer({
    env: { READYROUTE_DRIVER_HELP_AI_ENABLED: 'true', OPENAI_API_KEY: 'key' }
  }), null);
});

test('uses strict structured output and returns a grounded composition', async () => {
  const calls = [];
  const composer = createDriverHelpAiComposer({
    env: configuredEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              selection: 'COMPOSED',
              answer: 'Use code 006 and keep the package with you.',
              more_info: null,
              answer_structure: null,
              grounding: [{
                output_path: 'answer',
                knowledge_id: 'KNO-006',
                source_paths: ['concise_answer']
              }]
            })
          };
        }
      };
    }
  });

  const result = await composer({ canonical_records: [], deterministic_answer: {} });
  const requestBody = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requestBody.model, 'test-model');
  assert.equal(requestBody.text.format.strict, true);
  assert.deepEqual(requestBody.text.format.schema, responseSchema());
  assert.equal(result.selection, 'COMPOSED');
});

test('returns NONE when the model declines to compose', async () => {
  const composer = createDriverHelpAiComposer({
    env: configuredEnv,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          output_text: JSON.stringify({
            selection: 'NONE',
            answer: '',
            more_info: null,
            answer_structure: null,
            grounding: []
          })
        };
      }
    })
  });
  assert.equal(await composer({}), 'NONE');
});

test('rejects provider errors and malformed responses for deterministic fallback upstream', async () => {
  const providerError = createDriverHelpAiComposer({
    env: configuredEnv,
    fetchImpl: async () => ({ ok: false, status: 503 })
  });
  const malformed = createDriverHelpAiComposer({
    env: configuredEnv,
    fetchImpl: async () => ({ ok: true, async json() { return {}; } })
  });

  await assert.rejects(() => providerError({}), /status 503/);
  await assert.rejects(() => malformed({}), /no structured output/);
});
