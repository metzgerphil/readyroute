const crypto = require('crypto');

const defaultSupabase = require('../lib/supabase');
const {
  buildDriverHelpDecision,
  normalizeDriverQuestion
} = require('./driverHelpRetrieval');
const {
  buildDriverHelpReferenceDecision,
  isReferenceRecord
} = require('./driverHelpReference');
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

function resolveClarificationFollowUp(question, context = {}) {
  const normalized = normalizeDriverQuestion(question);
  const options = Array.isArray(context.pending_clarification_options)
    ? context.pending_clarification_options
    : [];
  const selected = options.find((option) => (
    normalizeDriverQuestion(option?.label) === normalized
  ));
  if (selected?.query) return selected.query;
  if (/^(?:i m |im )?not sure$/.test(normalized) && context.pending_clarification_not_sure_query) {
    return context.pending_clarification_not_sure_query;
  }
  return question;
}

function createDriverHelpService({
  supabase = defaultSupabase,
  now = () => new Date()
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

  async function createOrUpdateSession({ sessionId, accountId, driverId, actorType, actorId, question, decision }) {
    const timestamp = now().toISOString();
    const contextualCandidates = decision.selected_records.length
      ? decision.selected_records.map((record) => ({ knowledge_id: record.knowledge_id, version: record.version }))
      : (decision.candidates || []).slice(0, 3);
    const context = {
      knowledge_ids: contextualCandidates.map((record) => record.knowledge_id),
      knowledge_versions: contextualCandidates.map((record) => record.version),
      last_response_mode: decision.response_mode,
      last_question: question,
      pending_clarification_id: decision.response_mode === 'CLARIFY'
        ? decision.clarification_id || null
        : null,
      pending_clarification_options: decision.response_mode === 'CLARIFY'
        ? (decision.clarification_options || []).map((option) => ({
            label: option.label,
            query: option.query || null
          }))
        : [],
      pending_clarification_not_sure_query: decision.response_mode === 'CLARIFY'
        ? decision.clarification_not_sure_query || null
        : null
    };

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

  async function answerQuestion({ accountId, driverId, actorType = 'driver', actorId = driverId, question, sessionId = null }) {
    const startedAt = Date.now();
    const [records, sessionState] = await Promise.all([
      loadKnowledgeRecords(),
      loadSessionContext(sessionId, accountId, actorType, actorId)
    ]);
    const resolvedQuestion = resolveClarificationFollowUp(question, sessionState.context);
    const referenceDecision = buildDriverHelpReferenceDecision(resolvedQuestion, records);
    const baseDecision = referenceDecision || buildDriverHelpDecision(
      resolvedQuestion,
      records.filter((record) => !isReferenceRecord(record)),
      sessionState.context
    );
    // Canonical records already contain reviewed driver-facing wording. Keep
    // language interpretation in retrieval and return the selected record's
    // published answer without a second model rewriting it.
    const decision = {
      ...baseDecision,
      composition_mode: 'DETERMINISTIC',
      composition_grounding: []
    };
    const effectiveSessionId = await createOrUpdateSession({
      sessionId: sessionState.session_id,
      accountId,
      driverId,
      actorType,
      actorId,
      question,
      decision
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
  createDriverHelpService,
  isMissingTableError,
  resolveClarificationFollowUp
};
