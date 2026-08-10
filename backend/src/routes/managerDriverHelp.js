const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { isMissingTableError } = require('../services/driverHelp');

function createManagerDriverHelpRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;

  router.get('/overview', async (req, res) => {
    const accountId = req.account.account_id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

    try {
      const [interactionResult, unansweredResult, feedbackResult, activeDriverResult] = await Promise.all([
        supabase
          .from('driver_help_interactions')
          .select('id, driver_id, question, response_mode, selected_knowledge_ids, selected_knowledge_versions, canonical_trace, retrieval_candidates, confidence, response_latency_ms, created_at')
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
              negative_feedback: 0,
              canonical_match_rate: 0,
              no_verified_answer_rate: 0,
              average_response_latency_ms: null,
              retrieval_failures: 0,
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
      const measuredLatencies = interactions
        .map((row) => Number(row.response_latency_ms))
        .filter((value) => Number.isFinite(value) && value >= 0);
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
          negative_feedback: feedback.filter((row) => row.rating === 'down').length,
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
