const {
  normalizeDriverQuestion,
  tokenMatchScore,
  tokenize
} = require('./driverHelpRetrieval');

const REFERENCE_ID = /^([A-Z][A-Z0-9_]*):(\d{1,4})$/;

function isReferenceRecord(record) {
  return REFERENCE_ID.test(String(record?.knowledge_id || ''));
}

function isEligibleReference(record) {
  return ['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED'].includes(record?.status)
    && record?.is_published === true;
}

function referenceParts(record) {
  const match = String(record?.knowledge_id || '').match(REFERENCE_ID);
  return match ? { namespace: match[1], code: match[2] } : null;
}

function normalizedCode(code) {
  return String(Number.parseInt(String(code), 10));
}

function stripConversationalFraming(value) {
  return normalizeDriverQuestion(value)
    .replace(/^(?:please )?help\s+/, '')
    .replace(/^i asked (?:the )?question\s+/, '')
    .trim();
}

function authoredReferenceMatches(question, variant) {
  const questionTokens = tokenize(stripConversationalFraming(question));
  const variantTokens = tokenize(stripConversationalFraming(variant));
  return questionTokens.length === variantTokens.length
    && variantTokens.every((token, index) => tokenMatchScore(token, questionTokens[index]) >= 0.82);
}

function requestedNamespace(question) {
  const normalized = normalizeDriverQuestion(question);
  if (/\b(?:pickup|p u|pu) (?:reason )?code\b|\b(?:pickup )?reason code\b|\bpickup reason\b|\bcode \d{1,4} (?:for )?(?:(?:at|on) (?:a |the )?)?(?:pickup|p u|pu)(?: reason)?\b/.test(normalized)) {
    return 'PICKUP_REASON';
  }
  if (/\b(?:delivery|status) code\b|\bdelivery status\b|\bcode \d{1,4} (?:for )?(?:delivery|status)\b/.test(normalized)) {
    return 'DELIVERY_STATUS';
  }
  return null;
}

function explicitCodeTokens(question) {
  const normalized = normalizeDriverQuestion(question);
  // A driver describing an event and asking whether a code applies needs the
  // operational record evaluated. Treating that as a definition lookup loses
  // the facts the driver already supplied and can create a false ambiguity.
  if (/\b(?:can|could|do|should|would) i (?:apply|choose|select|use) code \d{1,4}\b/.test(normalized)) {
    return [];
  }
  const hasReferenceIntent = (
    /^(?:(?:what|which) (?:is |are )?)?(?:delivery |pickup |status |reason |reference )?code \d/.test(normalized)
    || /\b(?:delivery|pickup|status|reason|reference|p u|pu) code \d/.test(normalized)
    || /\bcode \d{1,4} (?:for )?(?:(?:at|on) (?:a |the )?)?(?:delivery|pickup|status|reason|p u|pu)\b/.test(normalized)
    || /^what does (?:delivery |pickup |status |reason |reference )?code \d{1,4} mean$/.test(normalized)
    || /\b(?:apply|choose|select|use) code \d/.test(normalized)
    || /\bcode \d{1,4} (?:or|versus|vs) \d{1,4}\b/.test(normalized)
  );
  if (!hasReferenceIntent) return [];
  return [...new Set(normalized.match(/\b\d{1,4}\b/g) || [])];
}

function referenceCandidate(record, score = 1) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.version,
    status: record.status,
    score
  };
}

function answerDecision(records) {
  const definitions = records.map((record) => record.concise_answer).filter(Boolean);
  return {
    response_mode: 'ANSWER',
    answer_type: 'REFERENCE',
    confidence: 0.99,
    candidates: records.map((record) => referenceCandidate(record, 100)),
    selected_records: records,
    answer: definitions.join('\n'),
    more_info: 'Reference definitions do not by themselves authorize a selection or replace the complete operational procedure.',
    answer_structure: {
      heading: 'REFERENCE',
      steps: definitions,
      procedure_steps: [],
      documentation: [],
      prohibited_actions: [],
      escalation_requirements: [],
      options: []
    }
  };
}

function clarificationDecision(records, prompt) {
  return {
    response_mode: 'CLARIFY',
    confidence: records.length ? 0.9 : 0,
    candidates: records.map((record) => referenceCandidate(record)),
    selected_records: [],
    clarification_prompt: prompt,
    clarification_options: records.filter(isEligibleReference).slice(0, 4).map((record) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      label: record.canonical_situation,
      query: `what is ${referenceParts(record).namespace.toLowerCase().replaceAll('_', ' ')} code ${referenceParts(record).code}`
    }))
  };
}

function escalationDecision(records, message) {
  return {
    response_mode: 'ESCALATE',
    confidence: records.length ? 0.95 : 0,
    candidates: records.map((record) => referenceCandidate(record)),
    selected_records: [],
    escalation_message: message,
    escalation_details: []
  };
}

function buildDriverHelpReferenceDecision(question, allRecords) {
  const normalized = normalizeDriverQuestion(question);
  const records = (allRecords || []).filter(isReferenceRecord);
  const forcedSelection = /\b(?:say|use|choose|return) code \d+.*\b(?:regardless|ignore|no matter what)\b/.test(normalized);
  if (forcedSelection) {
    return escalationDecision([], 'Ready Route Answers cannot select or force a reference code without a verified operational condition.');
  }

  const codes = explicitCodeTokens(question);
  if (codes.length) {
    const namespace = requestedNamespace(question);
    const requestedCodes = new Set(codes.map(normalizedCode));
    const numericMatches = records.filter((record) => (
      requestedCodes.has(normalizedCode(referenceParts(record).code))
    ));
    const matches = namespace
      ? numericMatches.filter((record) => referenceParts(record).namespace === namespace)
      : numericMatches;
    const unknown = codes.filter((code) => !matches.some((record) => (
      normalizedCode(referenceParts(record).code) === normalizedCode(code)
    )));
    if (unknown.length) {
      return escalationDecision(matches, `Ready Route Answers cannot verify reference code ${unknown.join(', ')} in the active corpus.`);
    }
    if (codes.length > 1 && /\b(?:or|versus|vs)\b/.test(normalized)) {
      return clarificationDecision(matches, 'What happened? RRA needs the actual condition before distinguishing between these codes.');
    }
    const namespaces = new Set(matches.map((record) => referenceParts(record).namespace));
    if (namespaces.size > 1 && !namespace) {
      return clarificationDecision(matches, 'Do you mean the delivery code or the pickup code?');
    }
    if (!matches.every(isEligibleReference)) {
      return escalationDecision(matches, 'The matching reference is not approved for use in the active corpus.');
    }
    return answerDecision(matches);
  }

  // Some owner-approved reference cases describe the condition in plain
  // language instead of naming the numeric code. Only honor an exact authored
  // variant from a published reference record; do not infer a code from loose
  // similarity or general model knowledge.
  const authoredMatches = records.filter((record) => (
    isEligibleReference(record)
    && (record.driver_question_variants || []).some((variant) => (
      authoredReferenceMatches(normalized, variant)
    ))
  ));
  if (authoredMatches.length === 1) return answerDecision(authoredMatches);
  if (authoredMatches.length > 1) {
    return clarificationDecision(
      authoredMatches,
      'What happened? RRA needs the actual condition before distinguishing between these codes.'
    );
  }

  // A scenario followed by “what code should I use?” is an operational
  // question, not a request to define a numbered reference. Let normal
  // operational retrieval evaluate the stated facts.
  return null;
}

module.exports = {
  answerDecision,
  authoredReferenceMatches,
  buildDriverHelpReferenceDecision,
  explicitCodeTokens,
  isReferenceRecord,
  normalizedCode,
  requestedNamespace,
  stripConversationalFraming,
  referenceParts
};
