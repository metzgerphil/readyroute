const PRICING_AS_OF = '2026-09-01';
const PRICING_SOURCE = 'https://developers.openai.com/api/docs/models';

// USD per one million text tokens. Keep the raw token counts in every report
// so historical runs can be recalculated if provider pricing changes.
const MODEL_PRICING = Object.freeze({
  'gpt-5.6-sol': Object.freeze({
    input: 4,
    cached_input: 0.4,
    output: 20
  }),
  'gpt-5.6-terra': Object.freeze({
    input: 2,
    cached_input: 0.2,
    output: 12
  }),
  'gpt-5.6-luna': Object.freeze({
    input: 0.2,
    cached_input: 0.02,
    output: 1.2
  })
});

function normalizeUsage(usage = {}) {
  const inputTokens = Number(usage.input_tokens || 0);
  const cachedInputTokens = Number(usage.input_tokens_details?.cached_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens || 0);
  const totalTokens = Number(usage.total_tokens || (inputTokens + outputTokens));

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    total_tokens: totalTokens
  };
}

function estimateUsageCost(model, usage = {}) {
  const normalized = normalizeUsage(usage);
  const pricing = MODEL_PRICING[model] || null;
  if (!pricing) {
    return {
      ...normalized,
      estimated_cost_usd: null,
      pricing: null,
      pricing_as_of: PRICING_AS_OF,
      pricing_source: PRICING_SOURCE
    };
  }

  const uncachedInputTokens = Math.max(0, normalized.input_tokens - normalized.cached_input_tokens);
  const estimatedCost = (
    (uncachedInputTokens * pricing.input)
    + (normalized.cached_input_tokens * pricing.cached_input)
    + (normalized.output_tokens * pricing.output)
  ) / 1_000_000;

  return {
    ...normalized,
    uncached_input_tokens: uncachedInputTokens,
    estimated_cost_usd: Number(estimatedCost.toFixed(8)),
    pricing,
    pricing_as_of: PRICING_AS_OF,
    pricing_source: PRICING_SOURCE
  };
}

module.exports = {
  MODEL_PRICING,
  PRICING_AS_OF,
  PRICING_SOURCE,
  estimateUsageCost,
  normalizeUsage
};
