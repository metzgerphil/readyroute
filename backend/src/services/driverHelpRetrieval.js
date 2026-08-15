const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'at', 'be', 'but', 'can', 'do', 'for', 'from', 'how',
  'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'the', 'this', 'to',
  'was', 'what', 'when', 'where', 'with', 'would', 'you'
]);

const ANSWER_THRESHOLD = 18;
const CLARIFICATION_MARGIN = 6;
const PRODUCTION_ELIGIBLE_STATUSES = new Set(['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED']);
const WITHHELD_STATUSES = new Set([
  'PENDING_REVIEW',
  'POTENTIALLY_OUTDATED',
  'INSUFFICIENT_EVIDENCE'
]);

function normalizeDriverQuestion(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenize(value) {
  return normalizeDriverQuestion(value)
    .split(' ')
    .filter((token) => token && (!STOP_WORDS.has(token) || /^\d+$/.test(token)));
}

function normalizeKnowledgeRecord(row = {}) {
  return {
    ...row,
    version: Number(row.version || 1),
    taxonomy_paths: Array.isArray(row.taxonomy_paths) ? row.taxonomy_paths : [],
    driver_question_variants: Array.isArray(row.driver_question_variants) ? row.driver_question_variants : [],
    driver_question_patterns: Array.isArray(row.driver_question_patterns) ? row.driver_question_patterns : [],
    clarification_requirements: Array.isArray(row.clarification_requirements) ? row.clarification_requirements : [],
    required_procedure: Array.isArray(row.required_procedure) ? row.required_procedure : [],
    required_documentation: Array.isArray(row.required_documentation) ? row.required_documentation : [],
    prohibited_actions: Array.isArray(row.prohibited_actions) ? row.prohibited_actions : [],
    escalation_requirements: Array.isArray(row.escalation_requirements) ? row.escalation_requirements : []
  };
}

function isProductionEligibleRecord(record) {
  return PRODUCTION_ELIGIBLE_STATUSES.has(record?.status) && record?.is_published === true;
}

function selectCanonicalRecordVersions(records) {
  const grouped = new Map();
  for (const rawRecord of records || []) {
    const record = normalizeKnowledgeRecord(rawRecord);
    if (!record.knowledge_id) continue;
    grouped.set(record.knowledge_id, [...(grouped.get(record.knowledge_id) || []), record]);
  }

  return [...grouped.values()].map((versions) => {
    const ordered = versions.sort((left, right) => right.version - left.version);
    const latest = ordered[0];
    if (WITHHELD_STATUSES.has(latest.status)) return latest;
    return ordered.find((record) => (
      record.status === 'READY_ROUTE_APPROVED' && record.is_published === true
    )) || latest;
  });
}

function getRecordSearchSurfaces(record) {
  return [
    { value: record.canonical_situation, weight: 2 },
    { value: record.normalized_description, weight: 1.4 },
    { value: record.authoritative_rule, weight: 0.7 },
    ...(record.driver_question_variants || []).map((value) => ({ value, weight: 2.5 })),
    ...(record.taxonomy_paths || []).map((value) => ({ value, weight: 0.8 }))
  ].filter((surface) => surface.value);
}

function scoreKnowledgeRecord(question, record, context = {}) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const queryTokens = tokenize(normalizedQuestion);
  if (!normalizedQuestion || !queryTokens.length) return 0;

  let best = 0;
  for (const surface of getRecordSearchSurfaces(record)) {
    const normalizedSurface = normalizeDriverQuestion(surface.value);
    const surfaceTokens = tokenize(normalizedSurface);
    if (!surfaceTokens.length) continue;
    const surfaceSet = new Set(surfaceTokens);
    const overlap = queryTokens.filter((token) => surfaceSet.has(token)).length;
    const queryCoverage = overlap / queryTokens.length;
    const surfaceCoverage = overlap / surfaceTokens.length;
    const exact = normalizedQuestion === normalizedSurface ? 70 : 0;
    const contains = queryTokens.length >= 3
      && (normalizedSurface.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedSurface))
      ? 20
      : 0;
    const score = surface.weight * (
      overlap * 5 + queryCoverage * 18 + surfaceCoverage * 10 + exact + contains
    );
    best = Math.max(best, score);
  }

  const contextBoost = (context.knowledge_ids || []).includes(record.knowledge_id) ? 5 : 0;
  return Number((best + contextBoost).toFixed(5));
}

function rankKnowledgeRecords(question, records, context = {}) {
  return selectCanonicalRecordVersions(records)
    .filter((record) => record.knowledge_id && record.canonical_situation)
    .map((record) => ({ record, score: scoreKnowledgeRecord(question, record, context) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => (
      right.score - left.score || left.record.knowledge_id.localeCompare(right.record.knowledge_id)
    ));
}

function getMatchingQuestionPattern(question, record) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  return (record.driver_question_patterns || []).find((pattern) => (
    normalizeDriverQuestion(pattern?.utterance) === normalizedQuestion
  )) || null;
}

function hasExactQuestionVariant(question, record) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  return (record.driver_question_variants || []).some((variant) => (
    normalizeDriverQuestion(variant) === normalizedQuestion
  ));
}

function getPatternRuntimeMode(pattern) {
  if (!pattern) return null;
  if (['ASK_MINIMUM_CLARIFICATION', 'CLARIFY'].includes(pattern.response_mode)) return 'CLARIFY';
  if ([
    'DIRECT_SOURCE_GROUNDED_ANSWER',
    'ALTERNATE_DOCUMENTATION',
    'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY',
    'ANSWER'
  ].includes(pattern.response_mode)) return 'ANSWER';
  return 'ESCALATE';
}

function buildPresentedAnswer(record) {
  return record?.concise_answer || null;
}

function buildAnswerStructure(record) {
  const sentences = (String(buildPresentedAnswer(record) || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return {
    steps: sentences,
    options: [],
    procedure_steps: (record.required_procedure || [])
      .map((item) => String(item?.action || item || '').trim())
      .filter(Boolean),
    documentation: (record.required_documentation || []).map(String).filter(Boolean),
    prohibited_actions: (record.prohibited_actions || []).map(String).filter(Boolean),
    escalation_requirements: (record.escalation_requirements || []).map(String).filter(Boolean)
  };
}

function candidateSummary(ranked) {
  return ranked.slice(0, 5).map(({ record, score }) => ({
    knowledge_id: record.knowledge_id,
    version: record.version,
    canonical_situation: record.canonical_situation,
    score
  }));
}

function clarificationOptions(ranked) {
  return ranked
    .filter(({ record }) => isProductionEligibleRecord(record))
    .slice(0, 4)
    .map(({ record }) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      label: record.canonical_situation,
      query: (record.driver_question_variants || [])[0] || record.canonical_situation
    }));
}

function escalation(candidates = [], confidence = 0, message = null) {
  return {
    response_mode: 'ESCALATE',
    confidence,
    candidates,
    selected_records: [],
    escalation_message: message
      || 'Ready Route Answers does not have a verified answer for this question yet. Contact your manager or station for the current procedure.',
    escalation_details: []
  };
}

function answer(record, candidates, confidence) {
  return {
    response_mode: 'ANSWER',
    confidence,
    candidates,
    selected_records: [record],
    answer: buildPresentedAnswer(record),
    more_info: record.more_info_answer || null,
    answer_structure: buildAnswerStructure(record)
  };
}

function clarify(ranked, candidates, confidence, prompt) {
  return {
    response_mode: 'CLARIFY',
    confidence,
    candidates,
    selected_records: [],
    clarification_prompt: prompt,
    clarification_options: clarificationOptions(ranked)
  };
}

function buildCriticalIntentDecision() {
  // Critical routing is intentionally data-driven in v2. A source-backed record
  // and evaluated question patterns must exist before an intent can answer.
  return null;
}

function buildDriverHelpDecision(question, records, context = {}) {
  const normalizedQuestion = normalizeDriverQuestion(question);
  const bypassRequest = /\b(ignore|invent|pretend)\b/.test(normalizedQuestion);
  const protectedRequest = /\b(hidden|system) (instructions|prompt)\b|\breveal (your )?(instructions|prompt)\b/.test(normalizedQuestion);
  if (!normalizedQuestion || bypassRequest || protectedRequest) return escalation();

  const ranked = rankKnowledgeRecords(question, records, context);
  const candidates = candidateSummary(ranked);
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  if (!top || top.score < ANSWER_THRESHOLD) {
    return escalation(candidates, top ? Math.min(top.score / ANSWER_THRESHOLD, 0.99) : 0);
  }

  const confidence = Math.min(top.score / 100, 0.99);
  if (!isProductionEligibleRecord(top.record)) {
    return escalation(
      candidates,
      confidence,
      `Ready Route Answers found material about “${top.record.canonical_situation},” but it is not approved for a definitive answer. Contact your manager or station for the current procedure.`
    );
  }

  const pattern = getMatchingQuestionPattern(question, top.record);
  const patternMode = getPatternRuntimeMode(pattern);
  if (patternMode === 'ESCALATE') return escalation(candidates, confidence);
  if (patternMode === 'CLARIFY') {
    const requirement = pattern.must_clarify?.[0]
      || top.record.clarification_requirements[0]
      || 'one more detail about the situation';
    return clarify(ranked, candidates, confidence, `Ready Route Answers needs one detail: ${requirement}.`);
  }
  if (patternMode === 'ANSWER' || hasExactQuestionVariant(question, top.record)) {
    return answer(top.record, candidates, confidence);
  }

  if (top.record.clarification_requirements.length) {
    return clarify(
      ranked,
      candidates,
      confidence,
      `Ready Route Answers needs one detail: ${top.record.clarification_requirements[0]}.`
    );
  }

  const ambiguous = second
    && second.score >= ANSWER_THRESHOLD
    && top.score - second.score <= CLARIFICATION_MARGIN
    && second.record.knowledge_id !== top.record.knowledge_id;
  if (ambiguous) {
    return clarify(ranked, candidates, confidence, 'Which situation best matches what is happening?');
  }

  if (tokenize(question).length <= 2) {
    return clarify(ranked, candidates, confidence, 'Please add one more detail about the situation.');
  }

  return answer(top.record, candidates, confidence);
}

module.exports = {
  ANSWER_THRESHOLD,
  CLARIFICATION_MARGIN,
  buildAnswerStructure,
  buildCriticalIntentDecision,
  buildDriverHelpDecision,
  buildPresentedAnswer,
  getMatchingQuestionPattern,
  getPatternRuntimeMode,
  isProductionEligibleRecord,
  normalizeDriverQuestion,
  rankKnowledgeRecords,
  scoreKnowledgeRecord,
  selectCanonicalRecordVersions,
  tokenize
};
