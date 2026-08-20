const express = require('express');

const { createDriverHelpService } = require('../services/driverHelp');
const {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService
} = require('../services/driverHelpPrivacy');

function createDriverHelpRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase;
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

  function requestedCompanyContact(question) {
    const normalized = question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const asksForContact = /\b(call|contact|number|phone|reach|get ahold|talk to)\b/.test(normalized);
    if (!asksForContact) return null;
    if (/\bcxpc\b|customer service pickup coordinator/.test(normalized)) return 'cxpc';
    if (/\bcsa\b|customer service agent/.test(normalized)) return 'csa';
    if (/\b(my|our|the) manager\b|\bmanager(?: s)? (number|phone|contact)\b/.test(normalized)) return 'manager';
    return null;
  }

  async function answerCompanyContactQuestion({ req, question, contactType }) {
    if (!supabase) return null;
    const { data: account, error } = await supabase
      .from('accounts')
      .select('rra_cxpc_phone_number, rra_csa_phone_number, rra_primary_manager_name, rra_primary_manager_phone_number')
      .eq('id', req.driver.account_id)
      .maybeSingle();
    if (error) throw error;

    const contact = contactType === 'cxpc'
      ? { label: 'local CXPC', name: null, phone: account?.rra_cxpc_phone_number }
      : contactType === 'csa'
        ? { label: 'local CSA', name: null, phone: account?.rra_csa_phone_number }
        : { label: 'manager', name: account?.rra_primary_manager_name, phone: account?.rra_primary_manager_phone_number };
    const hasContact = Boolean(contact.phone);
    const answer = hasContact
      ? `${contact.name ? `${contact.name}, your ${contact.label},` : `Your ${contact.label} number`} is ${contact.phone}.`
      : `RRA does not have your company's ${contact.label} phone number yet.`;
    const actor = getActor(req);
    const responseMode = hasContact ? 'ANSWER' : 'ESCALATE';
    const interactionInsert = await supabase.from('driver_help_interactions').insert({
      account_id: actor.accountId,
      driver_id: actor.actorType === 'driver' ? actor.driverId : null,
      actor_type: actor.actorType,
      actor_id: actor.actorId,
      question,
      normalized_question: question.toLowerCase().replace(/\s+/g, ' ').trim(),
      response_mode: responseMode,
      selected_knowledge_ids: [],
      selected_knowledge_versions: [],
      retrieval_candidates: [],
      answer_snapshot: hasContact ? answer : null,
      more_info_snapshot: 'This contact is maintained by your company in ReadyRoute settings.',
      clarification_options: [],
      escalation_message: hasContact ? null : 'Ask your manager to add the required local contact in Company settings.'
    }).select('id').single();
    if (interactionInsert.error) throw interactionInsert.error;

    return {
      session_id: null,
      interaction_id: interactionInsert.data?.id || null,
      response_mode: responseMode,
      answer_type: 'COMPANY_CONTACT',
      answer: hasContact ? answer : null,
      more_info: 'This contact is maintained by your company in ReadyRoute settings.',
      answer_structure: hasContact ? {
        direct_answer: answer,
        steps: [`Call ${contact.phone}.`],
        watch_for: 'Use this number for your current ReadyRoute company account.'
      } : null,
      images: [],
      composition_mode: 'COMPANY_ACCOUNT',
      interpretation_mode: 'DETERMINISTIC',
      clarification_prompt: null,
      clarification_options: [],
      escalation_message: hasContact ? null : 'Ask your manager to add the required local contact in Company settings.',
      trace: []
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
    if (req.body?.notice_seen !== true) {
      return res.status(400).json({ error: 'notice_seen must be true.' });
    }
    try {
      const preference = await privacyService.acknowledgeNotice({
        ...getActor(req),
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

    if (question.length < 2 || question.length > 500) {
      return res.status(400).json({ error: 'Question must be between 2 and 500 characters.' });
    }

    try {
      const contactType = requestedCompanyContact(question);
      if (contactType) {
        const contactAnswer = await answerCompanyContactQuestion({ req, question, contactType });
        if (contactAnswer) return res.status(200).json(contactAnswer);
      }
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
