const { ALLOWED_SOURCE_PATHS } = require('./driverHelpGroundedComposition');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 8000;

function enabled(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return null;
}

function responseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      selection: { type: 'string', enum: ['COMPOSED', 'NONE'] },
      answer: { type: 'string' },
      more_info: { type: ['string', 'null'] },
      answer_structure: { type: 'null' },
      grounding: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            output_path: { type: 'string', enum: ['answer', 'more_info'] },
            knowledge_id: { type: 'string' },
            source_paths: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: [...ALLOWED_SOURCE_PATHS] }
            }
          },
          required: ['output_path', 'knowledge_id', 'source_paths']
        }
      }
    },
    required: ['selection', 'answer', 'more_info', 'answer_structure', 'grounding']
  };
}

function createDriverHelpAiComposer(options = {}) {
  const env = options.env || process.env;
  if (!enabled(env.READYROUTE_DRIVER_HELP_AI_ENABLED)) return null;

  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const model = String(env.READYROUTE_DRIVER_HELP_MODEL || '').trim();
  if (!apiKey || !model) return null;

  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') return null;

  const baseUrl = String(env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const configuredTimeout = Number(env.READYROUTE_DRIVER_HELP_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;

  return async function composeGroundedAnswer(request) {
    const safetyIdentifier = String(request?.safety_identifier || '').trim() || undefined;
    const modelRequest = { ...request };
    delete modelRequest.safety_identifier;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {}),
          reasoning: {
            effort: 'low'
          },
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: [
                    'You present Ready Route operational answers to trained drivers.',
                    'Use only facts explicitly present in canonical_records or deterministic_answer.',
                    'Never add a code, number, step, condition, exception, prohibition, escalation, or factual claim.',
                    'Answer the driver\'s precise question directly in one or two short sentences.',
                    'Use deterministic_answer as the preferred factual baseline and preserve every required action and prohibition.',
                    'Do not repeat the full procedure because the application presents verified steps separately.',
                    'You may paraphrase, shorten, organize, or combine supported content for clarity.',
                    'Ground each populated output to the exact selected knowledge_id and source fields.',
                    'Set answer_structure to null; the application preserves its verified deterministic structure.',
                    'If a safe improvement is not possible, select NONE.'
                  ].join(' ')
                }
              ]
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: JSON.stringify(modelRequest) }]
            }
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'ready_route_grounded_answer',
              strict: true,
              schema: responseSchema()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Grounded composer request failed with status ${response.status}`);
      }
      const body = await response.json();
      const text = outputText(body);
      if (!text) throw new Error('Grounded composer returned no structured output');
      const payload = JSON.parse(text);
      payload.provider_metadata = {
        response_id: body.id || null,
        request_id: response.headers?.get?.('x-request-id') || null,
        usage: body.usage || null
      };
      return payload;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = {
  createDriverHelpAiComposer,
  outputText,
  responseSchema
};
