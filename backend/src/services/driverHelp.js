const crypto = require('crypto');

const defaultSupabase = require('../lib/supabase');
const {
  buildAnswerStructure,
  buildClarificationPrompt,
  buildDriverHelpDecision,
  buildPresentedAnswer,
  isProductionEligibleRecord,
  normalizeDriverQuestion,
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

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST106', 'PGRST204', 'PGRST205']);

function isMissingTableError(error) {
  return Boolean(error && MISSING_TABLE_CODES.has(error.code));
}

function randomId() {
  return crypto.randomUUID();
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
  return options.find((option) => (
    normalizeDriverQuestion(option?.label) === normalized
    || normalizeDriverQuestion(option?.query) === normalized
  )) || null;
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
  if (!selection || decision?.response_mode !== 'CLARIFY') return false;
  const previousPrompt = normalizeDriverQuestion(context.pending_clarification_prompt);
  const nextPrompt = normalizeDriverQuestion(decision.clarification_prompt);
  if (!previousPrompt || previousPrompt !== nextPrompt) return false;

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

function buildContextualQuestion(question, context = {}) {
  const currentAnswer = resolveClarificationFollowUp(question, context);
  const pendingPrompt = String(context.pending_clarification_prompt || '').trim();
  if (!pendingPrompt) return currentAnswer;

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
  const situationQuestion = pendingPrompt
    ? String(previousContext.situation_question || previousContext.last_question || question).trim()
    : String(question || '').trim();
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

function buildAiCandidateRecords(records) {
  return selectCanonicalRecordVersions(records)
    .filter((record) => !isReferenceRecord(record) && isProductionEligibleRecord(record))
    .slice(0, 40)
    .map((record) => ({
      knowledge_id: record.knowledge_id,
      version: record.version,
      canonical_situation: record.canonical_situation,
      normalized_description: record.normalized_description || '',
      applicability: record.applicability || [],
      conditions: record.conditions || [],
      exceptions: record.exceptions || [],
      clarification_requirements: record.clarification_requirements || [],
      driver_question_variants: record.driver_question_variants || [],
      driver_question_patterns: (record.driver_question_patterns || []).map((pattern) => ({
        utterance: pattern?.utterance || '',
        response_mode: pattern?.response_mode || null,
        information_sufficiency: pattern?.information_sufficiency || null,
        must_clarify: pattern?.must_clarify || []
      }))
    }));
}

function hasDataAuthoredQuestionMatch(question, records) {
  const normalized = normalizeDriverQuestion(question);
  const normalizedPattern = tokenize(question).join(' ');
  return selectCanonicalRecordVersions(records)
    .filter((record) => !isReferenceRecord(record) && isProductionEligibleRecord(record))
    .some((record) => (
      (record.driver_question_variants || []).some((variant) => (
        normalizeDriverQuestion(variant) === normalized
      )) || (record.driver_question_patterns || []).some((pattern) => (
        tokenize(pattern?.utterance).join(' ') === normalizedPattern
      ))
    ));
}

function applyAiInterpretation(interpretation, question, records, baseDecision) {
  const selectedRecord = selectCanonicalRecordVersions(records).find((record) => (
    record.knowledge_id === interpretation.knowledge_id
    && isProductionEligibleRecord(record)
    && !isReferenceRecord(record)
  ));
  if (!selectedRecord) return null;

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
    return {
      response_mode: 'CLARIFY',
      confidence: interpretation.confidence,
      candidates,
      selected_records: [],
      clarification_prompt: buildClarificationPrompt(interpretation.clarification_requirement),
      clarification_requirement: interpretation.clarification_requirement,
      clarification_options: []
    };
  }

  return {
    response_mode: 'ANSWER',
    confidence: interpretation.confidence,
    candidates,
    selected_records: [selectedRecord],
    answer: buildPresentedAnswer(selectedRecord, question),
    more_info: selectedRecord.more_info_answer || null,
    answer_structure: buildAnswerStructure(selectedRecord, question)
  };
}

function buildInterpretationResult({
  status,
  baseDecision,
  interpretation = null,
  latencyMs = null
}) {
  const deterministicKnowledgeId = baseDecision.selected_records?.[0]?.knowledge_id
    || baseDecision.candidates?.[0]?.knowledge_id
    || null;
  return {
    status,
    proposed_knowledge_id: interpretation?.knowledge_id || null,
    proposed_response_mode: interpretation?.decision || null,
    proposed_clarification_requirement: interpretation?.clarification_requirement || null,
    confidence: interpretation?.confidence ?? null,
    deterministic_knowledge_id: deterministicKnowledgeId,
    deterministic_response_mode: baseDecision.response_mode,
    record_agreement: interpretation
      ? interpretation.knowledge_id === deterministicKnowledgeId
      : null,
    response_mode_agreement: interpretation
      ? interpretation.decision === baseDecision.response_mode
      : null,
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : null
  };
}

function createDriverHelpService({
  supabase = defaultSupabase,
  now = () => new Date(),
  aiInterpreter = createDriverHelpAiInterpreter(),
  aiInterpretationMode = resolveDriverHelpAiInterpretationMode()
} = {}) {
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
    aiInterpretationModeOverride = null
  }) {
    const startedAt = Date.now();
    const effectiveAiInterpretationMode = ['OFF', 'SHADOW', 'ACTIVE'].includes(
      String(aiInterpretationModeOverride || '').toUpperCase()
    )
      ? String(aiInterpretationModeOverride).toUpperCase()
      : aiInterpretationMode;
    const [records, sessionState] = await Promise.all([
      loadKnowledgeRecords(),
      loadSessionContext(sessionId, accountId, actorType, actorId)
    ]);
    const clarificationSelection = resolveClarificationSelection(question, sessionState.context);
    const resolvedQuestion = buildContextualQuestion(question, sessionState.context);
    const decisionContext = applyClarificationAnswerToContext(sessionState.context, question);
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
    const referenceDecision = buildDriverHelpReferenceDecision(resolvedQuestion, records);
    const baseDecision = selectedClarificationRecord
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
          answer: buildPresentedAnswer(selectedClarificationRecord, resolvedQuestion),
          more_info: selectedClarificationRecord.more_info_answer || null,
          answer_structure: buildAnswerStructure(selectedClarificationRecord, resolvedQuestion)
        }
      : referenceDecision || buildDriverHelpDecision(
          resolvedQuestion,
          records.filter((record) => !isReferenceRecord(record)),
          decisionContext
        );
    let interpretedDecision = null;
    let interpretationMode = 'DETERMINISTIC';
    let interpretationConfidence = null;
    let interpretationResult = {};
    const aiCandidates = buildAiCandidateRecords(records);
    const shouldInterpret = Boolean(
      aiInterpreter
      && ['SHADOW', 'ACTIVE'].includes(effectiveAiInterpretationMode)
      && !selectedClarificationRecord
      && !referenceDecision
      && !isProtectedInterpretationRequest(resolvedQuestion)
      && !hasDataAuthoredQuestionMatch(resolvedQuestion, records)
      && aiCandidates.length
    );
    if (shouldInterpret) {
      const interpretationStartedAt = Date.now();
      try {
        const rawInterpretation = await aiInterpreter({
          safety_identifier: buildAiSafetyIdentifier(accountId, actorType, actorId),
          driver_question: resolvedQuestion,
          conversation_context: {
            original_situation: decisionContext.situation_question || null,
            clarification_history: decisionContext.clarification_history || [],
            previous_question: decisionContext.last_question || null,
            pending_clarification_prompt: decisionContext.pending_clarification_prompt || null,
            previous_knowledge_ids: decisionContext.knowledge_ids || []
          },
          candidate_records: aiCandidates
        });
        const interpretation = validateInterpretation(rawInterpretation, aiCandidates);
        if (interpretation) {
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
            latencyMs: Date.now() - interpretationStartedAt
          });
        } else {
          interpretationMode = effectiveAiInterpretationMode === 'SHADOW'
            ? 'AI_SHADOW_FALLBACK'
            : 'DETERMINISTIC_FALLBACK';
          interpretationResult = buildInterpretationResult({
            status: 'DECLINED_OR_REJECTED',
            baseDecision,
            latencyMs: Date.now() - interpretationStartedAt
          });
        }
      } catch (_error) {
        interpretationMode = effectiveAiInterpretationMode === 'SHADOW'
          ? 'AI_SHADOW_FALLBACK'
          : 'DETERMINISTIC_FALLBACK';
        interpretationResult = buildInterpretationResult({
          status: 'ERROR',
          baseDecision,
          latencyMs: Date.now() - interpretationStartedAt
        });
      }
    }

    // AI interprets language only. Published record content remains the sole
    // source of every driver-facing answer, step, code, warning, and More Info.
    const interpretedOrBaseDecision = effectiveAiInterpretationMode === 'ACTIVE' && interpretedDecision
      ? interpretedDecision
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
        escalation_message: 'That choice did not resolve to one approved procedure. Contact your manager or station for the current direction rather than repeating the same selection.'
      } : actionableBaseDecision),
      composition_mode: 'DETERMINISTIC',
      composition_grounding: [],
      interpretation_mode: interpretationMode,
      interpretation_confidence: interpretationConfidence,
      interpretation_result: interpretationResult
    };
    const effectiveSessionId = await createOrUpdateSession({
      sessionId: sessionState.session_id,
      accountId,
      driverId,
      actorType,
      actorId,
      question,
      decision,
      previousContext: decisionContext
    });
    const interactionId = await recordInteraction({
      sessionId: effectiveSessionId,
      accountId,
      driverId,
      actorType,
      actorId,
      question,
      decision,
      responseLatencyMs: Math.max(0, Date.now() - startedAt)
    });
    const images = decision.response_mode === 'ANSWER'
      ? await getAnswerImages(decision.selected_records)
      : [];

    return {
      session_id: effectiveSessionId,
      interaction_id: interactionId,
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
      .select('id')
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
    return { interaction_id: interactionId, rating, comment: comment || null };
  }

  return {
    answerQuestion,
    loadKnowledgeRecords,
    saveFeedback
  };
}

module.exports = {
  applyAiInterpretation,
  applyClarificationAnswerToContext,
  buildAiCandidateRecords,
  buildContextualQuestion,
  buildNextSessionContext,
  clarificationPromptDetail,
  buildAiSafetyIdentifier,
  buildInterpretationResult,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isMissingTableError,
  isClarificationAnswerSufficient,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
};
