const MAX_TEST_LOG_ENTRIES = 50;

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function buildRraTestLogEntry(question, result = {}, recordedAt = new Date().toISOString()) {
  return {
    recorded_at: recordedAt,
    question: String(question || '').trim(),
    response_mode: result.response_mode || null,
    displayed_response: {
      answer: result.answer || null,
      answer_structure: result.answer_structure || null,
      more_info: result.more_info || null,
      clarification_prompt: result.clarification_prompt || null,
      clarification_options: list(result.clarification_options).map((option) => ({
        knowledge_id: option.knowledge_id || null,
        label: option.label || null,
        query: option.query || null
      })),
      escalation_message: result.escalation_message || null
    },
    diagnostics: {
      session_id: result.session_id || null,
      interaction_id: result.interaction_id || null,
      confidence: result.confidence ?? null,
      candidates: list(result.candidates),
      trace: list(result.trace),
      interpretation_mode: result.interpretation_mode || null,
      interpretation_result: result.interpretation_result || null
    }
  };
}

export function appendRraTestLogEntry(entries, entry) {
  return [...list(entries), entry].slice(-MAX_TEST_LOG_ENTRIES);
}

export function formatRraTestLog(entries, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    product: 'Ready Route Answers test console',
    exported_at: exportedAt,
    test_count: list(entries).length,
    tests: list(entries)
  }, null, 2);
}

export function summarizeRraTestLogEntry(entry = {}) {
  const response = entry.displayed_response || {};
  return response.answer
    || response.clarification_prompt
    || response.escalation_message
    || 'No displayed response was recorded.';
}
