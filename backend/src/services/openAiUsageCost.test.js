const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateUsageCost } = require('./openAiUsageCost');

test('estimates uncached, cached, and output cost while preserving token counts', () => {
  assert.deepEqual(estimateUsageCost('gpt-5.6-luna', {
    input_tokens: 1_000_000,
    input_tokens_details: { cached_tokens: 250_000 },
    output_tokens: 100_000,
    output_tokens_details: { reasoning_tokens: 25_000 },
    total_tokens: 1_100_000
  }), {
    input_tokens: 1_000_000,
    cached_input_tokens: 250_000,
    output_tokens: 100_000,
    reasoning_tokens: 25_000,
    total_tokens: 1_100_000,
    uncached_input_tokens: 750_000,
    estimated_cost_usd: 0.275,
    pricing: { input: 0.2, cached_input: 0.02, output: 1.2 },
    pricing_as_of: '2026-09-01',
    pricing_source: 'https://developers.openai.com/api/docs/models'
  });
});

test('prices the quality-first Sol primary model', () => {
  const result = estimateUsageCost('gpt-5.6-sol', {
    input_tokens: 1_000_000,
    output_tokens: 100_000
  });
  assert.equal(result.estimated_cost_usd, 6);
  assert.deepEqual(result.pricing, { input: 4, cached_input: 0.4, output: 20 });
});

test('keeps usage auditable when the model has no configured price', () => {
  const result = estimateUsageCost('unknown-model', { input_tokens: 12, output_tokens: 3 });
  assert.equal(result.total_tokens, 15);
  assert.equal(result.estimated_cost_usd, null);
  assert.equal(result.pricing, null);
});
