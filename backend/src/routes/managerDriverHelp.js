const express = require('express');

const defaultSupabase = require('../lib/supabase');
const {
  answerMemoryRouteKey,
  applyAiInterpretation,
  createDriverHelpService,
  isMissingTableError
} = require('../services/driverHelp');

function getInteractionMemoryRouteKey(interaction) {
  const interpretation = interaction?.interpretation_result || {};
  const explicitRouteKey = interpretation.memory_route_key
    || interpretation.memory_audit?.suspended_route_key
    || null;
  if (explicitRouteKey) return explicitRouteKey;
  const normalizedQuestion = String(interaction?.normalized_question || '').trim();
  if (!normalizedQuestion || interaction?.privacy_purged_at) return null;
  return answerMemoryRouteKey(normalizedQuestion);
}

function getAnswerMemoryReviewReason(route) {
  const required = Number(route.required_agreements || 0);
  const agreements = Number(route.agreement_count || 0);
  if (route.status === 'REVIEW_REQUIRED') {
    const remaining = Math.max(required - agreements, 0);
    return remaining
      ? `High-risk route is waiting for ${remaining} more matching AI confirmation${remaining === 1 ? '' : 's'}.`
      : 'High-risk route is ready for ReadyRoute staff approval.';
  }
  if (route.status === 'SUSPENDED') {
    if (Number(route.negative_feedback_count || 0) > 0) return 'Suspended after a driver or manager marked the answer unhelpful.';
    if (Number(route.audit_disagreement_count || 0) > 0) return 'Suspended because a production AI audit disagreed with the remembered route.';
    if (Number(route.disagreement_count || 0) > 0) return 'Suspended because matching AI interpretations disagreed about the correct route.';
    return 'Suspended by ReadyRoute staff pending review.';
  }
  if (route.status === 'CANDIDATE') {
    const remaining = Math.max(required - agreements, 0);
    return remaining
      ? `Still learning. Waiting for ${remaining} more matching AI confirmation${remaining === 1 ? '' : 's'}.`
      : 'Confirmation requirement is met and the route is waiting to activate.';
  }
  return 'Active and available for eligible repeated questions.';
}

function createManagerDriverHelpRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const getRequestContext = options.getRequestContext || ((req) => ({
    accountId: req.account.account_id,
    actorType: 'manager',
    actorId: req.account.manager_user_id || req.account.account_id,
    persist: true,
    sessionContext: null
  }));
  const globalOverview = options.globalOverview === true;
  const now = options.now || (() => new Date());
  const authorizeReview = options.authorizeReview || (() => true);
  const service = options.service || createDriverHelpService({
    supabase,
    now: options.now
  });

  router.post('/query', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const sessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;
    if (question.length < 1 || question.length > 500) {
      return res.status(400).json({ error: 'Question must be between 1 and 500 characters.' });
    }

    try {
      const context = getRequestContext(req);
      const requestedInterpretationMode = String(req.body?.ai_interpretation_mode || '').toUpperCase();
      const aiInterpretationModeOverride = ['OFF', 'SHADOW', 'ACTIVE'].includes(requestedInterpretationMode)
        ? requestedInterpretationMode
        : 'ACTIVE';
      const result = await service.answerQuestion({
        accountId: context.accountId,
        driverId: null,
        actorType: context.actorType || 'manager',
        actorId: context.actorId,
        question,
        sessionId,
        ...(context.persist === false ? {
          persist: false,
          sessionContext: context.sessionContext || req.body?.session_context || null
        } : {}),
        includeDiagnostics: true,
        aiInterpretationModeOverride
      });
      return res.status(200).json(result);
    } catch (error) {
      console.error('Manager RRA test query failed:', error);
      return res.status(500).json({ error: 'Ready Route could not check the approved procedures right now.' });
    }
  });

  router.post('/interactions/:interaction_id/feedback', async (req, res) => {
    const rating = String(req.body?.rating || '').trim().toLowerCase();
    const comment = req.body?.comment == null ? null : String(req.body.comment).trim();
    if (!['up', 'down'].includes(rating)) {
      return res.status(400).json({ error: 'Rating must be up or down.' });
    }
    if (comment && comment.length > 1000) {
      return res.status(400).json({ error: 'Feedback comment must be 1000 characters or fewer.' });
    }

    try {
      const context = getRequestContext(req);
      if (context.persist === false) {
        return res.status(400).json({ error: 'Staff test answers are not saved as customer feedback.' });
      }
      const feedback = await service.saveFeedback({
        accountId: context.accountId,
        driverId: null,
        actorType: context.actorType || 'manager',
        actorId: context.actorId,
        interactionId: req.params.interaction_id,
        rating,
        comment
      });
      if (!feedback) return res.status(404).json({ error: 'Interaction not found.' });
      return res.status(200).json({ feedback });
    } catch (error) {
      console.error('Manager RRA test feedback failed:', error);
      return res.status(500).json({ error: 'Feedback could not be saved right now.' });
    }
  });

  router.get('/answer-memory', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    const allowedStatuses = new Set(['CANDIDATE', 'ACTIVE', 'REVIEW_REQUIRED', 'SUSPENDED']);
    try {
      let query = supabase
        .from('driver_help_answer_memory')
        .select('route_key, normalized_question, knowledge_id, knowledge_version, response_mode, answer_pattern_id, clarification_requirement, risk_tier, status, agreement_count, disagreement_count, reuse_count, semantic_reuse_count, negative_feedback_count, audit_count, audit_agreement_count, audit_disagreement_count, audit_error_count, last_audited_at, highest_confidence, activated_at, reviewed_at, first_seen_at, last_seen_at, last_used_at')
        .order('last_seen_at', { ascending: false })
        .limit(limit);
      if (allowedStatuses.has(requestedStatus)) query = query.eq('status', requestedStatus);
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return res.status(200).json({ routes: [], setup_required: true });
        throw error;
      }
      const companyWindowDays = 90;
      const companyWindowStart = new Date(now().getTime() - companyWindowDays * 24 * 60 * 60 * 1000).toISOString();
      const [records, interactionsResult, accountsResult] = await Promise.all([
        service.loadKnowledgeRecords(),
        globalOverview
          ? supabase
            .from('driver_help_interactions')
            .select('id, account_id, question, normalized_question, interpretation_mode, interpretation_result, privacy_purged_at, created_at')
            .gte('created_at', companyWindowStart)
            .order('created_at', { ascending: false })
            .limit(5000)
          : Promise.resolve({ data: [], error: null }),
        globalOverview
          ? supabase.from('accounts').select('id, company_name').order('company_name', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);
      if (interactionsResult.error) throw interactionsResult.error;
      if (accountsResult.error) throw accountsResult.error;

      const accountNames = new Map((accountsResult.data || []).map((account) => [
        account.id,
        account.company_name || 'Unnamed company'
      ]));
      const routeUsage = new Map();
      (interactionsResult.data || []).forEach((interaction) => {
        const routeKey = getInteractionMemoryRouteKey(interaction);
        if (!routeKey) return;
        const usage = routeUsage.get(routeKey) || {
          recent_question_count: 0,
          latest_question: null,
          latest_company_id: null,
          latest_company_name: null,
          latest_interaction_at: null,
          companies: new Map()
        };
        usage.recent_question_count += 1;
        if (!usage.latest_interaction_at) {
          const retainedQuestion = String(interaction.question || '').trim();
          usage.latest_question = retainedQuestion && retainedQuestion !== '[removed under retention policy]'
            ? retainedQuestion
            : null;
          usage.latest_company_id = interaction.account_id || null;
          usage.latest_company_name = accountNames.get(interaction.account_id) || 'Unknown company';
          usage.latest_interaction_at = interaction.created_at || null;
        }
        const company = usage.companies.get(interaction.account_id) || {
          account_id: interaction.account_id,
          company_name: accountNames.get(interaction.account_id) || 'Unknown company',
          question_count: 0,
          latest_seen_at: null
        };
        company.question_count += 1;
        if (!company.latest_seen_at) company.latest_seen_at = interaction.created_at || null;
        usage.companies.set(interaction.account_id, company);
        routeUsage.set(routeKey, usage);
      });
      const routes = (data || []).map((route) => {
        const requiredAgreements = route.risk_tier === 'HIGH' || route.response_mode === 'CLARIFY' ? 5 : 3;
        const usage = routeUsage.get(route.route_key);
        const companyUsage = usage
          ? Array.from(usage.companies.values()).sort((left, right) => (
            right.question_count - left.question_count
            || String(right.latest_seen_at || '').localeCompare(String(left.latest_seen_at || ''))
          ))
          : [];
        const previewDecision = applyAiInterpretation({
          knowledge_id: route.knowledge_id,
          decision: route.response_mode,
          answer_pattern_id: route.answer_pattern_id || null,
          clarification_requirement: route.clarification_requirement || null,
          confidence: Number(route.highest_confidence || 1)
        }, route.normalized_question, records, { candidates: [] });
        const presentedRoute = {
          ...route,
          required_agreements: requiredAgreements,
          ready_for_approval: Number(route.agreement_count || 0) >= requiredAgreements,
          company_window_days: companyWindowDays,
          company_count: companyUsage.length,
          company_usage: companyUsage,
          recent_question_count: usage?.recent_question_count || 0,
          latest_question: usage?.latest_question || null,
          latest_company_id: usage?.latest_company_id || null,
          latest_company_name: usage?.latest_company_name || null,
          latest_interaction_at: usage?.latest_interaction_at || null,
          preview: previewDecision ? {
            response_mode: previewDecision.response_mode,
            answer: previewDecision.answer || null,
            answer_structure: previewDecision.answer_structure || null,
            clarification_prompt: previewDecision.clarification_prompt || null,
            clarification_options: (previewDecision.clarification_options || []).map((option) => ({
              label: option.label,
              query: option.query
            })),
            more_info: previewDecision.more_info || null
          } : null
        };
        return { ...presentedRoute, review_reason: getAnswerMemoryReviewReason(presentedRoute) };
      });
      return res.status(200).json({
        routes,
        company_window_days: companyWindowDays,
        company_window_start: companyWindowStart,
        setup_required: false
      });
    } catch (error) {
      console.error('Manager RRA answer-memory list failed:', error);
      return res.status(500).json({ error: 'Unable to load learned answer routes.' });
    }
  });

  router.post('/answer-memory/:route_key/review', async (req, res) => {
    if (!authorizeReview(req)) {
      return res.status(403).json({ error: 'This staff role cannot change Answer Memory.' });
    }
    const action = String(req.body?.action || '').trim().toUpperCase();
    if (!['APPROVE', 'SUSPEND'].includes(action)) {
      return res.status(400).json({ error: 'Action must be APPROVE or SUSPEND.' });
    }
    try {
      const context = getRequestContext(req);
      const { data, error } = await supabase.rpc('review_driver_help_answer_memory', {
        p_route_key: req.params.route_key,
        p_action: action,
        p_reviewed_by: context.actorId
      });
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Learned answer route not found.' });
      return res.status(200).json({ route: data });
    } catch (error) {
      console.error('Manager RRA answer-memory review failed:', error);
      return res.status(500).json({ error: 'Unable to review this learned answer route.' });
    }
  });

  router.get('/overview', async (req, res) => {
    const accountId = globalOverview ? null : getRequestContext(req).accountId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    try {
      let interactionQuery = supabase
        .from('driver_help_interactions')
        .select('id, account_id, driver_id, question, response_mode, selected_knowledge_ids, selected_knowledge_versions, canonical_trace, retrieval_candidates, confidence, answer_snapshot, more_info_snapshot, escalation_message, interpretation_mode, interpretation_result, response_latency_ms, created_at');
      let unansweredQuery = supabase
        .from('driver_help_unanswered_questions')
        .select('id, account_id, driver_id, interaction_id, question, status, created_at, resolved_at, resolved_knowledge_id');
      let feedbackQuery = supabase
        .from('driver_help_feedback')
        .select('id, account_id, driver_id, interaction_id, rating, comment, created_at');
      let activeDriverQuery = supabase.from('drivers').select('id').eq('is_active', true);

      if (accountId) {
        interactionQuery = interactionQuery.eq('account_id', accountId);
        unansweredQuery = unansweredQuery.eq('account_id', accountId);
        feedbackQuery = feedbackQuery.eq('account_id', accountId);
        activeDriverQuery = activeDriverQuery.eq('account_id', accountId);
      }

      const [interactionResult, unansweredResult, feedbackResult, activeDriverResult, accountsResult] = await Promise.all([
        interactionQuery.order('created_at', { ascending: false }).limit(limit),
        unansweredQuery.order('created_at', { ascending: false }).limit(limit),
        feedbackQuery.order('created_at', { ascending: false }).limit(limit),
        activeDriverQuery,
        globalOverview
          ? supabase.from('accounts').select('id, company_name').order('company_name', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      const firstError = interactionResult.error || unansweredResult.error || feedbackResult.error || activeDriverResult.error || accountsResult.error;
      if (firstError) {
        if (isMissingTableError(firstError)) {
          return res.status(200).json({
            metrics: {
              total_questions: 0,
              active_drivers: 0,
              questions_per_active_driver: 0,
              approved_answers: 0,
              clarifications: 0,
              escalations: 0,
              feedback_count: 0,
              helpful_feedback: 0,
              negative_feedback: 0,
              feedback_response_rate: 0,
              helpful_rate: null,
              canonical_match_rate: 0,
              no_verified_answer_rate: 0,
              average_response_latency_ms: null,
              retrieval_failures: 0,
              ai_shadow_runs: 0,
              ai_shadow_valid_results: 0,
              ai_shadow_errors: 0,
              ai_shadow_usage: {
                input_tokens: 0,
                cached_input_tokens: 0,
                output_tokens: 0,
                reasoning_tokens: 0,
                total_tokens: 0,
                estimated_cost_usd: 0
              },
              ai_shadow_record_agreement_rate: null,
              ai_shadow_response_mode_agreement_rate: null,
              questions_by_category: {}
            },
            recent_interactions: [],
            unanswered_questions: [],
            recent_feedback: [],
            window_limit: limit,
            setup_required: true
          });
        }
        throw firstError;
      }

      const accountNames = new Map((accountsResult.data || []).map((account) => [
        account.id,
        account.company_name || 'Unnamed company'
      ]));
      const interactions = (interactionResult.data || []).map((interaction) => ({
        ...interaction,
        company_name: globalOverview
          ? accountNames.get(interaction.account_id) || 'Unknown company'
          : null
      }));
      const interactionsById = new Map(interactions.map((interaction) => [interaction.id, interaction]));
      const unansweredQuestions = (unansweredResult.data || []).map((entry) => ({
        ...entry,
        company_name: globalOverview ? accountNames.get(entry.account_id) || 'Unknown company' : null
      }));
      const feedback = (feedbackResult.data || []).map((entry) => ({
        ...entry,
        company_name: globalOverview ? accountNames.get(entry.account_id) || 'Unknown company' : null,
        question: interactionsById.get(entry.interaction_id)?.question || null,
        answer_snapshot: interactionsById.get(entry.interaction_id)?.answer_snapshot || null,
        selected_knowledge_ids: interactionsById.get(entry.interaction_id)?.selected_knowledge_ids || []
      }));
      const activeDriverCount = (activeDriverResult.data || []).length;
      const helpfulFeedbackCount = feedback.filter((row) => row.rating === 'up').length;
      const negativeFeedbackCount = feedback.filter((row) => row.rating === 'down').length;
      const measuredLatencies = interactions
        .map((row) => Number(row.response_latency_ms))
        .filter((value) => Number.isFinite(value) && value >= 0);
      const shadowRuns = interactions.filter((row) => (
        ['AI_SHADOW', 'AI_SHADOW_FALLBACK'].includes(row.interpretation_mode)
      ));
      const validShadowResults = shadowRuns.filter((row) => row.interpretation_result?.status === 'VALID');
      const shadowUsage = shadowRuns.reduce((totals, row) => {
        const usage = row.interpretation_result?.usage;
        if (!usage) return totals;
        totals.input_tokens += Number(usage.input_tokens || 0);
        totals.cached_input_tokens += Number(usage.cached_input_tokens || 0);
        totals.output_tokens += Number(usage.output_tokens || 0);
        totals.reasoning_tokens += Number(usage.reasoning_tokens || 0);
        totals.total_tokens += Number(usage.total_tokens || 0);
        totals.estimated_cost_usd += Number(usage.estimated_cost_usd || 0);
        return totals;
      }, {
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0
      });
      shadowUsage.estimated_cost_usd = Number(shadowUsage.estimated_cost_usd.toFixed(6));
      const questionsByCategory = interactions.reduce((counts, row) => {
        const category = row.canonical_trace?.[0]?.category_paths?.[0] || 'UNMATCHED';
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});
      return res.status(200).json({
        metrics: {
          total_questions: interactions.length,
          ...(globalOverview ? {
            companies: new Set(interactions.map((row) => row.account_id)).size,
            average_ai_response_latency_ms: (() => {
              const values = interactions.filter((row) => row.interpretation_mode === 'GROUNDED_AI').map((row) => Number(row.response_latency_ms)).filter(Number.isFinite);
              return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
            })(),
            average_learned_response_latency_ms: (() => {
              const values = interactions.filter((row) => row.interpretation_mode === 'LEARNED_ROUTE').map((row) => Number(row.response_latency_ms)).filter(Number.isFinite);
              return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
            })(),
            ai_calls_avoided: interactions.filter((row) => row.interpretation_mode === 'LEARNED_ROUTE' && row.interpretation_result?.ai_bypassed === true).length,
            estimated_ai_cost_usd: Number(interactions.reduce((sum, row) => sum + Number(row.interpretation_result?.usage?.estimated_cost_usd || 0), 0).toFixed(6))
          } : {}),
          active_drivers: activeDriverCount,
          questions_per_active_driver: activeDriverCount
            ? interactions.length / activeDriverCount
            : 0,
          approved_answers: interactions.filter((row) => row.response_mode === 'ANSWER').length,
          clarifications: interactions.filter((row) => row.response_mode === 'CLARIFY').length,
          escalations: interactions.filter((row) => row.response_mode === 'ESCALATE').length,
          feedback_count: feedback.length,
          helpful_feedback: helpfulFeedbackCount,
          negative_feedback: negativeFeedbackCount,
          feedback_response_rate: interactions.length ? feedback.length / interactions.length : 0,
          helpful_rate: feedback.length ? helpfulFeedbackCount / feedback.length : null,
          canonical_match_rate: interactions.length
            ? interactions.filter((row) => (row.selected_knowledge_ids || []).length > 0).length / interactions.length
            : 0,
          no_verified_answer_rate: interactions.length
            ? interactions.filter((row) => row.response_mode === 'ESCALATE').length / interactions.length
            : 0,
          average_response_latency_ms: measuredLatencies.length
            ? Math.round(measuredLatencies.reduce((sum, value) => sum + value, 0) / measuredLatencies.length)
            : null,
          retrieval_failures: interactions.filter((row) => (
            row.response_mode === 'ESCALATE' && !(row.selected_knowledge_ids || []).length
          )).length,
          ai_shadow_runs: shadowRuns.length,
          ai_shadow_valid_results: validShadowResults.length,
          ai_shadow_errors: shadowRuns.filter((row) => row.interpretation_result?.status === 'ERROR').length,
          ai_shadow_usage: shadowUsage,
          ai_shadow_record_agreement_rate: validShadowResults.length
            ? validShadowResults.filter((row) => row.interpretation_result.record_agreement === true).length / validShadowResults.length
            : null,
          ai_shadow_response_mode_agreement_rate: validShadowResults.length
            ? validShadowResults.filter((row) => row.interpretation_result.response_mode_agreement === true).length / validShadowResults.length
            : null,
          questions_by_category: questionsByCategory
        },
        recent_interactions: interactions,
        unanswered_questions: unansweredQuestions,
        recent_feedback: feedback,
        window_limit: limit
      });
    } catch (error) {
      console.error('Manager driver-help overview failed:', error);
      return res.status(500).json({ error: 'Unable to load knowledge activity.' });
    }
  });

  return router;
}

module.exports = {
  createManagerDriverHelpRouter
};
