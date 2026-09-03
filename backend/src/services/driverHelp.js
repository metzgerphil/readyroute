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
  matchesUnsupportedBoundaryQuestion: matchesKnownUnapprovedQuestion,
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
const { runGuardedInterpretation } = require('./driverHelpAiGuard');
const {
  createSignedStorageUrl,
  getSignedUrlTtlSeconds
} = require('./privateStorage');
const { estimateUsageCost } = require('./openAiUsageCost');
const {
  redactConversationContextForAi,
  redactTextForAi
} = require('./driverHelpPrivacy');
const {
  VEHICLE_BARCODE_KNOWLEDGE_ID,
  buildVehicleBarcodeWorkflowDecision
} = require('./vehicleBarcodeWorkflow');

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST106', 'PGRST204', 'PGRST205']);

const MISSED_DELIVERY_MEANING_REQUIREMENT =
  'Did you deliver the package to the wrong address, or were you unable to complete the delivery?';
const MISSED_DELIVERY_REASON_REQUIREMENT =
  'What prevented the delivery from being completed?';
const SIGNATURE_SERVICE_REQUIREMENT =
  'What signature service does FORGE show: ASR, DSR, or ISR?';
const LEAK_HAZARD_REQUIREMENT = 'Is the leaking package hazardous?';
const DEFAULT_ESCALATION_MESSAGE = 'Call your BC.';

const PROTECTED_GLOSSARY_ROUTES = Object.freeze([
  { term: 'cxpc', knowledgeId: 'KNO-GLOSSARY-CXPC-001' },
  { term: 'dna', knowledgeId: 'KNO-GLOSSARY-DNA-001' },
  { term: 'op 201', knowledgeId: 'KNO-DEL-OP201-DEFINITION-001' },
  { term: 'call tag', knowledgeId: 'KNO-PUP-CALLTAG-DEFINITION-001' },
  { term: 'service cross', knowledgeId: 'KNO-GLOSSARY-SERVICE-CROSS-001' },
  { term: 'manifest', knowledgeId: 'KNO-GLOSSARY-MANIFEST-001' },
  { term: 'forge', knowledgeId: 'KNO-GLOSSARY-FORGE-001' },
  { term: 'bc', knowledgeId: 'KNO-GLOSSARY-BC-001' },
  { term: 'wa', knowledgeId: 'KNO-FORGE-WORK-AREA-TERM-001' }
]);

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

function extractDriverUtterance(value) {
  const original = String(value || '').trim();
  const reply = original.match(/^(?:my answer is|driver answered)\s*:\s*([\s\S]+)$/i);
  if (reply) return reply[1].trim();

  const quotedQuestion = original.match(/^i asked (?:the )?question\s*:\s*[“"]?([\s\S]*?)[”"]?\s*$/i);
  return quotedQuestion ? quotedQuestion[1].trim() : original;
}

function correctCommonFollowUpTypos(value) {
  return String(value || '')
    .replace(/\bclsoed\b/gi, 'closed')
    .replace(/\bdeatils\b/gi, 'details')
    .replace(/\bestalbishes\b/gi, 'establishes')
    .replace(/\bordniary\b/gi, 'ordinary')
    .replace(/\bhazradous\b/gi, 'hazardous')
    .replace(/\bpacakges\b/gi, 'packages')
    .replace(/\bxfer\b/gi, 'transfer')
    .replace(/\bpkgs\b/gi, 'packages');
}

function normalizeDriverUtterance(value) {
  return correctCommonFollowUpTypos(extractDriverUtterance(value));
}

function isGlossaryQuestion(value) {
  const normalized = normalizeDriverQuestion(value);
  return Boolean(
    /^(?:what (?:is|are)|define|meaning of)\b/.test(normalized)
    || /^what (?:does|do)\b.+\b(?:mean|stand for)$/.test(normalized)
  );
}

function buildAiFacingQuestion(value, context = {}) {
  const question = normalizeDriverUtterance(value);
  const normalized = normalizeDriverQuestion(question);
  if (
    !normalized
    || context.pending_clarification_prompt
    || /[?]$/.test(question)
    || /^(?:what|when|where|why|how|who|which|can|could|should|would|do|does|did|is|are|am|was|were|has|have|will)\b/.test(normalized)
    || tokenize(question).length < 2
  ) return question;

  return `${question.replace(/[.!]+$/, '')}. What should I do?`;
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

  const yesNoSelection = normalized.match(/^(yes|no)\b/)?.[1];
  if (yesNoSelection) {
    const selected = options.find((option) => (
      normalizeDriverQuestion(option?.label) === yesNoSelection
    ));
    if (selected) return selected;
  }

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
  if (/signature service/.test(requirement)) {
    const signatureType = normalized.match(/\b(asr|dsr|isr)\b/)?.[1];
    if (signatureType) {
      return options.find((option) => new RegExp(`\\b${signatureType}\\b`).test(
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
    || /^(?:where|what|which|can|could|should|do|does|did|how)\b.*\b(?:door tag|package|form|paperwork|barcode|sid|sticker)\b/.test(normalized)
    || /^(?:what|which) code (?:should|do|can) i use\b/.test(normalized)
    || /^i (?:do not|dont|don t)? ?know\b.*\b(?:address|location|code|number)\b/.test(normalized)
    || /^i (?:lost|forgot|found) (?:it|this|that)\b/.test(normalized)
    || /^(?:i )?(?:cannot|can t|cant) (?:safely )?(?:get out|escape)\b/.test(normalized);
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
    const answeredHistory = Array.isArray(context.clarification_history)
      ? context.clarification_history
        .map((item) => (
          `Ready Route asked: ${String(item?.prompt || '').trim()} Driver answered: ${String(item?.answer || '').trim()}`
        ))
        .filter(Boolean)
      : [];
    return answeredFollowUp
      ? [answeredSituation, ...answeredHistory, `Driver follow-up: ${currentAnswer}`]
        .filter(Boolean)
        .join('. ')
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
  question = normalizeDriverUtterance(question);
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
      : null,
    pending_workflow: decision.workflow?.state === 'AWAITING_VEHICLE_NUMBER'
      ? decision.workflow
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
      }))
      .sort((left, right) => right.score - left.score);
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
  const providerModel = providerMetadata?.provider_model
    || process.env.READYROUTE_DRIVER_HELP_MODEL
    || null;
  const providerUsage = providerMetadata?.usage
    ? estimateUsageCost(providerModel, providerMetadata.usage)
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
    provider_model: providerUsage ? providerModel : null,
    provider_response_id: providerMetadata?.response_id || null,
    provider_request_id: providerMetadata?.request_id || null,
    usage: providerUsage
  };
}

function buildAiFailClosedDecision(baseDecision) {
  return {
    response_mode: 'ESCALATE',
    confidence: 0,
    candidates: (baseDecision?.candidates || []).slice(0, 5),
    selected_records: [],
    clarification_options: [],
    escalation_message: DEFAULT_ESCALATION_MESSAGE,
    escalation_details: []
  };
}

function findEligibleOperationalRecord(records, knowledgeId) {
  return selectCanonicalRecordVersions(records).find((record) => (
    record.knowledge_id === knowledgeId
    && !isReferenceRecord(record)
    && isProductionEligibleRecord(record)
  )) || null;
}

function buildLockedRuntimeDecision(question, decision, context = {}, selectedRecord = null) {
  return {
    clarificationSelection: null,
    decision,
    decisionContext: context,
    referenceDecision: null,
    resolvedQuestion: question,
    selectedClarificationRecord: selectedRecord,
    workflowDecision: false,
    lockedDecision: true
  };
}

function buildLockedRecordRuntimeDecision(question, context, record, options = {}) {
  if (!record) return null;
  const pattern = options.patternQuestion
    ? getMatchingQuestionPattern(options.patternQuestion, record)
    : null;
  const answerOverride = options.answerOverride || pattern?.answer_override || null;
  return buildLockedRuntimeDecision(question, {
    response_mode: 'ANSWER',
    confidence: 1,
    candidates: [{
      knowledge_id: record.knowledge_id,
      version: record.version,
      canonical_situation: record.canonical_situation,
      score: 100
    }],
    selected_records: [record],
    answer: answerOverride?.direct_answer
      ? formatDriverCodeTerminology(answerOverride.direct_answer, record)
      : buildPresentedAnswer(record, question),
    more_info: record.more_info_answer || null,
    answer_structure: buildAnswerStructure(record, answerOverride)
  }, context, record);
}

function asksForTermDefinition(normalized, term) {
  const subject = `(?:a |an |the |my |our )?(?:${term})`;
  return new RegExp(`\\bwhat (?:is|are) ${subject}$`).test(normalized)
    || new RegExp(`\\bwhat (?:does|do) ${subject} (?:mean|stand for)(?:\\b.*)?$`).test(normalized)
    || new RegExp(`\\b(?:define|meaning of) ${subject}(?: for me)?$`).test(normalized)
    || new RegExp(`\\b${term}(?: code)? (?:definition|meaning)$`).test(normalized)
    || new RegExp(`\\bexplain what ${subject} is$`).test(normalized);
}

function findProtectedGlossaryRecord(question, records) {
  const normalized = normalizeDriverQuestion(question);
  const visionSidQuestion = (
    /\bvision label\b/.test(normalized)
    && /\bsid sticker\b/.test(normalized)
    && /\b(?:same|difference|versus|vs|mean)\b/.test(normalized)
  );
  if (visionSidQuestion) {
    return {
      record: findEligibleOperationalRecord(records, 'KNO-GLOSSARY-VISION-LABEL-SID-001'),
      answerOverride: {
        direct_answer: 'Yes. Vision Label and SID sticker refer to the same physical label on a package. Ready Route treats the terms as interchangeable.',
        steps: ['Treat either term as referring to that same physical package label.'],
        watch_for: 'This definition does not change any approved procedure for scanning, removing, replacing, or correcting the label.'
      }
    };
  }
  const comparisonRoute = /\bdifference between\b/.test(normalized)
    && /\bcxpc\b/.test(normalized)
    && /\bbc\b/.test(normalized)
    ? PROTECTED_GLOSSARY_ROUTES[0]
    : null;
  const route = comparisonRoute || PROTECTED_GLOSSARY_ROUTES.find((item) => (
    asksForTermDefinition(normalized, item.term)
  ));
  return route ? {
    record: findEligibleOperationalRecord(records, route.knowledgeId),
    answerOverride: null
  } : null;
}

function buildSignatureServiceRuntimeDecision(question, records, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const namesSpecificService = /\b(?:asr|dsr|isr|adult signature|required direct signature|direct signature|required indirect signature|indirect signature)\b/.test(normalized);
  const genericSignatureSituation = (
    /\bsignature\b/.test(normalized)
    && !namesSpecificService
    && (
      /\bsigned door tag\b/.test(normalized)
      || /\b(?:nobody|no one|no person)\b.*\b(?:home|there|available)\b/.test(normalized)
      || /\b(?:not|isn t|isnt) home\b/.test(normalized)
    )
  );
  if (!genericSignatureSituation) return null;

  const signatureIds = [
    'KNO-DEL-SIG-ASR-001',
    'KNO-DEL-SIG-DSR-001',
    'KNO-DEL-SIG-ISR-001'
  ];
  const ranked = signatureIds
    .map((knowledgeId) => findEligibleOperationalRecord(records, knowledgeId))
    .filter(Boolean)
    .map((record) => ({ record, score: 100 }));
  if (!ranked.length) return null;

  return buildLockedRuntimeDecision(question, {
    response_mode: 'CLARIFY',
    confidence: 1,
    candidates: ranked.map(({ record }) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      canonical_situation: record.canonical_situation,
      score: 100
    })),
    selected_records: [],
    clarification_prompt: buildClarificationPrompt(SIGNATURE_SERVICE_REQUIREMENT),
    clarification_requirement: SIGNATURE_SERVICE_REQUIREMENT,
    clarification_plan: [SIGNATURE_SERVICE_REQUIREMENT],
    clarification_options: clarificationOptionsForRequirement(SIGNATURE_SERVICE_REQUIREMENT, ranked)
  }, context, ranked[0].record);
}

function findHazmatPackageLabelRecord(question, records) {
  const normalized = normalizeDriverQuestion(question);
  const mentionsPackage = /\b(?:package|box)\b/.test(normalized);
  const mentionsHazmatLabel = (
    /\bhazmat (?:placard|label|sticker)\b/.test(normalized)
    || /\bdiamond(?: shaped)?(?: label| sticker)?\b/.test(normalized)
    || /\b(?:flammable|corrosive|toxic) (?:label|diamond|sticker)\b/.test(normalized)
    || /\bun (?:identification )?number\b/.test(normalized)
  );
  const asksForDifferentOperation = /\b(?:deliver|delivery|leak|leaking|spill|damag|load|unload|pickup|release|return|refus|signature)\b/.test(normalized);
  if (!mentionsPackage || !mentionsHazmatLabel || asksForDifferentOperation) return null;
  return findEligibleOperationalRecord(records, 'KNO-HAZ-PACKAGE-LABEL-001');
}

function buildPostUpdateRuntimeDecision(question, records, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const pendingRequirement = normalizeDriverQuestion(
    context.pending_clarification_requirement || context.pending_clarification_prompt
  );
  const lockedRecord = (knowledgeId, directAnswer = null) => buildLockedRecordRuntimeDecision(
    question,
    context,
    findEligibleOperationalRecord(records, knowledgeId),
    directAnswer ? { answerOverride: { direct_answer: directAnswer } } : {}
  );

  const asksForHandSheetDefinition = (
    /\bwhat is (?:the |a )?(?:hand sheet|blue sheet)\b/.test(normalized)
    || /\bwhat does (?:hand sheet|blue sheet) mean\b/.test(normalized)
    || /\bwhich form is called (?:the )?blue sheet\b/.test(normalized)
  );
  const asksHowToCompleteHandSheet = (
    /\b(?:hand sheet|blue sheet)\b/.test(normalized)
    && (asksForHandSheetDefinition || /\b(?:how|fill|complete|write|record|fields?|what goes)\b/.test(normalized))
    && !/\bop\s*207(?:res)?\b/.test(normalized)
  );
  if (asksHowToCompleteHandSheet) {
    return lockedRecord(
      'KNO-DOC-HANDSHEET-GENERAL-001',
      asksForHandSheetDefinition
        ? 'Use the current station-issued hand sheet and complete it using the verified field rules below.'
        : 'Fill each hand-sheet field using the verified field rules below.'
    );
  }

  const asksHowToCrossPackage = (
    /\bhow\b.*\bcrossing\b/.test(normalized)
    || /\bhow\b.*\bcross\b.*\b(?:package|box)\b/.test(normalized)
    || /\bcrossing\b.*\b(?:package|box|do it|mechanics|procedure)\b/.test(normalized)
    || /\bwhere\b.*\b(?:field|item|information)\b.*\bservice cross\b/.test(normalized)
  );
  if (asksHowToCrossPackage) {
    return lockedRecord(
      'KNO-DEL-NOTATION-001',
      'Use the four-quadrant layout below, and make sure the code matches the electronic status.'
    );
  }

  const groundCloudRouteMismatch = (
    /\bgroundcloud\b/.test(normalized)
    && /\broute\b/.test(normalized)
    && /\b(?:different|wrong|unexpected|isn t mine|isnt mine|not mine|not my expected)\b/.test(normalized)
  );
  if (groundCloudRouteMismatch) {
    return lockedRecord('KNO-GROUNDCLOUD-ROUTE-MISMATCH-001');
  }

  const cannotCompleteWholeRoute = (
    (/\broute\b/.test(normalized) || /\bfinish\b.*\ball my stops\b/.test(normalized))
    && !/\b(?:pickup|window|groundcloud|different route|wrong route)\b/.test(normalized)
    && (
      /\b(?:can t|cant|cannot|won t|wont|will not|unable to|not able to|don t think i can|dont think i can|do not think i can)\b.*\b(?:complete|finish|do)\b.*\b(?:whole|entire|all|my)?\s*route\b/.test(normalized)
      || /\b(?:complete|finish|do)\b.*\b(?:whole|entire|all|my)?\s*route\b.*\b(?:can t|cant|cannot|won t|wont|unable|not able)\b/.test(normalized)
      || /\bno way\b.*\bfinish\b.*\ball my stops\b/.test(normalized)
    )
  );
  if (cannotCompleteWholeRoute) {
    return lockedRecord('KNO-ROUTE-NOT-COMPLETE-001');
  }

  const unsafeAccessSubject = /\b(?:road|bridge|driveway|path|access|clearance|turn around|turnaround|flood|ice|snow|pothole|debris|fallen tree|construction)\b/.test(normalized)
    || /\bturn\b.*\baround\b/.test(normalized)
    || /\b(?:livestock|animals?)\b.*\b(?:block|blocks|blocking)\b.*\b(?:only )?(?:path|road|access)\b/.test(normalized);
  const unsafeAccessCondition = /\b(?:unsafe|unsecured|washed out|flooded|impassable|blocked|too steep|low clearance|can t fit|cant fit|no safe|dangerous)\b/.test(normalized);
  if (unsafeAccessSubject && unsafeAccessCondition) {
    return lockedRecord(
      'KNO-DEL-UNSAFE-ACCESS-001',
      'Do not drive into the unsafe condition. Apply Code 001 and add a comment explaining the specific reason.'
    );
  }

  const mentionsLeak = /\b(?:package|box|shipment|hazmat|hazardous material|dangerous goods)\b.*\b(?:leak|leaks|leaking|spill|spills|spilling)\b|\b(?:leak|leaks|leaking|spill|spills|spilling)\b.*\b(?:package|box|shipment|hazmat|hazardous material|dangerous goods)\b/.test(normalized);
  if (!mentionsLeak) return null;
  if (/\b(?:not|isn t|isnt|no)\s+(?:leaking|spilling)\b/.test(normalized)) return null;

  const otherPackagesUnaffected = (
    /\b(?:other|rest|remaining)\b.*\b(?:packages?|boxes)\b.*\b(?:fine|okay|ok|good|unaffected|not leaking|aren t leaking|arent leaking)\b/.test(normalized)
    || /\b(?:fine|okay|ok|good|unaffected|not leaking)\b.*\b(?:other|rest|remaining)\b.*\b(?:packages?|boxes)\b/.test(normalized)
    || /\bunaffected (?:packages?|pkg|pkgs)\b/.test(normalized)
  );
  if (otherPackagesUnaffected) {
    return lockedRecord('KNO-DEL-LEAK-SAME-ADDRESS-001');
  }

  const answeringLeakClarifier = /\bleaking package hazardous\b/.test(pendingRequirement)
    || /\bpackage leaking or hazardous\b/.test(pendingRequirement);
  const hazardIsUnknown = !answeringLeakClarifier
    && /\b(?:not sure|unsure|don t know|dont know|do not know|might|maybe|could be)\b.*\b(?:hazardous|hazmat)\b/.test(normalized);
  const saysNonHazardous = (
    answeringLeakClarifier && /^(?:no|not hazardous|nonhazardous|non hazardous|non hazmat|not hazmat)\b/.test(normalized)
  ) || /\b(?:not hazardous|nonhazardous|non hazardous|non hazmat|not hazmat)\b/.test(normalized);
  if (!hazardIsUnknown && saysNonHazardous) {
    return lockedRecord('KNO-DEL-LEAK-NONHAZ-001');
  }

  const saysHazardous = (
    answeringLeakClarifier && /^(?:yes|hazardous|hazmat|dangerous goods)\b/.test(normalized)
  ) || /\b(?:hazardous|hazmat|dangerous goods|hazard(?: sticker| label| labeled| marked))\b/.test(normalized);
  if (!hazardIsUnknown && saysHazardous) {
    return lockedRecord('KNO-HAZ-LEAK-001');
  }

  const leakRecords = [
    findEligibleOperationalRecord(records, 'KNO-HAZ-LEAK-001'),
    findEligibleOperationalRecord(records, 'KNO-DEL-LEAK-NONHAZ-001')
  ].filter(Boolean);
  return buildLockedRuntimeDecision(question, {
    response_mode: 'CLARIFY',
    confidence: 1,
    candidates: leakRecords.map((record) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      canonical_situation: record.canonical_situation,
      score: 100
    })),
    selected_records: [],
    clarification_prompt: buildClarificationPrompt(LEAK_HAZARD_REQUIREMENT),
    clarification_requirement: LEAK_HAZARD_REQUIREMENT,
    clarification_plan: [LEAK_HAZARD_REQUIREMENT],
    clarification_options: [
      {
        knowledge_id: 'KNO-HAZ-LEAK-001',
        version: findEligibleOperationalRecord(records, 'KNO-HAZ-LEAK-001')?.version || 1,
        label: 'Hazardous',
        query: 'Yes, the leaking package is hazardous'
      },
      {
        knowledge_id: 'KNO-DEL-LEAK-NONHAZ-001',
        version: findEligibleOperationalRecord(records, 'KNO-DEL-LEAK-NONHAZ-001')?.version || 1,
        label: 'Not hazardous',
        query: 'No, the leaking package is not hazardous'
      }
    ].filter((option) => leakRecords.some((record) => record.knowledge_id === option.knowledge_id))
  }, context, leakRecords[0] || null);
}

function buildMissedDeliveryRuntimeDecision(question, records, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const pendingRequirement = normalizeDriverQuestion(
    context.pending_clarification_requirement || context.pending_clarification_prompt
  );
  const meaningRequirement = normalizeDriverQuestion(MISSED_DELIVERY_MEANING_REQUIREMENT);
  const misdeliveryRecord = findEligibleOperationalRecord(
    records,
    'KNO-DEL-MISDELIVERY-RECOVERY-001'
  );
  const meansWrongAddress = (
    /\bmisdeliver(?:y|ed)?\b/.test(normalized)
    || /\b(?:delivered|left|dropped)\b.*\bwrong (?:address|house|location|door)\b/.test(normalized)
    || /\bwrong (?:address|house|location|door)\b/.test(normalized)
  );
  const meansIncompleteAttempt = (
    /\b(?:could not|couldn t|couldnt|unable to|did not|didn t|didnt|failed to)\b.*\b(?:complete|finish|make|deliver)\b/.test(normalized)
    || /\bdelivery (?:could not|couldn t|couldnt|was not|wasn t|wasnt) (?:be )?completed\b/.test(normalized)
  );

  if (pendingRequirement === meaningRequirement) {
    if (meansWrongAddress && misdeliveryRecord) {
      const requirement = misdeliveryRecord.clarification_requirements?.[0]
        || 'Has the package been physically recovered?';
      const ranked = [{ record: misdeliveryRecord, score: 100 }];
      return buildLockedRuntimeDecision(question, {
        response_mode: 'CLARIFY',
        confidence: 1,
        candidates: [{
          knowledge_id: misdeliveryRecord.knowledge_id,
          version: misdeliveryRecord.version,
          canonical_situation: misdeliveryRecord.canonical_situation,
          score: 100
        }],
        selected_records: [],
        clarification_prompt: buildClarificationPrompt(requirement),
        clarification_requirement: requirement,
        clarification_plan: misdeliveryRecord.clarification_requirements || [requirement],
        clarification_options: clarificationOptionsForRequirement(requirement, ranked)
      }, context, misdeliveryRecord);
    }

    if (meansIncompleteAttempt) {
      return buildLockedRuntimeDecision(question, {
        response_mode: 'CLARIFY',
        confidence: 1,
        candidates: [],
        selected_records: [],
        clarification_prompt: buildClarificationPrompt(MISSED_DELIVERY_REASON_REQUIREMENT),
        clarification_requirement: MISSED_DELIVERY_REASON_REQUIREMENT,
        clarification_plan: [MISSED_DELIVERY_REASON_REQUIREMENT],
        clarification_options: []
      }, context);
    }

    return null;
  }

  const saysMissedDelivery = /\bmissed (?:a |the )?delivery\b/.test(normalized);
  const suppliesSpecificMeaning = meansWrongAddress
    || meansIncompleteAttempt
    || /\b(?:because|since|due to|customer|recipient|nobody|no one|business|location|closed|locked|dog|animal|signature|identification|hazmat|damaged|weather|access|gate|apartment|window|commit|time)\b/.test(normalized);
  if (!saysMissedDelivery || suppliesSpecificMeaning) return null;

  return buildLockedRuntimeDecision(question, {
    response_mode: 'CLARIFY',
    confidence: 1,
    candidates: misdeliveryRecord ? [{
      knowledge_id: misdeliveryRecord.knowledge_id,
      version: misdeliveryRecord.version,
      canonical_situation: misdeliveryRecord.canonical_situation,
      score: 100
    }] : [],
    selected_records: [],
    clarification_prompt: buildClarificationPrompt(MISSED_DELIVERY_MEANING_REQUIREMENT),
    clarification_requirement: MISSED_DELIVERY_MEANING_REQUIREMENT,
    clarification_plan: [MISSED_DELIVERY_MEANING_REQUIREMENT],
    clarification_options: [
      {
        knowledge_id: 'FLOW:MISSED_DELIVERY_WRONG_ADDRESS',
        version: 1,
        label: 'Delivered to wrong address',
        query: 'I delivered the package to the wrong address'
      },
      {
        knowledge_id: 'FLOW:MISSED_DELIVERY_NOT_COMPLETED',
        version: 1,
        label: 'Could not complete delivery',
        query: 'I could not complete the delivery'
      }
    ]
  }, context);
}

function buildProtectedRuntimeDecision(question, records, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const pendingRequirement = normalizeDriverQuestion(
    context.pending_clarification_requirement || context.pending_clarification_prompt
  );

  const missedDeliveryDecision = buildMissedDeliveryRuntimeDecision(question, records, context);
  if (missedDeliveryDecision) return missedDeliveryDecision;

  const glossaryRoute = findProtectedGlossaryRecord(question, records);
  if (glossaryRoute?.record) {
    return buildLockedRecordRuntimeDecision(question, context, glossaryRoute.record, {
      answerOverride: glossaryRoute.answerOverride
    });
  }

  const postUpdateDecision = buildPostUpdateRuntimeDecision(question, records, context);
  if (postUpdateDecision) return postUpdateDecision;

  const hazmatPackageLabelRecord = findHazmatPackageLabelRecord(question, records);
  if (hazmatPackageLabelRecord) {
    return buildLockedRecordRuntimeDecision(question, context, hazmatPackageLabelRecord);
  }

  const signatureServiceDecision = buildSignatureServiceRuntimeDecision(question, records, context);
  if (signatureServiceDecision) return signatureServiceDecision;

  const employmentQuestion = (
    /\b(?:vacation|time off|pto|overtime|paycheck|payroll|wages?|benefits?)\b/.test(normalized)
    || /\b(?:hire|hiring|terminate|termination|fire|firing)\b.*\b(?:driver|employee|worker|staff)\b/.test(normalized)
  );
  if (employmentQuestion) {
    return buildLockedRuntimeDecision(question, {
      response_mode: 'ESCALATE',
      confidence: 1,
      candidates: [],
      selected_records: [],
      clarification_options: [],
      escalation_message: DEFAULT_ESCALATION_MESSAGE
    }, context);
  }

  if (/\bcode 0*30\b/.test(normalized)) {
    const referenceDecision = buildDriverHelpReferenceDecision(question, records);
    if (referenceDecision) {
      return {
        ...buildLockedRuntimeDecision(question, referenceDecision, context),
        referenceDecision
      };
    }
  }

  const code128SafetyQuestion = (
    /\bcode 128\b/.test(normalized)
    && /\b(?:safe|allowed|approved|authorized|correct format)\b/.test(normalized)
  );
  if (code128SafetyQuestion) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, VEHICLE_BARCODE_KNOWLEDGE_ID),
      {
        answerOverride: {
          direct_answer: 'Code 128 is the approved format for the vehicle-barcode workaround.',
          steps: ['Confirm the encoded value uses an uppercase V followed by the actual vehicle number.'],
          watch_for: 'Do not use another barcode format or a vehicle number that has not been verified.'
        }
      }
    );
  }

  const unsupportedCodRefusal = (
    /\bcod\b/.test(normalized)
    && /\b(?:customer|recipient)\b.*\b(?:refuse|refused|refuses|won t|wont)\b/.test(normalized)
    && (
      /\b(?:what|which) code\b.*\buse\b/.test(normalized)
      || /\bcode\b.*\b(?:should|do|can) i use\b/.test(normalized)
    )
  );
  if (unsupportedCodRefusal) {
    return buildLockedRuntimeDecision(question, {
      response_mode: 'ESCALATE',
      confidence: 1,
      candidates: [],
      selected_records: [],
      clarification_options: [],
      escalation_message: DEFAULT_ESCALATION_MESSAGE
    }, context);
  }

  const dsrDoorTagFollowUp = (
    (context.knowledge_ids || []).includes('KNO-DEL-SIG-DSR-001')
    && /\b(?:signed )?door tag\b/.test(normalized)
  );
  if (dsrDoorTagFollowUp) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, 'KNO-DEL-SIG-DSR-001'),
      {
        answerOverride: {
          direct_answer: 'No. A signed door tag cannot satisfy DSR.',
          steps: [
            'Do not leave the package.',
            'Use Code 007 for a residential stop or Code 004 for a non-residential stop.',
            'Complete the attempt documentation and keep the package.'
          ],
          watch_for: 'DSR requires an in-person signature at the labeled address.'
        }
      }
    );
  }

  const afterDispatchCodeFollowUp = (
    (context.knowledge_ids || []).includes('KNO-DEL-MISLOAD-AFTERDISPATCH-001')
    && /^(?:what|which) code (?:should|do|can) i use\b/.test(normalized)
  );
  if (afterDispatchCodeFollowUp) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, 'KNO-DEL-MISLOAD-AFTERDISPATCH-001')
    );
  }

  const leakingHazmatBranch = (
    /\bpackage leaking or hazardous\b/.test(pendingRequirement)
    && (
      /^yes\b/.test(normalized)
      || /\b(?:leak|leaking|spill|spilled|hazmat|hazardous)\b/.test(normalized)
    )
    && !/\b(?:not|isn t|isnt|no)\b.*\b(?:leak|leaking|hazmat|hazardous)\b/.test(normalized)
  );
  if (leakingHazmatBranch) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, 'KNO-HAZ-LEAK-001')
    );
  }

  const unknownMisdeliveryAddress = (
    (context.knowledge_ids || []).includes('KNO-DEL-MISDELIVERY-RECOVERY-001')
    && /\b(?:do not|dont|don t|unknown|not known)\b.*\bcorrect address\b|\bcorrect address\b.*\b(?:unknown|not known)\b/.test(normalized)
  );
  if (unknownMisdeliveryAddress) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, 'KNO-DEL-MISDELIVERY-RECOVERY-001'),
      {
        answerOverride: {
          direct_answer: 'Do not redeliver it until the correct address is established. Contact station or management for the approved disposition.',
          steps: [
            'Keep Code 17 as the recovered-misdelivery result.',
            'Contact station or management to establish the correct address or final disposition.'
          ],
          watch_for: 'Do not use Code 18 unless a same-day delivery to the correct address succeeds.'
        }
      }
    );
  }

  const bulkTransferRequest = (
    !/\b(?:manifest preview|misload|wrong route)\b/.test(normalized)
    && (
      /\bbulk transfer\b/.test(normalized)
      || /\btransfer\b.*\b(?:bulk|packages?)\b.*\b(?:driver|route|work area)\b/.test(normalized)
    )
  );
  if (bulkTransferRequest) {
    return buildLockedRecordRuntimeDecision(
      question,
      context,
      findEligibleOperationalRecord(records, 'KNO-FORGE-BULK-TRANSFER-001'),
      { patternQuestion: 'How do I bulk transfer packages?' }
    );
  }

  const pickupCodeComparison = (
    /\b(?:difference|compare|comparison)\b/.test(normalized)
    && /\b11\b/.test(normalized)
    && /\b20\b/.test(normalized)
    && /\b24\b/.test(normalized)
  );
  if (pickupCodeComparison) {
    const canceledRecord = findEligibleOperationalRecord(records, 'KNO-PUP-CANCELED-001');
    const code20Record = findEligibleOperationalRecord(records, 'KNO-PUP-CODE20-001');
    if (canceledRecord && code20Record) {
      const selectedRecords = [canceledRecord, code20Record];
      return buildLockedRuntimeDecision(question, {
        response_mode: 'ANSWER',
        confidence: 1,
        candidates: selectedRecords.map((record) => ({
          knowledge_id: record.knowledge_id,
          version: record.version,
          canonical_situation: record.canonical_situation,
          score: 100
        })),
        selected_records: selectedRecords,
        answer: 'Use Code 11 after an attempted pickup at a closed location with no packages; Code 20 after an attempted listed pickup when the customer confirms there are no packages; and Code 24 when the listed pickup was canceled before any attempt.',
        more_info: null,
        answer_structure: {
          direct_answer: 'Use Code 11 for closed after an attempt, Code 20 for customer-confirmed zero packages after an attempt, and Code 24 for cancellation before any attempt.',
          steps: [],
          watch_for: 'Do not use Code 11 unless the attempted location was closed.',
          options: [],
          procedure_steps: [],
          documentation: [],
          prohibited_actions: [],
          escalation_requirements: []
        }
      }, context);
    }
  }

  const customerDirectedAddressChange = (
    /\bcustomer\b.*\b(?:called|texted|told)\b.*\b(?:change|new|different)\b.*\baddress\b/.test(normalized)
  );
  if (customerDirectedAddressChange) {
    if (/\bmoved\b/.test(normalized)) {
      return buildLockedRecordRuntimeDecision(
        question,
        context,
        findEligibleOperationalRecord(records, 'KNO-FORGE-EDIT-ADDRESS-001'),
        {
          answerOverride: {
            direct_answer: 'No. Use Code 002 and return the package to the station.',
            steps: [
              'If the recipient moved or is not at the label address, use Code 002 and return the package to the station.',
              'If the correct recipient address has already been established through an approved source, follow the FORGE Edit Address procedure.'
            ],
            watch_for: 'Do not invent or guess a different recipient address. If the correct address has not already been established, obtain current station or management direction.'
          }
        }
      );
    }
    const approvedCustomerRequestRecord = findEligibleOperationalRecord(
      records,
      'KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001'
    );
    if (approvedCustomerRequestRecord) {
      return buildLockedRecordRuntimeDecision(
        question,
        context,
        approvedCustomerRequestRecord,
        {
          answerOverride: {
            direct_answer: 'Use the shipping-label address. The customer must call FedEx to change it.',
            steps: [
              'Do not change the delivery address based on the customer’s direct call or text.',
              'Continue to use the shipping-label address.',
              'Tell the customer they must contact FedEx for an address change.'
            ],
            watch_for: 'Do not self-authorize an address change from a direct customer request.'
          }
        }
      );
    }
    return buildLockedRuntimeDecision(question, {
      response_mode: 'ESCALATE',
      confidence: 1,
      candidates: [],
      selected_records: [],
      clarification_options: [],
      escalation_message: DEFAULT_ESCALATION_MESSAGE
    }, context);
  }

  return null;
}

function buildDeterministicRuntimeDecision(question, records, context = {}) {
  question = normalizeDriverUtterance(question);
  const protectedDecision = buildProtectedRuntimeDecision(question, records, context);
  if (protectedDecision) return protectedDecision;
  const vehicleBarcodeRecord = selectCanonicalRecordVersions(records).find((record) => (
    record.knowledge_id === VEHICLE_BARCODE_KNOWLEDGE_ID
    && !isReferenceRecord(record)
    && isProductionEligibleRecord(record)
  ));
  const vehicleBarcodeDecision = buildVehicleBarcodeWorkflowDecision(
    question,
    context,
    vehicleBarcodeRecord
  );
  if (vehicleBarcodeDecision) {
    return {
      clarificationSelection: null,
      decision: vehicleBarcodeDecision,
      decisionContext: context,
      referenceDecision: null,
      resolvedQuestion: question,
      selectedClarificationRecord: vehicleBarcodeRecord,
      workflowDecision: true
    };
  }

  const normalizedQuestion = normalizeDriverQuestion(question);
  const isApprovedIsrDoorTagFollowUp = (
    context.last_response_mode === 'ANSWER'
    && (context.knowledge_ids || []).includes('KNO-DEL-SIG-ISR-001')
    && /\bdoor tag\b/.test(normalizedQuestion)
    && (
      /\b(?:itself|iteslf|it|form)\b/.test(normalizedQuestion)
      || /^(?:what|where|how|can|could|should|do|does|did)\b/.test(normalizedQuestion)
    )
  );
  if (isApprovedIsrDoorTagFollowUp) {
    const sraRecord = selectCanonicalRecordVersions(records).find((record) => (
      record.knowledge_id === 'KNO-DEL-SRA-001'
      && !isReferenceRecord(record)
      && isProductionEligibleRecord(record)
    ));
    if (sraRecord) {
      const decision = {
        response_mode: 'ANSWER',
        confidence: 1,
        candidates: [{
          knowledge_id: sraRecord.knowledge_id,
          version: sraRecord.version,
          canonical_situation: sraRecord.canonical_situation,
          score: 100
        }],
        selected_records: [sraRecord],
        answer: buildPresentedAnswer(sraRecord, question),
        more_info: sraRecord.more_info_answer || null,
        answer_structure: buildAnswerStructure(sraRecord, null)
      };
      return {
        clarificationSelection: null,
        decision,
        decisionContext: context,
        referenceDecision: null,
        resolvedQuestion: question,
        selectedClarificationRecord: sraRecord,
        workflowDecision: false
      };
    }
  }

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
  const operationalDecision = buildDriverHelpDecision(
    resolvedQuestion,
    records.filter((record) => !isReferenceRecord(record)),
    decisionContext
  );
  const operationalRecord = operationalDecision.selected_records?.[0] || null;
  const exactOperationalMatch = Boolean(
    operationalDecision.response_mode === 'ANSWER'
    && operationalRecord
    && (
      getMatchingQuestionPattern(resolvedQuestion, operationalRecord)
      || getMatchingQuestionPattern(question, operationalRecord)
      || (operationalRecord.driver_question_variants || []).some((variant) => (
        normalizeDriverQuestion(variant) === normalizeDriverQuestion(question)
        || normalizeDriverQuestion(variant) === normalizeDriverQuestion(resolvedQuestion)
      ))
    )
  );
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
    : (exactOperationalMatch ? operationalDecision : referenceDecision || operationalDecision);
  const authoredDecisionRecord = decision.selected_records?.[0] || null;
  const authoredAnswerPattern = authoredDecisionRecord
    ? (
      getMatchingQuestionPattern(resolvedQuestion, authoredDecisionRecord)
      || getMatchingQuestionPattern(question, authoredDecisionRecord)
    )
    : null;
  const lockedDecision = Boolean(
    decision.response_mode === 'ANSWER'
    && (
      authoredAnswerPattern?.answer_override
      || (
        context.pending_clarification_prompt
        && decision.confidence === 1
      )
    )
  );
  return {
    clarificationSelection,
    decision,
    decisionContext,
    referenceDecision,
    resolvedQuestion,
    selectedClarificationRecord,
    workflowDecision: false,
    lockedDecision
  };
}

function createDriverHelpService({
  supabase = defaultSupabase,
  now = () => new Date(),
  aiInterpreter = createDriverHelpAiInterpreter(),
  aiInterpretationMode = resolveDriverHelpAiInterpretationMode()
} = {}) {
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
    persist = true,
    sessionContext = null,
    includeDiagnostics = false,
    aiInterpretationModeOverride = null,
    allowAiProcessing = true
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
        : Promise.resolve({ session_id: null, context: sessionContext || {} })
    ]);
    const runtime = buildDeterministicRuntimeDecision(question, records, sessionState.context);
    const {
      clarificationSelection,
      decision: baseDecision,
      decisionContext,
      referenceDecision,
      resolvedQuestion,
      selectedClarificationRecord,
      workflowDecision,
      lockedDecision = false
    } = runtime;
    let interpretedDecision = null;
    let interpretationMode = 'DETERMINISTIC';
    let interpretationConfidence = null;
    let interpretationResult = {};
    let validatedAiInterpretation = null;
    const aiFacingQuestion = buildAiFacingQuestion(resolvedQuestion, decisionContext);
    const requestIntent = isGlossaryQuestion(resolvedQuestion) ? 'DEFINITION' : 'OPERATIONAL_GUIDANCE';
    const knownUnapprovedBoundary = matchesKnownUnapprovedQuestion(resolvedQuestion);
    const aiCandidates = buildAiCandidateRecords(records, {
      driverQuestion: resolvedQuestion,
      context: decisionContext,
      preferredKnowledgeIds: [
        ...(baseDecision.candidates || []).slice(0, 5).map((candidate) => candidate.knowledge_id),
        ...(decisionContext.knowledge_ids || [])
      ]
    });
    const requiresGroundedAi = Boolean(
      knownUnapprovedBoundary
      || (
        !selectedClarificationRecord
        && !referenceDecision
        && !workflowDecision
        && !lockedDecision
        && !isProtectedInterpretationRequest(resolvedQuestion)
      )
    );
    const shouldInterpret = Boolean(
      aiInterpreter
      && effectiveAiInterpretationMode === 'ACTIVE'
      && requiresGroundedAi
      && !knownUnapprovedBoundary
      && aiCandidates.length
    );
    if (knownUnapprovedBoundary) {
      interpretationMode = 'AI_FAIL_CLOSED';
      interpretationResult = {
        ...buildInterpretationResult({
          status: 'KNOWN_UNAPPROVED',
          baseDecision,
          candidateRecords: aiCandidates
        }),
        ai: {
          status: 'KNOWN_UNAPPROVED',
          attempt_count: 0,
          call_count: 0,
          retried: false,
          attempts: []
        }
      };
    } else if (shouldInterpret) {
      const interpretationStartedAt = Date.now();
      try {
        const interpretationRequest = {
          safety_identifier: buildAiSafetyIdentifier(accountId, actorType, actorId),
          driver_question: redactTextForAi(aiFacingQuestion),
          conversation_context: {
            ...redactConversationContextForAi({
              original_situation: decisionContext.situation_question || null,
              clarification_history: decisionContext.clarification_history || [],
              previous_question: decisionContext.last_question || null,
              pending_clarification_prompt: decisionContext.pending_clarification_prompt || null,
              previous_knowledge_ids: decisionContext.knowledge_ids || [],
              interpreted_facts: decisionContext.interpretation_facts || null
            }),
            request_intent: requestIntent
          },
          candidate_records: aiCandidates
        };
        const guarded = await runGuardedInterpretation({
          interpreter: aiInterpreter,
          request: interpretationRequest,
          validate: (raw) => validateInterpretation(
            raw,
            aiCandidates,
            undefined,
            resolvedQuestion
          ),
          maximumAttempts: 2,
          defaultModel: process.env.READYROUTE_DRIVER_HELP_MODEL || null
        });
        const interpretation = guarded.interpretation;
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
          interpretationMode = interpretedDecision ? 'GROUNDED_AI' : 'AI_FAIL_CLOSED';
          interpretationConfidence = interpretedDecision ? interpretation.confidence : null;
          interpretationResult = {
            ...buildInterpretationResult({
              status: interpretedDecision ? 'VALID' : 'REJECTED',
              baseDecision,
              interpretation: interpretedDecision ? interpretation : null,
              latencyMs: Date.now() - interpretationStartedAt,
              providerMetadata: guarded.accepted_provider_metadata,
              candidateRecords: aiCandidates
            }),
            usage: guarded.usage,
            ai: {
              status: interpretedDecision ? 'GROUNDED' : 'REJECTED',
              attempt_count: guarded.attempts.length,
              call_count: guarded.call_count,
              retried: guarded.attempts.length > 1,
              attempts: guarded.attempts
            }
          };
        } else {
          interpretationMode = 'AI_FAIL_CLOSED';
          interpretationResult = {
            ...buildInterpretationResult({
              status: guarded.status,
              baseDecision,
              latencyMs: Date.now() - interpretationStartedAt,
              candidateRecords: aiCandidates
            }),
            usage: guarded.usage,
            ai: {
              status: guarded.status,
              attempt_count: guarded.attempts.length,
              call_count: guarded.call_count,
              retried: guarded.attempts.length > 1,
              attempts: guarded.attempts
            }
          };
        }
      } catch (_error) {
        interpretationMode = 'AI_FAIL_CLOSED';
        interpretationResult = {
          ...buildInterpretationResult({
            status: 'ERROR',
            baseDecision,
            latencyMs: Date.now() - interpretationStartedAt,
            candidateRecords: aiCandidates
          }),
          ai: {
            status: 'ERROR',
            attempt_count: 0,
            call_count: 0,
            retried: false,
            attempts: []
          }
        };
      }
    } else if (requiresGroundedAi) {
      const unavailableStatus = aiCandidates.length ? 'UNAVAILABLE' : 'NO_CANDIDATES';
      interpretationMode = 'AI_FAIL_CLOSED';
      interpretationResult = {
        ...buildInterpretationResult({
          status: unavailableStatus,
          baseDecision,
          candidateRecords: aiCandidates
        }),
        ai: {
          status: unavailableStatus,
          attempt_count: 0,
          call_count: 0,
          retried: false,
          attempts: []
        }
      };
    }

    // AI may select a published record. The response is rendered only from
    // that canonical record; AI never authors or expands operational content.
    const aiFailClosedDecision = requiresGroundedAi
      && !interpretedDecision
      ? buildAiFailClosedDecision(baseDecision)
      : null;
    if (aiFailClosedDecision) interpretationMode = 'AI_FAIL_CLOSED';
    const interpretedOrBaseDecision = interpretedDecision || aiFailClosedDecision || baseDecision;
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
    let decision = {
      ...(loopDetected ? {
        response_mode: 'ESCALATE',
        confidence: actionableBaseDecision.confidence,
        candidates: actionableBaseDecision.candidates || [],
        selected_records: [],
        clarification_options: [],
        escalation_message: DEFAULT_ESCALATION_MESSAGE
      } : actionableBaseDecision),
      composition_mode: 'DETERMINISTIC',
      composition_grounding: [],
      interpretation_mode: interpretationMode,
      interpretation_confidence: interpretationConfidence,
      interpretation_result: interpretationResult
    };

    if (
      persist
      && validatedAiInterpretation
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
      : null;
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
      ...(persist ? {} : { session_context: nextSessionContext, test_mode: true }),
      interaction_id: interactionId,
      response_mode: decision.response_mode,
      answer_type: decision.answer_type || 'OPERATIONAL',
      answer: decision.answer || null,
      more_info: decision.more_info || null,
      answer_structure: decision.answer_structure || null,
      barcode: decision.barcode || null,
      images,
      composition_mode: decision.composition_mode || 'DETERMINISTIC',
      interpretation_mode: decision.interpretation_mode || 'DETERMINISTIC',
      interpretation_confidence: decision.interpretation_confidence,
      ...(includeDiagnostics ? {
        interpretation_result: decision.interpretation_result || {},
        composition_validation: decision.composition_validation || null
      } : {}),
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
  applyAiInterpretation,
  applyClarificationAnswerToContext,
  buildAiFacingQuestion,
  buildAiFailClosedDecision,
  buildAiCandidateRecords,
  buildContextualQuestion,
  buildDeterministicRuntimeDecision,
  buildNextSessionContext,
  extractDriverUtterance,
  clarificationPromptDetail,
  buildAiSafetyIdentifier,
  buildInterpretationResult,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isMissingTableError,
  isGlossaryQuestion,
  matchesKnownUnapprovedQuestion,
  isClarificationAnswerSufficient,
  isAnswerMemoryEligibleQuestion,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
};
