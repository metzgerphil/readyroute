const crypto = require('crypto');

const defaultSupabase = require('../lib/supabase');
const {
  buildAnswerStructure,
  buildClarificationPrompt,
  clarificationOptionsForRequirement,
  buildDriverHelpDecision,
  buildPresentedAnswer,
  formatDriverCodeTerminology,
  getMatchingQuestionPattern,
  isProductionEligibleRecord,
  normalizeDriverQuestion,
  rankKnowledgeRecords,
  requirementMatches,
  selectCanonicalRecordVersions,
  tokenize
} = require('./driverHelpRetrieval');
const {
  buildDriverHelpReferenceDecision,
  isReferenceRecord
} = require('./driverHelpReference');
const {
  createDriverHelpAiInterpreter,
  resolveDriverHelpAiInterpretationMode,
  validateInterpretation
} = require('./driverHelpAiInterpreter');
const {
  createSignedStorageUrl,
  getSignedUrlTtlSeconds
} = require('./privateStorage');
const { estimateUsageCost } = require('./openAiUsageCost');
const {
  redactConversationContextForAi,
  redactTextForAi
} = require('./driverHelpPrivacy');

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST106', 'PGRST204', 'PGRST205']);

const HIGH_RISK_MEMORY_KNOWLEDGE_IDS = new Set([
  'KNO-DEL-ALCOHOL-001',
  'KNO-DEL-ANIMAL-HAZARD-001',
  'KNO-DEL-HAZMAT-SIGNATURE-001',
  'KNO-DEL-SIG-ASR-001',
  'KNO-DEL-SIG-DSR-001',
  'KNO-DEL-SIG-ISR-001',
  'KNO-HOS-DUTY-LIMITS-001',
  'KNO-SEC-ACTIVE-THREAT-001',
  'KNO-SEC-ROUTE-001'
]);

function isMissingTableError(error) {
  return Boolean(error && MISSING_TABLE_CODES.has(error.code));
}

function randomId() {
  return crypto.randomUUID();
}

function answerMemoryRouteKey(question) {
  return crypto.createHash('sha256')
    .update(normalizeDriverQuestion(question))
    .digest('hex');
}

function answerMemoryRiskTier(knowledgeId) {
  return HIGH_RISK_MEMORY_KNOWLEDGE_IDS.has(String(knowledgeId || '')) ? 'HIGH' : 'STANDARD';
}

function resolveAnswerMemoryAuditRate(env = process.env) {
  const configured = Number(env.READYROUTE_DRIVER_HELP_ANSWER_MEMORY_AUDIT_RATE);
  if (!Number.isFinite(configured)) return 0;
  return Math.min(Math.max(configured, 0), 1);
}

function answerMemoryInterpretationAgrees(memory, interpretation) {
  return Boolean(memory && interpretation
    && memory.knowledge_id === interpretation.knowledge_id
    && memory.response_mode === interpretation.decision
    && String(memory.answer_pattern_id || '') === String(interpretation.answer_pattern_id || '')
    && String(memory.clarification_requirement || '') === String(interpretation.clarification_requirement || ''));
}

function isAnswerMemoryEligibleQuestion(question, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  return Boolean(
    normalized.length >= 4
    && !context.pending_clarification_prompt
    && !isProtectedInterpretationRequest(normalized)
  );
}

function buildAiSafetyIdentifier(accountId, actorType, actorId) {
  return `rr_${crypto.createHash('sha256')
    .update(`${accountId}:${actorType}:${actorId}`)
    .digest('hex')
    .slice(0, 61)}`;
}

function resolveClarificationSelection(question, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const options = Array.isArray(context.pending_clarification_options)
    ? context.pending_clarification_options
    : [];
  const exact = options.find((option) => (
    normalizeDriverQuestion(option?.label) === normalized
    || normalizeDriverQuestion(option?.query) === normalized
  ));
  if (exact) return exact;

  const requirement = normalizeDriverQuestion(
    context.pending_clarification_requirement || context.pending_clarification_prompt
  );
  if (/before or after dispatch/.test(requirement)) {
    if (/\bbefore(?: dispatch)?\b/.test(normalized)) {
      return options.find((option) => /\bbefore dispatch\b/.test(
        normalizeDriverQuestion(`${option?.label || ''} ${option?.query || ''}`)
      )) || null;
    }
    if (/\bafter(?: dispatch)?\b/.test(normalized)) {
      return options.find((option) => /\bafter dispatch\b/.test(
        normalizeDriverQuestion(`${option?.label || ''} ${option?.query || ''}`)
      )) || null;
    }
  }
  if (/completed delivery photo or an unsuccessful attempt photo/.test(requirement)) {
    if (/\bcompleted\b|\bdelivered\b|\brelease(?:d)?\b/.test(normalized)) {
      return options.find((option) => /completed delivery photo/.test(
        normalizeDriverQuestion(option?.label)
      )) || null;
    }
    if (/\battempt\b|\bunsuccessful\b|\bdoor tag\b/.test(normalized)) {
      return options.find((option) => /unsuccessful attempt photo/.test(
        normalizeDriverQuestion(option?.label)
      )) || null;
    }
  }
  return null;
}

function filterActionableClarificationOptions(options, records) {
  const canonicalRecords = selectCanonicalRecordVersions(records)
    .filter(isProductionEligibleRecord);

  return (Array.isArray(options) ? options : []).filter((option) => {
    const knowledgeId = String(option?.knowledge_id || '');
    if (knowledgeId.startsWith('FLOW:')) return true;
    if (!knowledgeId) return false;
    return canonicalRecords.some((record) => (
      record.knowledge_id === knowledgeId
      && (!option.version || record.version === option.version)
    ));
  });
}

function isRepeatedClarification(decision, context = {}, selection = null) {
  if (decision?.response_mode !== 'CLARIFY') return false;
  const previousPrompt = normalizeDriverQuestion(context.pending_clarification_prompt);
  const nextPrompt = normalizeDriverQuestion(decision.clarification_prompt);
  if (!previousPrompt || previousPrompt !== nextPrompt) return false;

  // A free-text reply that produces the exact same question is also a loop.
  // Do not make the driver answer an unchanged prompt indefinitely.
  if (!selection) return true;

  const optionIdentity = (option) => [
    option?.knowledge_id || '',
    option?.version || '',
    normalizeDriverQuestion(option?.label),
    normalizeDriverQuestion(option?.query)
  ].join('|');
  const previousOptions = (context.pending_clarification_options || []).map(optionIdentity).sort();
  const nextOptions = (decision.clarification_options || []).map(optionIdentity).sort();
  return previousOptions.length > 0
    && previousOptions.length === nextOptions.length
    && previousOptions.every((value, index) => value === nextOptions[index]);
}

function resolveClarificationFollowUp(question, context = {}) {
  const selected = resolveClarificationSelection(question, context);
  if (selected?.query) return selected.query;
  const normalized = normalizeDriverQuestion(question);
  if (/^(?:i m |im )?not sure$/.test(normalized) && context.pending_clarification_not_sure_query) {
    return context.pending_clarification_not_sure_query;
  }
  return question;
}

function isAnsweredSituationFollowUp(question) {
  const normalized = normalizeDriverQuestion(question);
  return /\b(?:also|still|again|instead|then)\b/.test(normalized)
    || /\bnone of\b.*\b(?:this|that) (?:customer|location|stop)\b/.test(normalized)
    || /^(?:what|which) (?:details|information)\b/.test(normalized)
    || /^(?:it|this|that)\b/.test(normalized)
    || /^(?:one|the)\b.*\b(?:amount|barcode|check|count|screen)\b/.test(normalized)
    || /^(?:where|what|which|can|could|should|do|does|did)\b.*\b(?:it|this|that)\b/.test(normalized)
    || /^i (?:lost|forgot|found) (?:it|this|that)\b/.test(normalized)
    || /^i (?:cannot|can t|cant) (?:safely )?(?:get out|escape)\b/.test(normalized);
}

function buildContextualQuestion(question, context = {}) {
  const currentAnswer = resolveClarificationFollowUp(question, context);
  const pendingPrompt = String(context.pending_clarification_prompt || '').trim();
  if (!pendingPrompt) {
    const answeredFollowUp = context.last_response_mode === 'ANSWER'
      && String(context.last_question || '').trim()
      && isAnsweredSituationFollowUp(currentAnswer);
    const answeredSituation = String(
      context.situation_question || context.last_question || ''
    ).trim();
    return answeredFollowUp
      ? `${answeredSituation}. Driver follow-up: ${currentAnswer}`
      : currentAnswer;
  }

  const situationQuestion = String(
    context.situation_question || context.last_question || ''
  ).trim();
  const history = Array.isArray(context.clarification_history)
    ? context.clarification_history
    : [];
  const details = [
    ...history.map((item) => (
      `Ready Route asked: ${String(item?.prompt || '').trim()} Driver answered: ${String(item?.answer || '').trim()}`
    )),
    `Ready Route asked: ${pendingPrompt} Driver answered: ${currentAnswer}`
  ].filter(Boolean);

  return [situationQuestion, ...details].filter(Boolean).join('. ');
}

function clarificationPromptDetail(value) {
  return String(value || '')
    .replace(/^Ready Route Answers needs one detail:\s*/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

function isClarificationAnswerSufficient(requirement, answer) {
  const normalizedRequirement = normalizeDriverQuestion(requirement);
  const normalizedAnswer = normalizeDriverQuestion(answer);
  if (!normalizedAnswer || /^(?:(?:i m|im|i am) )?(?:not sure|unsure|dont know|do not know)$/.test(normalizedAnswer)) {
    return false;
  }
  if (/\b(actual )?(vehicle|tracking|work area) number\b/.test(normalizedRequirement)) {
    return /\d/.test(normalizedAnswer);
  }
  if (/\bforgotten\b.*\blost\b|\blost\b.*\bforgotten\b/.test(normalizedRequirement)) {
    return /\b(?:forgot|forgotten|lost|found|replacement)\b/.test(normalizedAnswer);
  }
  if (/\bordinary delivery\b.*\b(?:asr|call tag|cod)\b/.test(normalizedRequirement)) {
    return /\b(?:ordinary delivery|asr|id refusal|call tag|cod|payment refusal)\b/.test(normalizedAnswer);
  }
  if (/^why\b|\bwhy\b/.test(normalizedRequirement)) {
    return tokenize(normalizedAnswer).length >= 2 && !/^(?:yes|no)$/.test(normalizedAnswer);
  }
  if (/^(?:is|was|were|did|does|do|has|have|whether)\b/.test(normalizedRequirement)) {
    return /^(?:yes|no)\b/.test(normalizedAnswer)
      || tokenize(normalizedAnswer).length >= 3;
  }
  return tokenize(normalizedAnswer).length >= 1;
}

function applyClarificationAnswerToContext(context = {}, answer) {
  const pendingPrompt = String(context.pending_clarification_prompt || '').trim();
  if (!pendingPrompt) return { ...context };
  const pendingRequirement = String(
    context.pending_clarification_requirement
      || clarificationPromptDetail(pendingPrompt)
  ).trim();
  if (!isClarificationAnswerSufficient(pendingRequirement, answer)) return { ...context };

  const answered = Array.isArray(context.answered_clarification_requirements)
    ? context.answered_clarification_requirements
    : [];
  const remaining = Array.isArray(context.remaining_clarification_requirements)
    ? context.remaining_clarification_requirements
    : [];
  return {
    ...context,
    answered_clarification_requirements: [...new Set([...answered, pendingRequirement])],
    remaining_clarification_requirements: remaining.filter((requirement) => (
      !requirementMatches(requirement, pendingRequirement)
    ))
  };
}

function buildNextSessionContext(previousContext = {}, question, decision) {
  const answeredContext = applyClarificationAnswerToContext(previousContext, question);
  const pendingPrompt = String(previousContext.pending_clarification_prompt || '').trim();
  const previousHistory = Array.isArray(previousContext.clarification_history)
    ? previousContext.clarification_history
    : [];
  const clarificationHistory = pendingPrompt
    ? [...previousHistory, { prompt: pendingPrompt, answer: String(question || '').trim() }].slice(-6)
    : [];
  const answeredFollowUp = previousContext.last_response_mode === 'ANSWER'
    && isAnsweredSituationFollowUp(question);
  const situationQuestion = pendingPrompt
    ? String(previousContext.situation_question || previousContext.last_question || question).trim()
    : (answeredFollowUp
      ? String(previousContext.situation_question || previousContext.last_question || question).trim()
      : String(question || '').trim());
  const pendingRequirement = String(
    previousContext.pending_clarification_requirement
      || clarificationPromptDetail(pendingPrompt)
  ).trim();
  const answeredRequirements = Array.isArray(answeredContext.answered_clarification_requirements)
    ? answeredContext.answered_clarification_requirements
    : [];
  const nextAnsweredRequirements = pendingPrompt
    && isClarificationAnswerSufficient(pendingRequirement, question)
    ? [...new Set([...answeredRequirements, pendingRequirement])]
    : answeredRequirements;
  const contextualCandidates = decision.selected_records.length
    ? decision.selected_records.map((record) => ({ knowledge_id: record.knowledge_id, version: record.version }))
    : (decision.candidates || []).slice(0, decision.clarification_plan?.length ? 1 : 3);

  return {
    knowledge_ids: contextualCandidates.map((record) => record.knowledge_id),
    knowledge_versions: contextualCandidates.map((record) => record.version),
    last_response_mode: decision.response_mode,
    last_question: question,
    situation_question: situationQuestion,
    clarification_history: clarificationHistory,
    interpretation_facts: decision.interpretation_result?.facts
      || answeredContext.interpretation_facts
      || null,
    answered_clarification_requirements: nextAnsweredRequirements,
    clarification_plan_active: decision.response_mode === 'CLARIFY'
      ? Boolean(decision.clarification_plan?.length || answeredContext.clarification_plan_active)
      : false,
    remaining_clarification_requirements: decision.response_mode === 'CLARIFY'
      ? (decision.clarification_plan || answeredContext.remaining_clarification_requirements || [])
      : [],
    pending_clarification_id: decision.response_mode === 'CLARIFY'
      ? decision.clarification_id || null
      : null,
    pending_clarification_prompt: decision.response_mode === 'CLARIFY'
      ? decision.clarification_prompt || null
      : null,
    pending_clarification_requirement: decision.response_mode === 'CLARIFY'
      ? decision.clarification_requirement || clarificationPromptDetail(decision.clarification_prompt)
      : null,
    pending_clarification_options: decision.response_mode === 'CLARIFY'
      ? (decision.clarification_options || []).map((option) => ({
          knowledge_id: option.knowledge_id || null,
          label: option.label,
          query: option.query || null,
          version: option.version || null
        }))
      : [],
    pending_clarification_not_sure_query: decision.response_mode === 'CLARIFY'
      ? decision.clarification_not_sure_query || null
      : null
  };
}

function isProtectedInterpretationRequest(question) {
  const normalized = normalizeDriverQuestion(question);
  return /\b(ignore|invent|pretend)\b/.test(normalized)
    || /\b(hidden|system) (instructions|prompt)\b|\breveal (your )?(instructions|prompt)\b/.test(normalized);
}

const DEFAULT_AI_CANDIDATE_LIMIT = 16;
const AI_SUBJECT_GUARDS = Object.freeze([
  { pattern: /\b(?:threat|threatening|weapon|gun|knife|following me|unsafe|scared|danger)\b/, knowledgeIds: ['KNO-SEC-ACTIVE-THREAT-001'] },
  { pattern: /\b(?:dog|animal)\b/, knowledgeIds: ['KNO-DEL-ANIMAL-HAZARD-001'] },
  { pattern: /\b(?:alcohol|wine|beer|liquor|intoxicated|drunk)\b/, knowledgeIds: ['KNO-DEL-ALCOHOL-001'] },
  { pattern: /\b(?:badge|id card)\b/, knowledgeIds: ['KNO-SEC-LOST-BADGE-001'] },
  { pattern: /\b(?:photo|picture|ppod)\b/, knowledgeIds: ['KNO-DEL-PPOD-001'] },
  { pattern: /\b(?:asr|dsr|isr|signature required|signature package)\b/, knowledgeIds: ['KNO-DEL-SIG-ASR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ISR-001'] },
  { pattern: /\b(?:wrong route|different route|another route|misload|manifest)\b/, knowledgeIds: ['KNO-DEL-MISLOAD-AFTERDISPATCH-001', 'KNO-FORGE-MANIFEST-PREVIEW-001', 'KNO-FORGE-BULK-TRANSFER-001'] }
]);

function candidateSearchText(record) {
  return [
    record.canonical_situation,
    record.normalized_description,
    ...(record.applicability || []),
    ...(record.conditions || []),
    ...(record.exceptions || []),
    ...(record.clarification_requirements || []),
    ...(record.driver_question_variants || []),
    ...(record.driver_question_patterns || []).map((pattern) => pattern?.utterance)
  ].filter(Boolean).join(' ');
}

function broadCandidateScore(question, record, deterministicScore = 0) {
  const queryTokens = tokenize(question);
  const surfaceTokens = new Set(tokenize(candidateSearchText(record)));
  const overlap = queryTokens.filter((token) => surfaceTokens.has(token)).length;
  const coverage = queryTokens.length ? overlap / queryTokens.length : 0;
  return deterministicScore * 2 + overlap * 12 + coverage * 30;
}

function selectRelevantPatterns(record, question, maximum = 16) {
  const patterns = (record.driver_question_patterns || []).map((pattern, index) => ({
    pattern_id: `${record.knowledge_id}::${index}`,
    utterance: pattern?.utterance || '',
    response_mode: pattern?.response_mode || '',
    must_clarify: pattern?.must_clarify || [],
    relevance: broadCandidateScore(question, {
      canonical_situation: pattern?.utterance || '',
      driver_question_variants: [],
      driver_question_patterns: []
    })
  })).filter((pattern) => pattern.utterance);
  return patterns
    .sort((left, right) => right.relevance - left.relevance || left.pattern_id.localeCompare(right.pattern_id))
    .slice(0, maximum)
    .map(({ relevance: _relevance, ...pattern }) => pattern);
}

function buildAiCandidateRecords(records, options = {}) {
  const question = String(options.driverQuestion || options.question || '').trim();
  const context = options.context || {};
  const eligible = selectCanonicalRecordVersions(records)
    .filter((record) => !isReferenceRecord(record) && isProductionEligibleRecord(record))
    .sort((left, right) => left.knowledge_id.localeCompare(right.knowledge_id));
  const configuredLimit = Number(options.limit || process.env.READYROUTE_DRIVER_HELP_AI_CANDIDATE_LIMIT);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.max(4, Math.floor(configuredLimit))
    : DEFAULT_AI_CANDIDATE_LIMIT;

  let selected = eligible;
  if (question && eligible.length > limit) {
    const deterministicRanks = new Map(rankKnowledgeRecords(question, eligible, context)
      .map(({ record, score }) => [record.knowledge_id, score]));
    const requiredIds = new Set([
      ...(options.preferredKnowledgeIds || []),
      ...(context.knowledge_ids || [])
    ]);
    const normalizedQuestion = normalizeDriverQuestion(question);
    for (const guard of AI_SUBJECT_GUARDS) {
      if (guard.pattern.test(normalizedQuestion)) {
        for (const knowledgeId of guard.knowledgeIds) requiredIds.add(knowledgeId);
      }
    }
    selected = eligible
      .map((record) => ({
        record,
        required: requiredIds.has(record.knowledge_id),
        score: broadCandidateScore(question, record, deterministicRanks.get(record.knowledge_id) || 0)
      }))
      .sort((left, right) => (
        Number(right.required) - Number(left.required)
        || right.score - left.score
        || left.record.knowledge_id.localeCompare(right.record.knowledge_id)
      ))
      .slice(0, Math.max(limit, requiredIds.size))
      .map(({ record }) => record);
  }

  return selected
    .map((record) => {
      const selectedPatterns = selectRelevantPatterns(record, question, 16);
      return {
        knowledge_id: record.knowledge_id,
        version: record.version,
        canonical_situation: record.canonical_situation,
        normalized_description: record.normalized_description || '',
        applicability: record.applicability || [],
        conditions: record.conditions || [],
        exceptions: record.exceptions || [],
        clarification_requirements: record.clarification_requirements || [],
        driver_question_examples: (record.driver_question_variants || [])
          .map((example) => ({ example, score: broadCandidateScore(question, {
            canonical_situation: example,
            driver_question_variants: [],
            driver_question_patterns: []
          }) }))
          .sort((left, right) => right.score - left.score)
          .slice(0, 8)
          .map(({ example }) => example),
        driver_question_patterns: selectedPatterns
      };
    });
}

function applyAiInterpretation(interpretation, question, records, baseDecision) {
  const selectedRecord = selectCanonicalRecordVersions(records).find((record) => (
    record.knowledge_id === interpretation.knowledge_id
    && isProductionEligibleRecord(record)
    && !isReferenceRecord(record)
  ));
  if (!selectedRecord) return null;
  const patternPrefix = `${selectedRecord.knowledge_id}::`;
  const selectedPatternIndex = String(interpretation.answer_pattern_id || '').startsWith(patternPrefix)
    ? Number(String(interpretation.answer_pattern_id).slice(patternPrefix.length))
    : NaN;
  const selectedPattern = Number.isInteger(selectedPatternIndex)
    ? (selectedRecord.driver_question_patterns || [])[selectedPatternIndex] || null
    : null;

  const selectedCandidate = {
    knowledge_id: selectedRecord.knowledge_id,
    version: selectedRecord.version,
    canonical_situation: selectedRecord.canonical_situation,
    score: Number((interpretation.confidence * 100).toFixed(5))
  };
  const candidates = [
    selectedCandidate,
    ...(baseDecision.candidates || []).filter((candidate) => (
      candidate.knowledge_id !== selectedRecord.knowledge_id
    ))
  ].slice(0, 5);

  if (interpretation.decision === 'CLARIFY') {
    const clarificationRanked = selectCanonicalRecordVersions(records)
      .filter((record) => !isReferenceRecord(record) && isProductionEligibleRecord(record))
      .map((record) => ({
        record,
        score: record.knowledge_id === selectedRecord.knowledge_id ? 100 : 50
      }));
    return {
      response_mode: 'CLARIFY',
      confidence: interpretation.confidence,
      candidates,
      selected_records: [],
      clarification_prompt: buildClarificationPrompt(interpretation.clarification_requirement),
      clarification_requirement: interpretation.clarification_requirement,
      clarification_plan: [interpretation.clarification_requirement],
      clarification_options: clarificationOptionsForRequirement(
        interpretation.clarification_requirement,
        clarificationRanked
      )
    };
  }

  return {
    response_mode: 'ANSWER',
    confidence: interpretation.confidence,
    candidates,
    selected_records: [selectedRecord],
    answer: selectedPattern?.answer_override?.direct_answer
      ? formatDriverCodeTerminology(selectedPattern.answer_override.direct_answer, selectedRecord)
      : buildPresentedAnswer(selectedRecord, question),
    more_info: selectedRecord.more_info_answer || null,
    answer_structure: buildAnswerStructure(selectedRecord, selectedPattern?.answer_override || null)
  };
}

function buildControlledInterpretationFallback(question, records, baseDecision) {
  const normalized = normalizeDriverQuestion(question);
  const verbalReleaseClaimOnSignaturePackage = (
    /\bsignature required\b|\b(?:asr|dsr|isr)\b/.test(normalized)
    && /\b(?:customer|recipient)\b/.test(normalized)
    && /\bshipper\b/.test(normalized)
    && /\b(?:leave|release|no signature|without signature)\b/.test(normalized)
  );
  if (verbalReleaseClaimOnSignaturePackage) {
    const record = selectCanonicalRecordVersions(records).find((item) => (
      item.knowledge_id === 'KNO-DEL-SHIPPER-RELEASE-001'
    ));
    const patternIndex = (record?.driver_question_patterns || []).findIndex((pattern) => (
      /customer statement is not shipper-release authorization/i.test(
        pattern?.answer_override?.direct_answer || ''
      )
    ));
    return applyAiInterpretation({
      knowledge_id: 'KNO-DEL-SHIPPER-RELEASE-001',
      decision: 'ANSWER',
      answer_pattern_id: patternIndex >= 0
        ? `KNO-DEL-SHIPPER-RELEASE-001::${patternIndex}`
        : null,
      clarification_requirement: null,
      confidence: 1
    }, question, records, baseDecision);
  }

  const genericSignature = (
    /\bsignature (?:required )?(?:package|pkg)\b|\bsig (?:package|pkg)\b/.test(normalized)
    && !/\b(?:asr|dsr|isr)\b/.test(normalized)
  );
  if (genericSignature) {
    return applyAiInterpretation({
      knowledge_id: 'KNO-DEL-SIG-DSR-001',
      decision: 'CLARIFY',
      answer_pattern_id: null,
      clarification_requirement: 'What signature service does FORGE show?',
      confidence: 1
    }, question, records, baseDecision);
  }

  const deliveryPhoto = (
    /\b(?:photo|picture)\b/.test(normalized)
    && /\bdeliver(?:y|ed)?\b/.test(normalized)
    && !/\b(?:record|recording|video|film|filming|surveillance)\b/.test(normalized)
  );
  if (deliveryPhoto) {
    return applyAiInterpretation({
      knowledge_id: 'KNO-DEL-PPOD-001',
      decision: 'CLARIFY',
      answer_pattern_id: null,
      clarification_requirement: 'Is this a completed delivery photo or an unsuccessful-attempt photo?',
      confidence: 1
    }, question, records, baseDecision);
  }

  const closedPickupWithZeroPackages = (
    /\bpickup\b/.test(normalized)
    && /\b(?:closed|locked)\b/.test(normalized)
    && /\b(?:zero|no|nothing) packages?\b/.test(normalized)
  );
  if (closedPickupWithZeroPackages) {
    const record = selectCanonicalRecordVersions(records).find((item) => (
      item.knowledge_id === 'KNO-PUP-CANCELED-001'
    ));
    const patternIndex = (record?.driver_question_patterns || []).findIndex((pattern) => (
      pattern?.answer_override?.direct_answer
      && /Use Code 11 because you attempted the pickup/i.test(pattern.answer_override.direct_answer)
    ));
    return applyAiInterpretation({
      knowledge_id: 'KNO-PUP-CANCELED-001',
      decision: 'ANSWER',
      answer_pattern_id: patternIndex >= 0 ? `KNO-PUP-CANCELED-001::${patternIndex}` : null,
      clarification_requirement: null,
      confidence: 1
    }, question, records, baseDecision);
  }

  return null;
}

function buildInterpretationResult({
  status,
  baseDecision,
  interpretation = null,
  latencyMs = null,
  providerMetadata = null,
  candidateRecords = []
}) {
  const deterministicKnowledgeId = baseDecision.selected_records?.[0]?.knowledge_id
    || baseDecision.candidates?.[0]?.knowledge_id
    || null;
  const providerUsage = providerMetadata?.usage
    ? estimateUsageCost(process.env.READYROUTE_DRIVER_HELP_MODEL, providerMetadata.usage)
    : null;
  return {
    status,
    proposed_knowledge_id: interpretation?.knowledge_id || null,
    proposed_response_mode: interpretation?.decision || null,
    proposed_answer_pattern_id: interpretation?.answer_pattern_id || null,
    proposed_clarification_requirement: interpretation?.clarification_requirement || null,
    facts: interpretation?.facts || null,
    confidence: interpretation?.confidence ?? null,
    deterministic_knowledge_id: deterministicKnowledgeId,
    deterministic_response_mode: baseDecision.response_mode,
    record_agreement: interpretation
      ? interpretation.knowledge_id === deterministicKnowledgeId
      : null,
    response_mode_agreement: interpretation
      ? interpretation.decision === baseDecision.response_mode
      : null,
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : null,
    candidate_count: candidateRecords.length,
    candidate_knowledge_ids: candidateRecords.map((record) => record.knowledge_id),
    provider_model: providerUsage ? process.env.READYROUTE_DRIVER_HELP_MODEL : null,
    provider_response_id: providerMetadata?.response_id || null,
    provider_request_id: providerMetadata?.request_id || null,
    usage: providerUsage
  };
}

function buildDeterministicRuntimeDecision(question, records, context = {}) {
  const clarificationSelection = resolveClarificationSelection(question, context);
  const resolvedQuestion = buildContextualQuestion(question, context);
  const decisionContext = applyClarificationAnswerToContext(context, question);
  const selectedClarificationRecord = clarificationSelection
    ? selectCanonicalRecordVersions(records).find((record) => (
        !isReferenceRecord(record)
        && isProductionEligibleRecord(record)
        && (
          (clarificationSelection.knowledge_id
            && record.knowledge_id === clarificationSelection.knowledge_id
            && (!clarificationSelection.version || record.version === clarificationSelection.version))
          || (!clarificationSelection.knowledge_id
            && normalizeDriverQuestion(record.canonical_situation) === normalizeDriverQuestion(clarificationSelection.label))
        )
      ))
    : null;
  // Prefer the driver's current words for a reference definition. Otherwise a
  // prior “delivery or pickup?” prompt can contaminate the category in the
  // accumulated transcript and return the wrong namespace.
  const referenceDecision = buildDriverHelpReferenceDecision(question, records)
    || buildDriverHelpReferenceDecision(resolvedQuestion, records);
  const decision = selectedClarificationRecord
    ? {
        response_mode: 'ANSWER',
        confidence: 1,
        candidates: [{
          knowledge_id: selectedClarificationRecord.knowledge_id,
          version: selectedClarificationRecord.version,
          canonical_situation: selectedClarificationRecord.canonical_situation,
          score: 100
        }],
        selected_records: [selectedClarificationRecord],
        answer: (() => {
          const pattern = getMatchingQuestionPattern(
            clarificationSelection?.query || resolvedQuestion,
            selectedClarificationRecord
          );
          return pattern?.answer_override?.direct_answer
            ? formatDriverCodeTerminology(pattern.answer_override.direct_answer, selectedClarificationRecord)
            : buildPresentedAnswer(selectedClarificationRecord, resolvedQuestion);
        })(),
        more_info: selectedClarificationRecord.more_info_answer || null,
        answer_structure: (() => {
          const pattern = getMatchingQuestionPattern(
            clarificationSelection?.query || resolvedQuestion,
            selectedClarificationRecord
          );
          return buildAnswerStructure(selectedClarificationRecord, pattern?.answer_override || null);
        })()
      }
    : referenceDecision || buildDriverHelpDecision(
        resolvedQuestion,
        records.filter((record) => !isReferenceRecord(record)),
        decisionContext
      );
  return {
    clarificationSelection,
    decision,
    decisionContext,
    referenceDecision,
    resolvedQuestion,
    selectedClarificationRecord
  };
}

function createDriverHelpService({
  supabase = defaultSupabase,
  now = () => new Date(),
  aiInterpreter = createDriverHelpAiInterpreter(),
  aiInterpretationMode = resolveDriverHelpAiInterpretationMode(),
  answerMemoryAuditRate = resolveAnswerMemoryAuditRate(),
  random = Math.random
} = {}) {
  async function loadActiveAnswerMemory(question, records, context = {}) {
    if (!isAnswerMemoryEligibleQuestion(question, context)) return null;
    const table = supabase.from('driver_help_answer_memory');
    if (!table || typeof table.select !== 'function') return null;

    const routeKey = answerMemoryRouteKey(question);
    const { data, error } = await table
      .select('route_key, knowledge_id, knowledge_version, response_mode, answer_pattern_id, clarification_requirement, interpreted_facts, risk_tier, status, agreement_count')
      .eq('route_key', routeKey)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    if (!data) return null;

    const currentRecord = selectCanonicalRecordVersions(records).find((record) => (
      record.knowledge_id === data.knowledge_id
      && record.version === data.knowledge_version
      && isProductionEligibleRecord(record)
      && !isReferenceRecord(record)
    ));
    if (!currentRecord) return null;

    return {
      ...data,
      route_key: routeKey,
      interpretation: {
        knowledge_id: data.knowledge_id,
        decision: data.response_mode,
        answer_pattern_id: data.answer_pattern_id || null,
        clarification_requirement: data.clarification_requirement || null,
        facts: data.interpreted_facts || {},
        confidence: 1
      }
    };
  }

  async function observeAnswerMemory({ question, context, interpretation }) {
    if (!interpretation || !isAnswerMemoryEligibleQuestion(question, context)) return null;
    if (!['ANSWER', 'CLARIFY'].includes(interpretation.decision)) return null;
    if (!interpretation.knowledge_id || !Number.isInteger(Number(interpretation.knowledge_version))) return null;
    if (!supabase || typeof supabase.rpc !== 'function') return null;

    const routeKey = answerMemoryRouteKey(question);
    const { data, error } = await supabase.rpc('observe_driver_help_answer_memory', {
      p_route_key: routeKey,
      p_normalized_question: `route:${routeKey}`,
      p_knowledge_id: interpretation.knowledge_id,
      p_knowledge_version: Number(interpretation.knowledge_version),
      p_response_mode: interpretation.decision,
      p_answer_pattern_id: interpretation.answer_pattern_id || null,
      p_clarification_requirement: interpretation.clarification_requirement || null,
      p_interpreted_facts: interpretation.facts || {},
      p_risk_tier: answerMemoryRiskTier(interpretation.knowledge_id),
      p_confidence: Number(interpretation.confidence || 0)
    });
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    return data || null;
  }

  async function recordAnswerMemoryReuse(routeKey) {
    if (!routeKey || !supabase || typeof supabase.rpc !== 'function') return;
    const { error } = await supabase.rpc('record_driver_help_answer_memory_reuse', {
      p_route_key: routeKey
    });
    if (error && !isMissingTableError(error)) throw error;
  }

  async function recordAnswerMemoryAudit(routeKey, outcome) {
    if (!routeKey || !supabase || typeof supabase.rpc !== 'function') return;
    const { error } = await supabase.rpc('record_driver_help_answer_memory_audit', {
      p_route_key: routeKey,
      p_outcome: outcome
    });
    if (error && !isMissingTableError(error)) throw error;
  }

  async function loadKnowledgeRecords() {
    const { data, error } = await supabase
      .from('driver_help_knowledge_records')
      .select([
        'knowledge_id',
        'version',
        'status',
        'is_published',
        'source_ids',
        'adjudication_id',
        'approved_by',
        'approval_date',
        'canonical_schema_version',
        'canonical_situation',
        'normalized_description',
        'taxonomy_paths',
        'applicability',
        'conditions',
        'exceptions',
        'authoritative_rule',
        'required_procedure',
        'required_documentation',
        'prohibited_actions',
        'escalation_requirements',
        'clarification_requirements',
        'related_knowledge_ids',
        'driver_question_variants',
        'driver_question_patterns',
        'images',
        'concise_answer',
        'more_info_answer'
      ].join(', '));

    if (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }

    return Array.isArray(data) ? data : [];
  }

  async function getAnswerImages(selectedRecords = []) {
    const uniqueImages = new Map();
    for (const record of selectedRecords) {
      for (const image of record.images || []) {
        const storagePath = String(image?.storage_path || '').trim();
        if (storagePath && !uniqueImages.has(storagePath)) uniqueImages.set(storagePath, image);
      }
    }

    const signedImages = await Promise.all([...uniqueImages.values()].map(async (image) => {
      let url = null;
      try {
        url = await createSignedStorageUrl(supabase, {
          bucket: image.storage_bucket,
          path: image.storage_path
        }, { fallbackBucket: 'driver-help-images' });
      } catch (_error) {
        return null;
      }
      if (!url) return null;
      return {
        filename: image.filename,
        caption: image.caption || '',
        width: Number(image.width) || null,
        height: Number(image.height) || null,
        url,
        expires_in: getSignedUrlTtlSeconds()
      };
    }));

    return signedImages.filter(Boolean);
  }

  async function loadSessionContext(sessionId, accountId, actorType, actorId) {
    if (!sessionId) {
      return { session_id: null, context: {} };
    }

    const { data, error } = await supabase
      .from('driver_help_sessions')
      .select('id, context, status')
      .eq('id', sessionId)
      .eq('account_id', accountId)
      .eq('actor_type', actorType)
      .eq('actor_id', actorId)
      .maybeSingle();

    if (error && !isMissingTableError(error)) {
      throw error;
    }

    if (data?.status !== 'active') {
      return { session_id: null, context: {} };
    }

    return {
      session_id: data.id,
      context: data.context || {}
    };
  }

  async function createOrUpdateSession({ sessionId, accountId, driverId, actorType, actorId, question, decision, previousContext = {} }) {
    const timestamp = now().toISOString();
    const context = buildNextSessionContext(previousContext, question, decision);

    if (sessionId) {
      const { error } = await supabase
        .from('driver_help_sessions')
        .update({ context, last_interaction_at: timestamp })
        .eq('id', sessionId)
        .eq('account_id', accountId)
        .eq('actor_type', actorType)
        .eq('actor_id', actorId);
      if (error) throw error;
      return sessionId;
    }

    const newSessionId = randomId();
    const { error } = await supabase.from('driver_help_sessions').insert({
      id: newSessionId,
      account_id: accountId,
      driver_id: actorType === 'driver' ? driverId : null,
      actor_type: actorType,
      actor_id: actorId,
      context,
      started_at: timestamp,
      last_interaction_at: timestamp
    });
    if (error) throw error;
    return newSessionId;
  }

  async function recordInteraction({ sessionId, accountId, driverId, actorType, actorId, question, decision, responseLatencyMs }) {
    const interactionId = randomId();
    const selectedRecords = decision.selected_records || [];
    const row = {
      id: interactionId,
      session_id: sessionId,
      account_id: accountId,
      driver_id: actorType === 'driver' ? driverId : null,
      actor_type: actorType,
      actor_id: actorId,
      question,
      normalized_question: normalizeDriverQuestion(question),
      response_mode: decision.response_mode,
      selected_knowledge_ids: selectedRecords.map((record) => record.knowledge_id),
      selected_knowledge_versions: selectedRecords.map((record) => record.version),
      canonical_trace: selectedRecords.map((record) => ({
        knowledge_id: record.knowledge_id,
        knowledge_status: record.status,
        canonical_version: record.version,
        category_paths: record.taxonomy_paths || [],
        source_ids: record.source_ids || [],
        adjudication_id: record.adjudication_id || null,
        approved_by: record.approved_by || null,
        approval_date: record.approval_date || null,
        canonical_schema_version: record.canonical_schema_version || null,
        interpretation_mode: decision.interpretation_mode || 'DETERMINISTIC',
        interpretation_confidence: decision.interpretation_confidence ?? null,
        composition_source_paths: (decision.composition_grounding || [])
          .filter((entry) => entry.knowledge_id === record.knowledge_id)
          .flatMap((entry) => entry.source_paths || (entry.source_path ? [entry.source_path] : []))
      })),
      retrieval_candidates: decision.candidates,
      confidence: decision.confidence,
      answer_snapshot: decision.answer || null,
      more_info_snapshot: decision.more_info || null,
      clarification_options: decision.clarification_options || [],
      escalation_message: decision.escalation_message || null,
      escalation_details: decision.escalation_details || [],
      interpretation_mode: decision.interpretation_mode || 'DETERMINISTIC',
      interpretation_result: decision.interpretation_result || {},
      response_latency_ms: responseLatencyMs,
      created_at: now().toISOString()
    };
    const { error } = await supabase.from('driver_help_interactions').insert(row);
    if (error) throw error;

    if (decision.response_mode === 'ESCALATE') {
      const { error: unansweredError } = await supabase.from('driver_help_unanswered_questions').insert({
        interaction_id: interactionId,
        account_id: accountId,
        driver_id: actorType === 'driver' ? driverId : null,
        actor_type: actorType,
        actor_id: actorId,
        question,
        normalized_question: row.normalized_question
      });
      if (unansweredError) throw unansweredError;
    }

    return interactionId;
  }

  async function answerQuestion({
    accountId,
    driverId,
    actorType = 'driver',
    actorId = driverId,
    question,
    sessionId = null,
    includeDiagnostics = false,
    aiInterpretationModeOverride = null,
    allowAiProcessing = true,
    persist = true,
    sessionContext = null
  }) {
    const startedAt = Date.now();
    const effectiveAiInterpretationMode = allowAiProcessing && ['OFF', 'SHADOW', 'ACTIVE'].includes(
      String(aiInterpretationModeOverride || '').toUpperCase()
    )
      ? String(aiInterpretationModeOverride).toUpperCase()
      : (allowAiProcessing ? aiInterpretationMode : 'OFF');
    const [records, sessionState] = await Promise.all([
      loadKnowledgeRecords(),
      persist
        ? loadSessionContext(sessionId, accountId, actorType, actorId)
        : Promise.resolve({ session_id: sessionId || null, context: sessionContext || {} })
    ]);
    const runtime = buildDeterministicRuntimeDecision(question, records, sessionState.context);
    const {
      clarificationSelection,
      decision: baseDecision,
      decisionContext,
      referenceDecision,
      resolvedQuestion,
      selectedClarificationRecord
    } = runtime;
    let interpretedDecision = null;
    let interpretationMode = 'DETERMINISTIC';
    let interpretationConfidence = null;
    let interpretationResult = {};
    let validatedAiInterpretation = null;
    const activeMemory = !selectedClarificationRecord && !referenceDecision
      ? await loadActiveAnswerMemory(question, records, sessionState.context)
      : null;
    let memoryRouteAccepted = Boolean(activeMemory);
    if (activeMemory) {
      interpretedDecision = applyAiInterpretation(
        activeMemory.interpretation,
        resolvedQuestion,
        records,
        baseDecision
      );
      if (interpretedDecision) {
        interpretationMode = 'LEARNED_ROUTE';
        interpretationConfidence = 1;
        interpretationResult = {
          status: 'VALID',
          proposed_knowledge_id: activeMemory.knowledge_id,
          proposed_response_mode: activeMemory.response_mode,
          proposed_answer_pattern_id: activeMemory.answer_pattern_id || null,
          proposed_clarification_requirement: activeMemory.clarification_requirement || null,
          facts: activeMemory.interpreted_facts || {},
          confidence: 1,
          memory_route_key: activeMemory.route_key,
          memory_agreement_count: activeMemory.agreement_count,
          memory_risk_tier: activeMemory.risk_tier,
          ai_bypassed: true,
          usage: {
            input_tokens: 0,
            cached_input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            total_tokens: 0,
            estimated_cost_usd: 0
          }
        };
      }
    }
    const aiCandidates = buildAiCandidateRecords(records, {
      driverQuestion: resolvedQuestion,
      context: decisionContext,
      preferredKnowledgeIds: [
        ...(baseDecision.candidates || []).slice(0, 5).map((candidate) => candidate.knowledge_id),
        ...(decisionContext.knowledge_ids || [])
      ]
    });
    const shouldAuditMemory = Boolean(
      persist
      && activeMemory
      && interpretedDecision
      && aiInterpreter
      && effectiveAiInterpretationMode === 'ACTIVE'
      && aiCandidates.length
      && Number(answerMemoryAuditRate) > 0
      && random() < Number(answerMemoryAuditRate)
    );
    if (shouldAuditMemory) {
      const auditStartedAt = Date.now();
      try {
        const rawAudit = await aiInterpreter({
          safety_identifier: buildAiSafetyIdentifier(accountId, actorType, actorId),
          driver_question: redactTextForAi(resolvedQuestion),
          conversation_context: redactConversationContextForAi({
            original_situation: decisionContext.situation_question || null,
            clarification_history: decisionContext.clarification_history || [],
            previous_question: decisionContext.last_question || null,
            pending_clarification_prompt: decisionContext.pending_clarification_prompt || null,
            previous_knowledge_ids: decisionContext.knowledge_ids || [],
            interpreted_facts: decisionContext.interpretation_facts || null
          }),
          candidate_records: aiCandidates
        });
        const auditInterpretation = validateInterpretation(
          rawAudit,
          aiCandidates,
          undefined,
          resolvedQuestion
        );
        if (!auditInterpretation) {
          await recordAnswerMemoryAudit(activeMemory.route_key, 'ERROR');
          interpretationResult = {
            ...interpretationResult,
            ai_bypassed: false,
            memory_audit: { outcome: 'ERROR', latency_ms: Date.now() - auditStartedAt }
          };
        } else if (answerMemoryInterpretationAgrees(activeMemory, auditInterpretation)) {
          await recordAnswerMemoryAudit(activeMemory.route_key, 'AGREE');
          interpretationResult = {
            ...interpretationResult,
            ai_bypassed: false,
            memory_audit: {
              outcome: 'AGREE',
              latency_ms: Date.now() - auditStartedAt,
              provider_model: rawAudit?.provider_metadata?.provider_model || null
            },
            usage: rawAudit?.provider_metadata?.usage || interpretationResult.usage
          };
        } else {
          await recordAnswerMemoryAudit(activeMemory.route_key, 'DISAGREE');
          memoryRouteAccepted = false;
          const selectedCandidate = aiCandidates.find((candidate) => (
            candidate.knowledge_id === auditInterpretation.knowledge_id
          ));
          validatedAiInterpretation = {
            ...auditInterpretation,
            knowledge_version: selectedCandidate?.version || null
          };
          interpretedDecision = applyAiInterpretation(
            auditInterpretation,
            resolvedQuestion,
            records,
            baseDecision
          );
          interpretationMode = interpretedDecision ? 'GROUNDED_AI' : 'DETERMINISTIC_FALLBACK';
          interpretationConfidence = interpretedDecision ? auditInterpretation.confidence : null;
          interpretationResult = {
            ...buildInterpretationResult({
              status: interpretedDecision ? 'VALID' : 'REJECTED',
              baseDecision,
              interpretation: interpretedDecision ? auditInterpretation : null,
              latencyMs: Date.now() - auditStartedAt,
              providerMetadata: rawAudit?.provider_metadata || null,
              candidateRecords: aiCandidates
            }),
            memory_audit: {
              outcome: 'DISAGREE',
              suspended_route_key: activeMemory.route_key,
              remembered_knowledge_id: activeMemory.knowledge_id
            }
          };
        }
      } catch (_error) {
        await recordAnswerMemoryAudit(activeMemory.route_key, 'ERROR');
        interpretationResult = {
          ...interpretationResult,
          ai_bypassed: false,
          memory_audit: { outcome: 'ERROR', latency_ms: Date.now() - auditStartedAt }
        };
      }
    }
    const shouldInterpret = Boolean(
      aiInterpreter
      && ['SHADOW', 'ACTIVE'].includes(effectiveAiInterpretationMode)
      && !selectedClarificationRecord
      && !referenceDecision
      && !interpretedDecision
      && !shouldAuditMemory
      && !isProtectedInterpretationRequest(resolvedQuestion)
      && aiCandidates.length
    );
    if (shouldInterpret) {
      const interpretationStartedAt = Date.now();
      try {
        const rawInterpretation = await aiInterpreter({
          safety_identifier: buildAiSafetyIdentifier(accountId, actorType, actorId),
          driver_question: redactTextForAi(resolvedQuestion),
          conversation_context: redactConversationContextForAi({
            original_situation: decisionContext.situation_question || null,
            clarification_history: decisionContext.clarification_history || [],
            previous_question: decisionContext.last_question || null,
            pending_clarification_prompt: decisionContext.pending_clarification_prompt || null,
            previous_knowledge_ids: decisionContext.knowledge_ids || [],
            interpreted_facts: decisionContext.interpretation_facts || null
          }),
          candidate_records: aiCandidates
        });
        const interpretation = validateInterpretation(
          rawInterpretation,
          aiCandidates,
          undefined,
          resolvedQuestion
        );
        if (interpretation) {
          const selectedCandidate = aiCandidates.find((candidate) => (
            candidate.knowledge_id === interpretation.knowledge_id
          ));
          validatedAiInterpretation = {
            ...interpretation,
            knowledge_version: selectedCandidate?.version || null
          };
          interpretedDecision = applyAiInterpretation(
            interpretation,
            resolvedQuestion,
            records,
            baseDecision
          );
          interpretationMode = interpretedDecision
            ? (effectiveAiInterpretationMode === 'SHADOW' ? 'AI_SHADOW' : 'GROUNDED_AI')
            : (effectiveAiInterpretationMode === 'SHADOW' ? 'AI_SHADOW_FALLBACK' : 'DETERMINISTIC_FALLBACK');
          interpretationConfidence = interpretedDecision ? interpretation.confidence : null;
          interpretationResult = buildInterpretationResult({
            status: interpretedDecision ? 'VALID' : 'REJECTED',
            baseDecision,
            interpretation: interpretedDecision ? interpretation : null,
            latencyMs: Date.now() - interpretationStartedAt,
            providerMetadata: rawInterpretation?.provider_metadata || null,
            candidateRecords: aiCandidates
          });
        } else {
          interpretationMode = effectiveAiInterpretationMode === 'SHADOW'
            ? 'AI_SHADOW_FALLBACK'
            : 'DETERMINISTIC_FALLBACK';
          interpretationResult = buildInterpretationResult({
            status: 'DECLINED_OR_REJECTED',
            baseDecision,
            latencyMs: Date.now() - interpretationStartedAt,
            providerMetadata: rawInterpretation?.provider_metadata || null,
            candidateRecords: aiCandidates
          });
        }
      } catch (_error) {
        interpretationMode = effectiveAiInterpretationMode === 'SHADOW'
          ? 'AI_SHADOW_FALLBACK'
          : 'DETERMINISTIC_FALLBACK';
        interpretationResult = buildInterpretationResult({
          status: 'ERROR',
          baseDecision,
          latencyMs: Date.now() - interpretationStartedAt,
          candidateRecords: aiCandidates
        });
      }
    }

    // AI interprets language only. Published record content remains the sole
    // source of every driver-facing answer, step, code, warning, and More Info.
    const controlledFallbackDecision = effectiveAiInterpretationMode === 'ACTIVE' && !interpretedDecision
      ? buildControlledInterpretationFallback(resolvedQuestion, records, baseDecision)
      : null;
    if (controlledFallbackDecision) interpretationMode = 'CONTROLLED_FALLBACK';
    const interpretedOrBaseDecision = effectiveAiInterpretationMode === 'ACTIVE'
      ? (interpretedDecision || controlledFallbackDecision || baseDecision)
      : baseDecision;
    const actionableBaseDecision = {
      ...interpretedOrBaseDecision,
      clarification_options: interpretedOrBaseDecision.response_mode === 'CLARIFY'
        ? filterActionableClarificationOptions(interpretedOrBaseDecision.clarification_options, records)
        : []
    };
    const loopDetected = isRepeatedClarification(
      actionableBaseDecision,
      sessionState.context,
      clarificationSelection
    );
    const decision = {
      ...(loopDetected ? {
        response_mode: 'ESCALATE',
        confidence: actionableBaseDecision.confidence,
        candidates: actionableBaseDecision.candidates || [],
        selected_records: [],
        clarification_options: [],
        escalation_message: 'Ready Route cannot resolve that required detail from the answer provided. Contact your manager or station for the current direction instead of repeating the same question.'
      } : actionableBaseDecision),
      composition_mode: 'DETERMINISTIC',
      composition_grounding: [],
      interpretation_mode: interpretationMode,
      interpretation_confidence: interpretationConfidence,
      interpretation_result: interpretationResult
    };
    if (persist && activeMemory && memoryRouteAccepted && interpretedDecision && decision.response_mode !== 'ESCALATE') {
      await recordAnswerMemoryReuse(activeMemory.route_key);
    } else if (
      persist
      && validatedAiInterpretation
      && !activeMemory
      && interpretationMode === 'GROUNDED_AI'
      && decision.response_mode !== 'ESCALATE'
      && !sessionState.context.pending_clarification_prompt
    ) {
      await observeAnswerMemory({
        question,
        context: sessionState.context,
        interpretation: validatedAiInterpretation
      });
    }
    const nextSessionContext = buildNextSessionContext(decisionContext, question, decision);
    const effectiveSessionId = persist
      ? await createOrUpdateSession({
          sessionId: sessionState.session_id,
          accountId,
          driverId,
          actorType,
          actorId,
          question,
          decision,
          previousContext: decisionContext
        })
      : (sessionState.session_id || randomId());
    const interactionId = persist
      ? await recordInteraction({
          sessionId: effectiveSessionId,
          accountId,
          driverId,
          actorType,
          actorId,
          question,
          decision,
          responseLatencyMs: Math.max(0, Date.now() - startedAt)
        })
      : null;
    const images = decision.response_mode === 'ANSWER'
      ? await getAnswerImages(decision.selected_records)
      : [];

    return {
      session_id: effectiveSessionId,
      interaction_id: interactionId,
      ...(!persist ? { session_context: nextSessionContext, test_mode: true } : {}),
      response_mode: decision.response_mode,
      answer_type: decision.answer_type || 'OPERATIONAL',
      answer: decision.answer || null,
      more_info: decision.more_info || null,
      answer_structure: decision.answer_structure || null,
      images,
      composition_mode: decision.composition_mode || 'DETERMINISTIC',
      interpretation_mode: decision.interpretation_mode || 'DETERMINISTIC',
      interpretation_confidence: decision.interpretation_confidence,
      ...(includeDiagnostics ? { interpretation_result: decision.interpretation_result || {} } : {}),
      clarification_prompt: decision.clarification_prompt || null,
      clarification_options: decision.clarification_options || [],
      escalation_message: decision.escalation_message || null,
      trace: decision.selected_records.map((record) => ({
        knowledge_id: record.knowledge_id,
        knowledge_status: record.status,
        canonical_version: record.version,
        category_paths: record.taxonomy_paths || [],
        source_ids: record.source_ids || [],
        adjudication_id: record.adjudication_id || null,
        interpretation_mode: decision.interpretation_mode || 'DETERMINISTIC',
        interpretation_confidence: decision.interpretation_confidence ?? null,
        composition_source_paths: (decision.composition_grounding || [])
          .filter((entry) => entry.knowledge_id === record.knowledge_id)
          .flatMap((entry) => entry.source_paths || (entry.source_path ? [entry.source_path] : []))
      }))
    };
  }

  async function saveFeedback({ accountId, driverId, actorType = 'driver', actorId = driverId, interactionId, rating, comment = null }) {
    const { data: interaction, error: interactionError } = await supabase
      .from('driver_help_interactions')
      .select('id, normalized_question, selected_knowledge_ids, interpretation_result')
      .eq('id', interactionId)
      .eq('account_id', accountId)
      .eq('actor_type', actorType)
      .eq('actor_id', actorId)
      .maybeSingle();
    if (interactionError) throw interactionError;
    if (!interaction) return null;

    const timestamp = now().toISOString();
    const { error } = await supabase.from('driver_help_feedback').upsert({
      interaction_id: interactionId,
      account_id: accountId,
      driver_id: actorType === 'driver' ? driverId : null,
      actor_type: actorType,
      actor_id: actorId,
      rating,
      comment: comment || null,
      updated_at: timestamp
    }, { onConflict: 'interaction_id,actor_type,actor_id' });
    if (error) throw error;
    if (rating === 'down' && supabase && typeof supabase.rpc === 'function') {
      const knowledgeId = interaction.selected_knowledge_ids?.[0]
        || interaction.interpretation_result?.proposed_knowledge_id
        || null;
      if (knowledgeId && interaction.normalized_question) {
        const { error: memoryError } = await supabase.rpc('suspend_driver_help_answer_memory', {
          p_route_key: answerMemoryRouteKey(interaction.normalized_question),
          p_knowledge_id: knowledgeId
        });
        if (memoryError && !isMissingTableError(memoryError)) throw memoryError;
      }
    }
    return { interaction_id: interactionId, rating, comment: comment || null };
  }

  return {
    answerQuestion,
    loadKnowledgeRecords,
    saveFeedback
  };
}

module.exports = {
  answerMemoryRiskTier,
  answerMemoryRouteKey,
  answerMemoryInterpretationAgrees,
  applyAiInterpretation,
  applyClarificationAnswerToContext,
  buildAiCandidateRecords,
  buildContextualQuestion,
  buildDeterministicRuntimeDecision,
  buildNextSessionContext,
  clarificationPromptDetail,
  buildAiSafetyIdentifier,
  buildInterpretationResult,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isMissingTableError,
  isClarificationAnswerSufficient,
  isAnswerMemoryEligibleQuestion,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveAnswerMemoryAuditRate,
  resolveClarificationSelection
};
