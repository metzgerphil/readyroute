const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { createDriverHelpService, isMissingTableError } = require('../services/driverHelp');

function createManagerDriverHelpRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const service = options.service || createDriverHelpService({
    supabase,
    now: options.now
  });

  router.post('/query', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const sessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;
    if (question.length < 2 || question.length > 500) {
      return res.status(400).json({ error: 'Question must be between 2 and 500 characters.' });
    }

    try {
      const result = await service.answerQuestion({
        accountId: req.account.account_id,
        driverId: null,
        actorType: 'manager',
        actorId: req.account.manager_user_id || req.account.account_id,
        question,
        sessionId,
        includeDiagnostics: true
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
      const feedback = await service.saveFeedback({
        accountId: req.account.account_id,
        driverId: null,
        actorType: 'manager',
        actorId: req.account.manager_user_id || req.account.account_id,
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

  router.get('/overview', async (req, res) => {
    const accountId = req.account.account_id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    try {
      const [interactionResult, unansweredResult, feedbackResult, activeDriverResult] = await Promise.all([
        supabase
          .from('driver_help_interactions')
          .select('id, driver_id, question, response_mode, selected_knowledge_ids, selected_knowledge_versions, canonical_trace, retrieval_candidates, confidence, interpretation_mode, interpretation_result, response_latency_ms, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('driver_help_unanswered_questions')
          .select('id, driver_id, interaction_id, question, status, created_at, resolved_at, resolved_knowledge_id')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('driver_help_feedback')
          .select('id, driver_id, interaction_id, rating, comment, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('drivers')
          .select('id')
          .eq('account_id', accountId)
          .eq('is_active', true)
      ]);

      const firstError = interactionResult.error || unansweredResult.error || feedbackResult.error || activeDriverResult.error;
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

      const interactions = interactionResult.data || [];
      const unansweredQuestions = unansweredResult.data || [];
      const feedback = feedbackResult.data || [];
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
      const questionsByCategory = interactions.reduce((counts, row) => {
        const category = row.canonical_trace?.[0]?.category_paths?.[0] || 'UNMATCHED';
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {});
      return res.status(200).json({
        metrics: {
          total_questions: interactions.length,
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
