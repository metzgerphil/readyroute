const express = require('express');

const { createDriverHelpService } = require('../services/driverHelp');
const { createDriverHelpAiComposer } = require('../services/driverHelpAiComposer');

function createDriverHelpRouter(options = {}) {
  const router = express.Router();
  const configuredComposer = options.composeGroundedAnswer !== undefined
    ? options.composeGroundedAnswer
    : createDriverHelpAiComposer({
        env: options.env || process.env,
        fetchImpl: options.fetchImpl
      });
  const service = options.service || createDriverHelpService({
    supabase: options.supabase,
    now: options.now,
    composeGroundedAnswer: configuredComposer
  });

  router.post('/query', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const sessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;

    if (question.length < 2 || question.length > 500) {
      return res.status(400).json({ error: 'Question must be between 2 and 500 characters.' });
    }

    try {
      const result = await service.answerQuestion({
        accountId: req.driver.account_id,
        driverId: req.driver.driver_id,
        actorId: req.driver.auth_subject_id || req.driver.driver_id,
        actorType: req.driver.driver_mode_source === 'manager' ? 'manager' : 'driver',
        question,
        sessionId
      });
      return res.status(200).json(result);
    } catch (error) {
      console.error('Driver help query failed:', error);
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
        accountId: req.driver.account_id,
        driverId: req.driver.driver_id,
        actorId: req.driver.auth_subject_id || req.driver.driver_id,
        actorType: req.driver.driver_mode_source === 'manager' ? 'manager' : 'driver',
        interactionId: req.params.interaction_id,
        rating,
        comment
      });
      if (!feedback) {
        return res.status(404).json({ error: 'Interaction not found.' });
      }
      return res.status(200).json({ feedback });
    } catch (error) {
      console.error('Driver help feedback failed:', error);
      return res.status(500).json({ error: 'Feedback could not be saved right now.' });
    }
  });

  return router;
}

module.exports = {
  createDriverHelpRouter
};
