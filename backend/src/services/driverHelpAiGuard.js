const { estimateUsageCost } = require('./openAiUsageCost');

const DEFAULT_MAXIMUM_ATTEMPTS = 2;

function emptyUsage() {
  return {
    input_tokens: 0,
    cached_input_tokens: 0,
    uncached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    pricing_complete: true,
    model_usage: {}
  };
}

function aggregateUsage(current, providerMetadata, defaultModel) {
  if (!providerMetadata?.usage) return current;
  const model = providerMetadata.provider_model || defaultModel || 'unknown';
  const usage = estimateUsageCost(model, providerMetadata.usage);
  const modelUsage = current.model_usage[model] || {
    calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    pricing_complete: true
  };
  modelUsage.calls += 1;
  modelUsage.input_tokens += Number(usage.input_tokens || 0);
  modelUsage.output_tokens += Number(usage.output_tokens || 0);
  modelUsage.total_tokens += Number(usage.total_tokens || 0);
  if (usage.estimated_cost_usd === null) modelUsage.pricing_complete = false;
  else modelUsage.estimated_cost_usd += Number(usage.estimated_cost_usd || 0);

  return {
    input_tokens: current.input_tokens + Number(usage.input_tokens || 0),
    cached_input_tokens: current.cached_input_tokens + Number(usage.cached_input_tokens || 0),
    uncached_input_tokens: current.uncached_input_tokens + Number(usage.uncached_input_tokens || 0),
    output_tokens: current.output_tokens + Number(usage.output_tokens || 0),
    reasoning_tokens: current.reasoning_tokens + Number(usage.reasoning_tokens || 0),
    total_tokens: current.total_tokens + Number(usage.total_tokens || 0),
    estimated_cost_usd: usage.estimated_cost_usd === null
      ? current.estimated_cost_usd
      : current.estimated_cost_usd + Number(usage.estimated_cost_usd || 0),
    pricing_complete: current.pricing_complete && usage.estimated_cost_usd !== null,
    model_usage: {
      ...current.model_usage,
      [model]: modelUsage
    }
  };
}

function finalizeUsage(usage) {
  const finalized = {
    ...usage,
    estimated_cost_usd: Number(usage.estimated_cost_usd.toFixed(8)),
    model_usage: { ...usage.model_usage }
  };
  for (const [model, modelUsage] of Object.entries(finalized.model_usage)) {
    finalized.model_usage[model] = {
      ...modelUsage,
      estimated_cost_usd: Number(modelUsage.estimated_cost_usd.toFixed(8))
    };
  }
  return finalized;
}

async function runGuardedInterpretation({
  interpreter,
  request,
  validate,
  maximumAttempts = DEFAULT_MAXIMUM_ATTEMPTS,
  defaultModel = null
}) {
  if (typeof interpreter !== 'function') {
    return {
      status: 'UNAVAILABLE',
      interpretation: null,
      attempts: [],
      call_count: 0,
      usage: emptyUsage(),
      accepted_provider_metadata: null
    };
  }

  const attempts = [];
  let usage = emptyUsage();
  const boundedAttempts = Math.max(1, Math.min(Number(maximumAttempts) || 1, 2));

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const raw = await interpreter(request);
      usage = aggregateUsage(usage, raw?.provider_metadata, defaultModel);
      const interpretation = validate(raw);
      const noMatch = raw?.selection === 'NONE' || raw?.decision === 'NONE';
      const status = interpretation ? 'VALID' : (noMatch ? 'NO_MATCH' : 'REJECTED');
      attempts.push({
        attempt,
        status,
        latency_ms: Math.max(0, Date.now() - startedAt),
        knowledge_id: interpretation?.knowledge_id || null,
        decision: interpretation?.decision || null,
        confidence: interpretation?.confidence ?? null,
        provider_model: raw?.provider_metadata?.provider_model || null,
        provider_response_id: raw?.provider_metadata?.response_id || null
      });

      if (interpretation) {
        return {
          status: 'VALID',
          interpretation,
          attempts,
          call_count: attempts.length,
          usage: finalizeUsage(usage),
          accepted_provider_metadata: raw?.provider_metadata || null
        };
      }

      // A completed structured response that says no match, or fails local
      // validation, is a safety result. Only provider failures are retried.
      return {
        status,
        interpretation: null,
        attempts,
        call_count: attempts.length,
        usage: finalizeUsage(usage),
        accepted_provider_metadata: null
      };
    } catch (error) {
      attempts.push({
        attempt,
        status: 'ERROR',
        latency_ms: Math.max(0, Date.now() - startedAt),
        error_name: error?.name || 'Error',
        provider_status: error?.status || null,
        provider_code: error?.provider_code || null
      });
      if (attempt === boundedAttempts) {
        return {
          status: 'ERROR',
          interpretation: null,
          attempts,
          call_count: attempts.length,
          usage: finalizeUsage(usage),
          accepted_provider_metadata: null
        };
      }
    }
  }

  throw new Error('Guarded interpretation ended without a result');
}

module.exports = {
  DEFAULT_MAXIMUM_ATTEMPTS,
  aggregateUsage,
  emptyUsage,
  finalizeUsage,
  runGuardedInterpretation
};
