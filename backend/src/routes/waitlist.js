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
      company_csa: normalizeText(body.company ?? body.company_csa, 200),
      role: normalizeText(body.role, 120),
      route_count: routeCount,
      driver_count: driverCount,
      csa_count: csaCount,
      current_routing_tool: normalizeText(body.tool ?? body.current_routing_tool, 160),
      interested_in_beta: normalizeBetaInterest(body.beta ?? body.interested_in_beta),
      billing_interval: ['monthly', 'annual'].includes(requestedBillingInterval) ? requestedBillingInterval : 'monthly',
      source_page: normalizeText(body.source_page, 500),
      user_agent: normalizeText(req.get('user-agent'), 500),
      updated_at: new Date().toISOString()
    }
  };
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

      if (!payload.company_csa || !payload.phone_number || !['owner', 'business contact'].includes(String(payload.role || '').toLowerCase()) || !Number.isInteger(payload.driver_count) || payload.driver_count < 1) {
        return res.status(400).json({ error: 'Company, phone, Owner or Business contact role, and at least one expected active driver are required.' });
      }

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
module.exports.buildSignupPayload = buildSignupPayload;
module.exports.createWaitlistRouter = createWaitlistRouter;
module.exports.buildFeedbackPayload = buildFeedbackPayload;
module.exports.buildSignupPayload = buildSignupPayload;
