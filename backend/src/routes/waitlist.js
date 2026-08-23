const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { sendFeedbackEmail: defaultSendFeedbackEmail } = require('../services/waitlistEmail');

function normalizeText(value, maxLength = 240) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeBetaInterest(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }

  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }

  return null;
}

function buildSignupPayload(body = {}, req) {
  const name = normalizeText(body.name, 160);
  const email = normalizeEmail(body.email);

  if (!name) {
    return { error: 'Name is required.' };
  }

  if (!isValidEmail(email)) {
    return { error: 'A valid email is required.' };
  }

  const routeCount = normalizeInteger(body.routes ?? body.route_count);
  const driverCount = normalizeInteger(body.drivers ?? body.driver_count);
  const csaCount = normalizeInteger(body.csas ?? body.csa_count);
  const requestedBillingInterval = String(body.billing_interval || 'monthly').trim().toLowerCase();

  if ((body.routes ?? body.route_count) && routeCount === null) {
    return { error: 'Number of routes must be a whole number.' };
  }

  if ((body.drivers ?? body.driver_count) && driverCount === null) {
    return { error: 'Number of drivers must be a whole number.' };
  }

  if ((body.csas ?? body.csa_count) && csaCount === null) {
    return { error: 'Number of CSAs must be a whole number.' };
  }

  return {
    payload: {
      name,
      email,
      phone_number: normalizeText(body.phone ?? body.phone_number, 80),
      manager_name: normalizeText(body.manager_name ?? body.primary_manager_name ?? body.name, 160),
      manager_phone_number: normalizeText(body.manager_phone_number ?? body.phone ?? body.phone_number, 80),
      cxpc_phone_number: normalizeText(body.cxpc_phone_number, 80),
      csa_number: normalizeText(body.csa_number, 80),
      company_csa: normalizeText(body.company ?? body.company_csa, 200),
      role: normalizeText(body.role, 120),
      route_count: routeCount,
      driver_count: driverCount,
      csa_count: csaCount,
      current_routing_tool: normalizeText(body.tool ?? body.current_routing_tool, 160),
      interested_in_beta: normalizeBetaInterest(body.beta ?? body.interested_in_beta),
      ai_processing_authorized: body.ai_processing_authorized === true,
      ai_processing_policy_version: normalizeText(body.ai_processing_policy_version, 80),
      ai_processing_authorized_at: body.ai_processing_authorized === true ? new Date().toISOString() : null,
      billing_interval: ['monthly', 'annual'].includes(requestedBillingInterval) ? requestedBillingInterval : 'monthly',
      source_page: normalizeText(body.source_page, 500),
      user_agent: normalizeText(req.get('user-agent'), 500),
      updated_at: new Date().toISOString()
    }
  };
}

const SIGNUP_URL = 'https://readyroute.org/signup';
const SIGNUP_FIELD_STEPS = Object.freeze({
  company: 1,
  role: 1,
  cxpc_phone_number: 2,
  csa_number: 2,
  manager_name: 2,
  manager_phone_number: 2,
  drivers: 2
});

function validateCompanySignup(payload = {}) {
  const missingFields = [];
  if (!payload.company_csa) missingFields.push('company');
  if (!payload.role) missingFields.push('role');
  if (!payload.cxpc_phone_number) missingFields.push('cxpc_phone_number');
  if (!payload.csa_number) missingFields.push('csa_number');
  if (!payload.manager_name) missingFields.push('manager_name');
  if (!payload.manager_phone_number) missingFields.push('manager_phone_number');
  if (!Number.isInteger(payload.driver_count) || payload.driver_count < 1) missingFields.push('drivers');

  if (missingFields.length) {
    return {
      error: 'This signup page is missing required company fields. Your entries have not been submitted. Continue with the current three-step signup form.',
      code: 'SIGNUP_DETAILS_REQUIRED',
      required_step: Math.min(...missingFields.map((field) => SIGNUP_FIELD_STEPS[field])),
      missing_fields: missingFields,
      signup_url: SIGNUP_URL
    };
  }

  if (!['authorized officer', 'business contact'].includes(String(payload.role).toLowerCase())) {
    return {
      error: 'Choose Authorized Officer (AO) or Business Contact (BC) to continue.',
      code: 'SIGNUP_ROLE_REQUIRED',
      required_step: 1,
      missing_fields: ['role'],
      signup_url: SIGNUP_URL
    };
  }

  return null;
}

function buildFeedbackPayload(body = {}, req) {
  const name = normalizeText(body.name, 160);
  const email = normalizeEmail(body.email);
  const fedexPosition = normalizeText(body.position ?? body.fedex_position, 160);
  const feedback = normalizeText(body.feedback, 4000);

  if (!name) {
    return { error: 'Name is required.' };
  }

  if (!isValidEmail(email)) {
    return { error: 'A valid email is required.' };
  }

  if (!fedexPosition) {
    return { error: 'Position with FedEx is required.' };
  }

  if (!feedback || feedback.length < 10) {
    return { error: 'Feedback must be at least 10 characters.' };
  }

  return {
    payload: {
      name,
      email,
      fedexPosition,
      feedback,
      sourcePage: normalizeText(body.source_page, 500),
      userAgent: normalizeText(req.get('user-agent'), 500)
    }
  };
}

function createWaitlistRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const sendFeedbackEmail = options.sendFeedbackEmail || defaultSendFeedbackEmail;

  router.post('/early-access', async (req, res) => {
    try {
      const { payload, error } = buildSignupPayload(req.body, req);

      if (error) {
        return res.status(400).json({ error });
      }

      const validationError = validateCompanySignup(payload);
      if (validationError) return res.status(400).json(validationError);

      const { error: upsertError } = await supabase
        .from('early_access_signups')
        .upsert(payload, { onConflict: 'email' })
        .select('id')
        .single();

      if (upsertError) {
        console.error('Early access signup failed:', upsertError);
        return res.status(500).json({ error: 'Unable to save early access signup.' });
      }

      return res.status(201).json({ ok: true, awaiting_payment: true });
    } catch (error) {
      console.error('Early access endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to save company details.' });
    }
  });

  router.post('/feedback', async (req, res) => {
    try {
      const { payload, error } = buildFeedbackPayload(req.body, req);

      if (error) {
        return res.status(400).json({ error });
      }

      const delivery = await sendFeedbackEmail(payload);

      if (delivery?.skipped) {
        console.error('ReadyRoute feedback email skipped:', delivery.reason);
        return res.status(503).json({ error: 'Feedback email service is not configured yet.' });
      }

      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error('ReadyRoute feedback endpoint failed:', error);
      return res.status(500).json({ error: 'Unable to send feedback right now.' });
    }
  });

  return router;
}

module.exports = createWaitlistRouter();
module.exports.createWaitlistRouter = createWaitlistRouter;
module.exports.buildFeedbackPayload = buildFeedbackPayload;
module.exports.buildSignupPayload = buildSignupPayload;
module.exports.validateCompanySignup = validateCompanySignup;
