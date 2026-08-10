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
      const [interactionResult, unansweredResult, feedbackResult] = await Promise.all([
        supabase
          .from('driver_help_interactions')
          .select('id, driver_id, question, response_mode, selected_knowledge_ids, selected_knowledge_versions, confidence, created_at')
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
          .limit(limit)
      ]);

      const firstError = interactionResult.error || unansweredResult.error || feedbackResult.error;
      if (firstError) {
        if (isMissingTableError(firstError)) {
          return res.status(200).json({
            metrics: { total_questions: 0, approved_answers: 0, clarifications: 0, escalations: 0, negative_feedback: 0 },
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
      return res.status(200).json({
        metrics: {
          total_questions: interactions.length,
          approved_answers: interactions.filter((row) => row.response_mode === 'ANSWER').length,
          clarifications: interactions.filter((row) => row.response_mode === 'CLARIFY').length,
          escalations: interactions.filter((row) => row.response_mode === 'ESCALATE').length,
          negative_feedback: feedback.filter((row) => row.rating === 'down').length
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
