const ALLOWED_SOURCE_PATHS = new Set([
  'authoritative_rule',
  'concise_answer',
  'more_info_answer',
  'required_procedure',
  'required_documentation',
  'prohibited_actions',
  'escalation_requirements'
]);

const ELIGIBLE_STATUSES = new Set(['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEligible(record) {
  return Boolean(record && ELIGIBLE_STATUSES.has(record.status) && record.is_published === true);
}

function hasContent(value) {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(hasContent);
  if (isPlainObject(value)) return Object.values(value).some(hasContent);
  return value !== null && value !== undefined;
}

function sourceText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(sourceText).join(' ');
  if (isPlainObject(value)) return Object.values(value).map(sourceText).join(' ');
  return '';
}

function buildGroundingSources(records) {
  return records.map((record) => ({
    knowledge_id: record.knowledge_id,
    canonical_version: record.version,
    knowledge_status: record.status,
    authoritative_rule: record.authoritative_rule || null,
    concise_answer: record.concise_answer || null,
    more_info_answer: record.more_info_answer || null,
    required_procedure: record.required_procedure || [],
    required_documentation: record.required_documentation || [],
    prohibited_actions: record.prohibited_actions || [],
    escalation_requirements: record.escalation_requirements || []
  }));
}

function extractOperationalNumbers(value) {
  const matches = sourceText(value).match(/\b\d+(?:\.\d+)*\b/g) || [];
  return new Set(matches.map((match) => match.replace(/^0+(?=\d)/, '')));
}

function validateRequiredAnswerPatterns(payload, requiredPatterns = []) {
  if (!requiredPatterns.length) return { valid: true, reason: null };
  const output = sourceText({
    answer: payload.answer,
    more_info: payload.more_info,
    answer_structure: payload.answer_structure
  });
  for (const pattern of requiredPatterns) {
    if (!new RegExp(pattern, 'i').test(output)) {
      return { valid: false, reason: 'missing_required_driver_instruction' };
    }
  }
  return { valid: true, reason: null };
}

function validateGroundingEntry(entry, recordById) {
  if (!isPlainObject(entry) || typeof entry.output_path !== 'string') return false;
  const record = recordById.get(entry.knowledge_id);
  if (!record) return false;
  const paths = Array.isArray(entry.source_paths)
    ? entry.source_paths
    : (typeof entry.source_path === 'string' ? [entry.source_path] : []);
  if (!paths.length) return false;
  return paths.every((path) => ALLOWED_SOURCE_PATHS.has(path) && hasContent(record[path]));
}

function validateGroundedComposition(payload, selectedRecords) {
  if (!isPlainObject(payload) || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    return { valid: false, reason: 'invalid_answer' };
  }
  if (!Array.isArray(selectedRecords) || !selectedRecords.length || selectedRecords.some((record) => !isEligible(record))) {
    return { valid: false, reason: 'ineligible_source' };
  }
  if (!Array.isArray(payload.grounding) || !payload.grounding.length) {
    return { valid: false, reason: 'missing_grounding' };
  }

  const recordById = new Map(selectedRecords.map((record) => [record.knowledge_id, record]));
  if (payload.grounding.some((entry) => !validateGroundingEntry(entry, recordById))) {
    return { valid: false, reason: 'invalid_grounding' };
  }

  const coveredPaths = new Set(payload.grounding.map((entry) => entry.output_path));
  if (!coveredPaths.has('answer')) return { valid: false, reason: 'ungrounded_answer' };
  if (hasContent(payload.more_info) && !coveredPaths.has('more_info')) {
    return { valid: false, reason: 'ungrounded_more_info' };
  }
  if (isPlainObject(payload.answer_structure)) {
    for (const [key, value] of Object.entries(payload.answer_structure)) {
      if (hasContent(value) && !coveredPaths.has(`answer_structure.${key}`)) {
        return { valid: false, reason: `ungrounded_answer_structure_${key}` };
      }
    }
  }

  const supportedNumbers = extractOperationalNumbers(buildGroundingSources(selectedRecords));
  const outputNumbers = extractOperationalNumbers({
    answer: payload.answer,
    more_info: payload.more_info,
    answer_structure: payload.answer_structure
  });
  for (const number of outputNumbers) {
    if (!supportedNumbers.has(number)) {
      return { valid: false, reason: 'unsupported_operational_number' };
    }
  }
  return { valid: true, reason: null };
}

function deterministicFallback(decision, reason = null) {
  return {
    ...decision,
    composition_mode: reason ? 'DETERMINISTIC_FALLBACK' : 'DETERMINISTIC',
    composition_grounding: [],
    composition_validation: reason ? { valid: false, reason } : null
  };
}

async function composeGroundedDecision(decision, composer, options = {}) {
  if (
    typeof composer !== 'function'
    || decision?.response_mode !== 'ANSWER'
    || decision?.answer_type === 'REFERENCE'
    || !decision.selected_records?.length
  ) {
    return deterministicFallback(decision);
  }
  if (decision.selected_records.some((record) => !isEligible(record))) {
    return deterministicFallback(decision, 'ineligible_source');
  }

  const request = {
    task: 'Answer the driver\'s precise question naturally and concisely using only the supplied canonical records.',
    safety_identifier: options.safetyIdentifier || null,
    driver_question: options.driverQuestion || null,
    conversation_context: options.conversationContext || {},
    rules: [
      'Do not add operational facts, steps, codes, numbers, conditions, exceptions, or escalation instructions that are absent from the supplied records.',
      'Lead with a direct response to the actual question in one or two short sentences.',
      'Use the deterministic answer as the preferred factual baseline and do not weaken its prohibitions or required actions.',
      'Do not repeat the full ordered procedure; the application presents verified procedure steps separately.',
      'You may paraphrase, organize, and combine supported material for clarity.',
      'Return JSON only with answer, more_info, answer_structure, and grounding.',
      'Ground every populated output section to a selected knowledge_id and one or more exact source field paths.',
      'If the records do not support a safe answer, return NONE.'
    ],
    required_grounding_format: {
      output_path: 'answer',
      knowledge_id: 'selected knowledge_id',
      source_paths: ['concise_answer']
    },
    canonical_records: buildGroundingSources(decision.selected_records),
    deterministic_answer: {
      answer: decision.answer || null,
      more_info: decision.more_info || null,
      answer_structure: decision.answer_structure || null
    }
  };

  let payload;
  try {
    payload = await composer(request);
  } catch (_error) {
    return deterministicFallback(decision, 'composer_error');
  }
  if (payload === 'NONE' || payload?.selection === 'NONE') {
    return deterministicFallback(decision, 'composer_declined');
  }
  const validation = validateGroundedComposition(payload, decision.selected_records);
  if (!validation.valid) return deterministicFallback(decision, validation.reason);
  const instructionValidation = validateRequiredAnswerPatterns(
    payload,
    decision.required_answer_patterns || []
  );
  if (!instructionValidation.valid) {
    return deterministicFallback(decision, instructionValidation.reason);
  }

  return {
    ...decision,
    answer: payload.answer.trim(),
    more_info: hasContent(payload.more_info) ? payload.more_info : null,
    answer_structure: isPlainObject(decision.answer_structure)
      ? {
          ...decision.answer_structure,
          direct_answer: payload.answer.trim()
        }
      : (isPlainObject(payload.answer_structure) ? payload.answer_structure : null),
    composition_mode: 'GROUNDED_AI',
    composition_grounding: payload.grounding,
    composition_validation: validation
  };
}

module.exports = {
  ALLOWED_SOURCE_PATHS,
  buildGroundingSources,
  composeGroundedDecision,
  validateGroundedComposition,
  validateRequiredAnswerPatterns
};
