const express = require('express');

const { createDriverHelpService } = require('../services/driverHelp');
const {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService
} = require('../services/driverHelpPrivacy');

function createDriverHelpRouter(options = {}) {
  const router = express.Router();
  const service = options.service || createDriverHelpService({
    supabase: options.supabase,
    now: options.now
  });
  const privacyService = options.privacyService || (options.supabase
    ? createDriverHelpPrivacyService({ supabase: options.supabase, now: options.now })
    : null);

  function getActor(req) {
    return {
      accountId: req.driver.account_id,
      driverId: req.driver.driver_id,
      actorId: req.driver.auth_subject_id || req.driver.driver_id,
      actorType: req.driver.driver_mode_source === 'manager' ? 'manager' : 'driver'
    };
  }

  router.get('/privacy-preferences', async (req, res) => {
    try {
      const preference = privacyService
        ? await privacyService.getPreference(getActor(req))
        : { ai_processing_consent: false, policy_version: AI_CONSENT_POLICY_VERSION };
      return res.status(200).json({
        ...preference,
        current_policy_version: AI_CONSENT_POLICY_VERSION
      });
    } catch (error) {
      console.error('Driver help privacy preference lookup failed:', error);
      return res.status(500).json({ error: 'Privacy preferences could not be loaded right now.' });
    }
  });

  router.put('/privacy-preferences', async (req, res) => {
    if (typeof req.body?.ai_processing_consent !== 'boolean') {
      return res.status(400).json({ error: 'ai_processing_consent must be true or false.' });
    }
    try {
      const preference = await privacyService.setPreference({
        ...getActor(req),
        consent: req.body.ai_processing_consent,
        policyVersion: String(req.body?.policy_version || '')
      });
      return res.status(200).json({
        ...preference,
        current_policy_version: AI_CONSENT_POLICY_VERSION
      });
    } catch (error) {
      if (error?.code === 'POLICY_VERSION_MISMATCH') {
        return res.status(409).json({ error: error.message, current_policy_version: AI_CONSENT_POLICY_VERSION });
      }
      console.error('Driver help privacy preference update failed:', error);
      return res.status(500).json({ error: 'Privacy preferences could not be saved right now.' });
    }
  });

  router.post('/query', async (req, res) => {
    const question = String(req.body?.question || '').trim();
    const sessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;

    if (question.length < 1 || question.length > 500) {
      return res.status(400).json({ error: 'Question must be between 1 and 500 characters.' });
    }

    try {
      const actor = getActor(req);
      const preference = privacyService
        ? await privacyService.getPreference(actor)
        : { ai_processing_consent: true, policy_version: AI_CONSENT_POLICY_VERSION };
      const result = await service.answerQuestion({
        ...actor,
        question,
        sessionId,
        allowAiProcessing: preference.ai_processing_consent === true
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
